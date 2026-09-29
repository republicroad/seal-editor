import type { CustomFunctionTool, CustomNodeNamespace } from './custom-node-types';

/*
 * 版本迁移器（docs/design/dedicated-node-registry-design.md §5，实践 6 落地）。
 *
 * 节点里存的是历史时刻的域契约，服务端注册表持有当前契约。两类漂移分级对策：
 * - 绑定漂移（非破坏）：validate + 报告（**绝不猜测改写**——位置绑定重映射需要
 *   历史参数序，无锚即无依据）；新建节点建议具名调用形态（韧性优先于迁移）。
 * - 破坏性演化：显式迁移链（Grafana migrator 同型）——宿主/域作者经
 *   MigrationChainInput 声明，版本锚 = 节点 config.__meta__.packVersion
 *   （seed 时写入 UdfPackMeta.version；缺锚 = validate-only，绝不猜测）。
 *
 * 纯函数：宿主在 value 注入前显式调用，report 是设计时变更日志的天然数据源
 * （治理窗批次 4）。零 zen-udf 改动（消费现有 parametersSchema 与 meta.version）。
 */

export type GraphNodeLike = {
  id: string;
  type?: string;
  name?: string;
  content?: { kind?: string; config?: { expressions?: unknown[]; __meta__?: Record<string, unknown> } };
};

export type GraphLike = { nodes?: GraphNodeLike[]; edges?: unknown[] };

export type MigrationChain = {
  /** 目标节点 kind（专用节点 KIND，如 'http_request'） */
  kind: string;
  /** 起始 pack 版本：节点锚 < currentVersion 时按升序执行 */
  from: string;
  describe: string;
  migrate: (
    config: NonNullable<GraphNodeLike['content']>['config'],
    ctx: { kind: string },
  ) => NonNullable<GraphNodeLike['content']>['config'];
};

export type MigrationReportEntry = {
  nodeId: string;
  kind?: string;
  severity: 'migrated' | 'error' | 'warning';
  message: string;
};

export type MigrateGraphResult = {
  graph: GraphLike;
  report: MigrationReportEntry[];
};

const compareVersions = (a: string, b: string): number => {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

const toolsByName = (schema: CustomNodeNamespace[] | undefined): Map<string, CustomFunctionTool> => {
  const map = new Map<string, CustomFunctionTool>();
  for (const ns of schema ?? []) {
    for (const tool of ns.tools ?? []) {
      map.set(tool.name, tool);
    }
  }
  return map;
};

/** 表达式引用的函数名（三形态：数组位置 / legacy ';;' 串 / 命名 $call） */
const expressionFunctionName = (value: unknown): string | undefined => {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  if (typeof value === 'string') return value.split(';;')[0] || undefined;
  if (value && typeof value === 'object' && '$call' in (value as Record<string, unknown>)) {
    const call = (value as Record<string, unknown>)['$call'];
    return typeof call === 'string' ? call : undefined;
  }
  return undefined;
};

export const migrateGraph = (input: {
  graph: GraphLike;
  /** 当前载荷（漂移校验的事实源；缺省跳过校验） */
  schema?: CustomNodeNamespace[];
  /** 各 kind 当前 pack 版本（UdfPackMeta.version；缺省跳过迁移链） */
  currentVersions?: Record<string, string>;
  /** 显式迁移链（破坏性演化；Grafana migrator 同型） */
  chains?: MigrationChain[];
}): MigrateGraphResult => {
  const { graph, schema, currentVersions, chains } = input;
  const report: MigrationReportEntry[] = [];
  const tools = toolsByName(schema);

  const nodes = (graph.nodes ?? []).map((node) => {
    if (node.type !== 'customNode' || !node.content) {
      return node;
    }
    const kind = node.content.kind;
    const config = node.content.config;
    // ① 破坏性演化的显式迁移链（有锚 + 有当前版本 + 有链才执行；缺锚 validate-only）
    let nextConfig = config;
    const anchor = config?.__meta__?.packVersion;
    const chain = chains?.find((c) => c.kind === kind);
    const current = currentVersions?.[kind ?? ''];
    if (chain && typeof anchor === 'string' && typeof current === 'string' && compareVersions(anchor, current) < 0) {
      const pending = chain && compareVersions(chain.from, current) <= 0 ? [chain] : [];
      for (const m of pending) {
        nextConfig = m.migrate(nextConfig, { kind: kind ?? '' }) ?? nextConfig;
        report.push({ nodeId: node.id, kind, severity: 'migrated', message: m.describe });
      }
      nextConfig = { ...nextConfig, __meta__: { ...(nextConfig?.__meta__ ?? {}), packVersion: current } };
    } else if (chain && typeof anchor !== 'string') {
      report.push({
        nodeId: node.id,
        kind,
        severity: 'warning',
        message: '节点缺少 packVersion 锚（存量图）——validate-only，未执行迁移链',
      });
    }

    // ② 绑定漂移校验（只报告，不改写——位置重映射需历史参数序，无依据不猜测）。
    // 校验对象 = 迁移后的最终配置（迁移已修复的绑定不产生假漂移报告）。
    if (schema && Array.isArray(nextConfig?.expressions)) {
      for (const expr of nextConfig!.expressions!) {
        const value = (expr as { value?: unknown })?.value;
        const fn = expressionFunctionName(value);
        if (!fn) continue;
        const tool = tools.get(fn);
        if (!tool) {
          report.push({
            nodeId: node.id,
            kind,
            severity: 'error',
            message: `引用的函数 '${fn}' 不在当前目录（被过滤/下线/改名）`,
          });
          continue;
        }
        const paramCount = Object.keys(tool.parameters?.properties ?? {}).length;
        if (Array.isArray(value) && value.length - 1 !== paramCount) {
          report.push({
            nodeId: node.id,
            kind,
            severity: 'warning',
            message: `函数 '${fn}' 位置参数数不匹配：节点 ${value.length - 1} 个，当前契约 ${paramCount} 个`,
          });
        }
      }
    }

    if (nextConfig !== config) {
      return { ...node, content: { ...node.content, config: nextConfig } };
    }
    return node;
  });

  return { graph: { ...graph, nodes }, report };
};
