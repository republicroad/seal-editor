import type { CustomNodeSpecification } from './custom-node';

/**
 * ADR-017 §2 · 编辑接管层注册表解析器。
 *
 * 优先级矩阵（固定，不得由宿主改写）：
 *   ① 内建五节点永远优先——本解析器只管辖 customNode 域（调用方在内建
 *      分支之后到达，结构性保证不可劫持）；
 *   ② kind 精确匹配组按 rank 降序——显式声明归属压过模式匹配；
 *   ③ tester 谓词组按 rank 降序——非 kind 可判定的接管（同 kind 多代
 *      编辑器、按 config 形态分流）；
 *   ④ 同 rank 按声明序（稳定排序，宿主数组顺序不再影响语义）；
 *   ⑤ 开发模式同分冲突 console.warn；tester 抛异常按不匹配处理（单
 *      pack 故障隔离）。
 *
 * rank 惯例：常规 pack 不设（=0）；兜底/兼容 pack 负值；官方覆盖正值。
 */

/** tester 谓词上下文——只读快照，pack 不得改写。 */
export type NodeMatchContext = {
  /** 节点 kind（文档模型 content.kind / RF data.kind），未知为空串 */
  kind: string;
  /** 节点 type（文档模型恒为 'customNode'） */
  type: string;
  /** 节点 config（content.config，形状由 pack 的 parametersSchema 定义） */
  config: unknown;
  /** 消费点持有的原始节点引用（形态随位点：文档节点 / RF data），只读 */
  node: unknown;
};

/** 各消费点节点形态归一后的解析入参——kind 必备，其余可选透传。 */
export type CustomNodeRef = {
  kind?: unknown;
  type?: unknown;
  config?: unknown;
  node?: unknown;
};

const isDev = (): boolean => {
  try {
    return import.meta.env?.DEV === true;
  } catch {
    return false;
  }
};

const warnConflict = <C extends string>(group: Array<CustomNodeSpecification<object, C>>, scope: string): void => {
  console.warn(
    `[seal-editor] resolveCustomNode: ${group.length} specs tie on rank for ${scope} ` +
      `(kinds: ${group.map((spec) => spec.kind).join(', ')}) — declaration order wins; ` +
      'declare explicit `rank` to make precedence deterministic.',
  );
};

const byRankDesc = <C extends string>(a: CustomNodeSpecification<object, C>, b: CustomNodeSpecification<object, C>) =>
  (b.rank ?? 0) - (a.rank ?? 0);

export function resolveCustomNode<C extends string>(
  customNodes: ReadonlyArray<CustomNodeSpecification<object, C>> | undefined,
  ref: CustomNodeRef,
): CustomNodeSpecification<object, C> | undefined {
  const all = Array.isArray(customNodes) ? customNodes : [];
  if (all.length === 0) return undefined;

  const kind = typeof ref.kind === 'string' && ref.kind ? ref.kind : undefined;
  const ctx: NodeMatchContext = {
    kind: kind ?? '',
    type: typeof ref.type === 'string' ? ref.type : '',
    config: ref.config,
    node: ref.node,
  };

  // ② kind 精确组
  if (kind) {
    const exact = all.filter((spec) => spec.kind === kind);
    if (exact.length > 0) {
      if (exact.length > 1) {
        exact.sort(byRankDesc);
        if (isDev() && exact[0].rank === exact[1].rank) warnConflict(exact, `kind "${kind}"`);
      }
      return exact[0];
    }
  }

  // ③ tester 谓词组（异常按不匹配——单 pack 故障不拖垮编辑器）
  const matched: Array<CustomNodeSpecification<object, C>> = [];
  for (const spec of all) {
    if (typeof spec.tester !== 'function') continue;
    try {
      if (spec.tester(ctx)) matched.push(spec);
    } catch {
      /* 不匹配 */
    }
  }
  if (matched.length === 0) return undefined;
  if (matched.length > 1) {
    matched.sort(byRankDesc);
    if (isDev() && matched[0].rank === matched[1].rank) warnConflict(matched, `tester match on kind "${kind}"`);
  }
  return matched[0];
}

/** pack 级声明（ADR-017 §3 M4，可选糖）——meta 注入 + 迁移链预留槽。 */
export type CustomNodePackMigration = {
  /** 起始 pack 版本锚（config.__meta__.packVersion 低于当前版本时执行） */
  from: string;
  /** 迁移说明（人读，审计/变更日志数据源） */
  describe: string;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
};

export type CustomNodePack = {
  namespace: string;
  version: string;
  license?: 'oss' | 'proprietary';
  specs: Array<CustomNodeSpecification<object, string>>;
  /** 版本迁移链预留（dedicated-node-registry 设计档 §5，治理窗 phase-2 ②） */
  migrations?: CustomNodePackMigration[];
};

/**
 * pack 声明糖：把 ADR-009 meta（origin/version/license）从 per-spec 提升为
 * pack 级自动注入——spec 已带 meta 时 spec 值优先（显式覆盖包级）。直接传
 * spec 数组仍完全合法，本糖不做强制。
 */
export function definePack(pack: {
  namespace: string;
  version: string;
  license?: 'oss' | 'proprietary';
  specs: Array<CustomNodeSpecification<object, string>>;
  migrations?: CustomNodePackMigration[];
}): CustomNodePack {
  return {
    namespace: pack.namespace,
    version: pack.version,
    license: pack.license,
    migrations: pack.migrations,
    specs: pack.specs.map((spec) => ({
      ...spec,
      meta: {
        origin: 'extension',
        version: pack.version,
        license: pack.license ?? 'oss',
        ...spec.meta,
      },
    })),
  };
}
