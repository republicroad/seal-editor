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

/**
 * A1 死行检测：Run all 报告的命中规则集合 → 从未被任何 fixture 命中的行 id
 * （无 _id 的行跳过；报告是运行时点快照，运行后新增的行也计入死行——以
 * 「上次 Run all」为语境，UI 层标注）。
 */
export const deriveDeadRowIds = (
  rules: Array<{ _id?: unknown } | undefined> | undefined,
  hitRuleIds: Set<string>,
): string[] => {
  const dead: string[] = [];
  for (const rule of rules ?? []) {
    const id = rule?._id;
    if (typeof id === 'string' && id.length > 0 && !hitRuleIds.has(id)) {
      dead.push(id);
    }
  }
  return dead;
};
