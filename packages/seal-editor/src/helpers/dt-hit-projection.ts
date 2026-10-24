/**
 * A3（dt-instant-eval-badge §T2）：simulator trace → 命中规则 id 集合。
 *
 * traceData = 单条或数组（hitPolicy first 单条 / collect 多条），每条
 * { index, reference_map, rule: { _id, ... } }——既有 activeRuleId 只取
 * debugIndex 选中的一条，本投影取全量集合（collect 多行命中可见）。
 * 纯模块（无组件依赖），table.tsx 与单测共用。
 */
export const deriveHitRuleIds = (traceData: unknown): Set<string> => {
  const entries = Array.isArray(traceData) ? traceData : traceData != null ? [traceData] : [];
  const ids = new Set<string>();
  for (const entry of entries) {
    const ruleId = (entry as { rule?: { _id?: unknown } } | undefined)?.rule?._id;
    if (typeof ruleId === 'string' && ruleId.length > 0) {
      ids.add(ruleId);
    }
  }
  return ids;
};
