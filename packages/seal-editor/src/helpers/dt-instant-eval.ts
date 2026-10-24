/**
 * A3 即时求值（dt-instant-eval-badge.md）：dt 页签侧的状态裁定纯函数。
 *
 * 裁定（规划档 §4 推荐案）：结构变更（增删行列）挂起、参数值变更防抖重跑、
 * 大表降级为手动 Run。挂起/降级时自动重跑不发，徽章随既有 simulator 结果
 * 静止显示（灰显语义由 UI 层表达）。
 */

export type InstantEvalStatus = 'active' | 'suspended' | 'degraded';

/** 大表降级闸：行数达到该值即停用自动重跑（与虚拟化窗口化阈值同量级） */
export const INSTANT_EVAL_ROW_LIMIT = 100;

/** 结构签名：行数 + 列 id 序（列增删/重排/行增删都翻签名；单元格值变更不翻） */
export const instantEvalStructureSignature = (content: unknown): string => {
  const c = (content ?? {}) as {
    rows?: unknown[];
    inputs?: { id?: string }[];
    outputs?: { id?: string }[];
  };
  return [
    c.rows?.length ?? 0,
    (c.inputs ?? []).map((col) => col.id ?? '').join(','),
    (c.outputs ?? []).map((col) => col.id ?? '').join(','),
  ].join('|');
};

export const resolveInstantEvalStatus = (params: {
  rowCount: number;
  nextSig: string;
  /** 上次 simulator 结果时的结构签名（无结果 = 尚未运行过） */
  lastRunSig: string | undefined;
  hasSimulateResult: boolean;
}): InstantEvalStatus | undefined => {
  if (!params.hasSimulateResult) {
    return undefined;
  }
  if (params.rowCount >= INSTANT_EVAL_ROW_LIMIT) {
    return 'degraded';
  }
  return params.nextSig === params.lastRunSig ? 'active' : 'suspended';
};
