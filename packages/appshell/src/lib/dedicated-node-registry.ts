import type { CustomNodeSpecification } from '@republicroad/seal-editor';

import { cryptoNode } from '../components/custom-node/crypto-node';
import { currentDateNode } from '../components/custom-node/current-date-node';
import { httpRequestNode } from '../components/custom-node/http-request-node';
import { queryListNode } from '../components/custom-node/query-list-node';
import type { CustomFunctionTool, CustomNodeNamespace } from './custom-node-types';

/*
 * 专用函数注册表（docs/design/dedicated-node-registry-design.md，轨道 B Phase 2）。
 *
 * 取代旧 `filterOverridden` 的函数名硬编码 Set：接管改为「能力校验 + rank 评分」
 * （业界实践 2，JSON Forms tester 同型）——服务端域形状漂移时 tester 失配，
 * 工具回落通用容器（明确降级）而非被硬编码遮蔽。
 *
 * 单位说明：设计文档以 namespace 为 tester 单位，落地修正为 **tool 级**——现状
 * 接管语义是「域内个别函数被专用节点接管，其余工具仍走通用容器」（如 http 域的
 * http_request 被接管，同域其他工具照常容器化）。
 */

export type DedicatedFunctionRegistration = {
  /** 被接管的函数名（全局唯一，同旧 overriddenFunctions 语义） */
  functionName: string;
  /** 能力校验 + 优先级：校验载荷工具形状是否与本专用节点匹配，返回 rank；
   *  返回 0 = 失配（工具回落通用容器）。最高分胜出，注册期同分报错。 */
  tester: (tool: CustomFunctionTool) => number;
  /** 本注册提供的专用节点（现四静态节点迁移至此） */
  node: CustomNodeSpecification<object, any>;
};

const hasProps = (tool: CustomFunctionTool, names: string[]): boolean => {
  const props = tool.parameters?.properties ?? {};
  return names.every((n) => n in props);
};

export const dedicatedFunctionRegistry: DedicatedFunctionRegistration[] = [
  {
    functionName: 'http_request',
    // 形状锚：出网请求的 method/url 必备参数（漂移即失配回落通用容器）
    tester: (tool) => (hasProps(tool, ['method', 'url']) ? 100 : 0),
    node: httpRequestNode,
  },
  {
    functionName: 'crypto',
    tester: (tool) => (hasProps(tool, ['algorithm', 'encoding']) ? 100 : 0),
    node: cryptoNode,
  },
  {
    functionName: 'current_date',
    tester: () => 100, // 无参工具：名称命中即可
    node: currentDateNode,
  },
  {
    functionName: 'roster',
    tester: (tool) => (hasProps(tool, ['roster']) ? 100 : 0),
    node: queryListNode,
  },
];

/**
 * 按注册表对载荷去重：tester 胜出的工具从 schema 驱动结果中剔除（专用节点覆盖），
 * 失配/未注册工具保留（通用容器，明确降级）。返回接管命中的工具名集合（诊断用）。
 */
export const dedupeByDedicatedRegistry = (
  schema: CustomNodeNamespace[],
  registry: DedicatedFunctionRegistration[],
): { schema: CustomNodeNamespace[]; takenOver: string[] } => {
  const takenOver: string[] = [];
  const out = schema
    .map((namespace) => ({
      ...namespace,
      tools: (namespace.tools ?? []).filter((tool) => {
        const reg = registry.find((r) => r.functionName === tool.name);
        if (!reg) return true;
        const matched = reg.tester(tool) > 0;
        if (matched) takenOver.push(tool.name);
        return !matched;
      }),
    }))
    .filter((namespace) => namespace.tools.length > 0);
  return { schema: out, takenOver };
};

/** 载荷中失去支撑的专用节点 kind 清单（诊断：接管函数被租户过滤/下线，旧图降级） */
export const unsupportedDedicatedNodes = (
  schema: CustomNodeNamespace[],
  registry: DedicatedFunctionRegistration[],
): string[] =>
  registry
    .filter((reg) => !schema.some((ns) => (ns.tools ?? []).some((tool) => tool.name === reg.functionName)))
    .map((reg) => reg.node.kind);
