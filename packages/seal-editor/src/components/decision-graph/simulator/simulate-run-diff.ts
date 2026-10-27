import type { Simulation } from './simulation.types';

/**
 * 两次运行的命中路径 diff（六铁律「运行可对比」）：节点集差 + 同节点规则行差。
 * 规则行取 dt/switch 类节点的 traceData.rule._id（单对象与多命中数组两形态）。
 */
export type RunPathDiff = {
  nodesOnlyInBase: string[];
  nodesOnlyInCompare: string[];
  /** 共有节点中规则行序列不一致的（dt 多命中序敏感——first 策略下即命中行不同） */
  ruleDiffs: Array<{ nodeId: string; baseRuleIds: string[]; compareRuleIds: string[] }>;
};

const nodeIdsOf = (run?: Simulation): string[] => Object.keys(run?.result?.trace ?? {});

const ruleIdsOf = (run: Simulation | undefined, nodeId: string): string[] => {
  const traceData = run?.result?.trace?.[nodeId]?.traceData;
  const entries = Array.isArray(traceData) ? traceData : traceData ? [traceData] : [];
  return entries
    .map((entry) => (entry as { rule?: { _id?: string } }).rule?._id)
    .filter((value): value is string => Boolean(value));
};

export const diffRunPaths = (base?: Simulation, compare?: Simulation): RunPathDiff => {
  const baseNodes = new Set(nodeIdsOf(base));
  const compareNodes = new Set(nodeIdsOf(compare));
  const nodesOnlyInBase = [...baseNodes].filter((nodeId) => !compareNodes.has(nodeId));
  const nodesOnlyInCompare = [...compareNodes].filter((nodeId) => !baseNodes.has(nodeId));
  const ruleDiffs = [...baseNodes]
    .filter((nodeId) => compareNodes.has(nodeId))
    .flatMap((nodeId) => {
      const baseRuleIds = ruleIdsOf(base, nodeId);
      const compareRuleIds = ruleIdsOf(compare, nodeId);
      return JSON.stringify(baseRuleIds) === JSON.stringify(compareRuleIds)
        ? []
        : [{ nodeId, baseRuleIds, compareRuleIds }];
    });

  return { nodesOnlyInBase, nodesOnlyInCompare, ruleDiffs };
};

/** 输出规范化文本（错误运行取 error 文本——对比错误与正常输出同样有意义） */
export const runOutputText = (run?: Simulation): string => {
  if (!run) {
    return 'null';
  }
  // Simulation 无 ok 字段（那是 runs entry 级的）——成功与否按 result 存在性判
  if (!run.result) {
    return JSON.stringify(run.error ?? 'unknown error', null, 2);
  }
  return JSON.stringify(run.result.result ?? null, null, 2);
};

export const runOutputsEqual = (base?: Simulation, compare?: Simulation): boolean =>
  runOutputText(base) === runOutputText(compare);
