/**
 * D2：Run all 后 dt 主表的列级命中统计——从 fixturesRun 报告的规则级命中
 * （ExampleRunResult.ruleHits）聚合出每个条件列的「参与判定的命中规则数」。
 * 纯函数：输入 dt 内容（规则行×列）+ 命中规则 id 集，输出列 id → 计数。
 * 规则行在某列有非空 cell 即视为该列参与判定（cell = '' / undefined 不算）。
 */

export type ColumnHitStat = { columnId: string; count: number };

type FlatTableLike = {
  inputs?: { id?: string }[];
  rules?: Record<string, unknown>[];
};

export const computeColumnHitStats = (
  decisionTable: FlatTableLike | null | undefined,
  ruleIds: string[],
): ColumnHitStat[] => {
  if (!decisionTable) return [];
  const columns = (decisionTable.inputs ?? []).map((c) => c?.id).filter((id): id is string => !!id);
  if (columns.length === 0 || ruleIds.length === 0) return [];

  const hitSet = new Set(ruleIds);
  const rows = (decisionTable.rules ?? []).filter((rule) => {
    const id = typeof rule?._id === 'string' ? rule._id : undefined;
    return id !== undefined && hitSet.has(id);
  });

  return columns.map((columnId) => ({
    columnId,
    count: rows.filter((rule) => {
      const cell = rule[columnId];
      return typeof cell === 'string' ? cell.trim().length > 0 : cell != null;
    }).length,
  }));
};
