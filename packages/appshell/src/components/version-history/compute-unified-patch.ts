/**
 * 相邻版本行级 diff：LCS → unified patch 文本（`parseUnifiedDiff` 的消费格式）。
 *
 * 零依赖。DP 表 O(n·m)——超过 GUARD（约 2000×2000 行）返回 null，UI 据此隐藏
 * 行级视图而不是卡死；行数以 pretty-print 后的 JSON 计。
 * 输出最小合法 patch：`+++ b/<file>` 头（parseUnifiedDiff 以此建 file 桶）+
 * `@@` hunk + ` `/`-`/`+` 前缀行——对上 parseUnifiedDiff 的行法即可，无需
 * `diff --git`/`---` 全套头。
 */

/** DP 单元格上限（n·m），超过即放弃行级 diff。 */
export const DIFF_LINE_GUARD = 4_000_000;

/** hunk 上下文行数（git 惯例 3）。 */
export const DIFF_CONTEXT_LINES = 3;

export type UnifiedPatchResult = {
  patch: string;
  added: number;
  removed: number;
} | null;

export function computeUnifiedPatch(
  before: string,
  after: string,
  fileName = 'graph.json',
  contextLines = DIFF_CONTEXT_LINES,
): UnifiedPatchResult | null {
  // '' 规范为零行（git 语义），而非 ['']——空串当单空行会虚增一条 removed
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  const n = a.length;
  const m = b.length;
  if (n * m > DIFF_LINE_GUARD) return null;

  // dp[i*m+j] = a[i..] 与 b[j..] 的 LCS 长度（自尾构建）
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * (m + 1) + j] =
        a[i] === b[j]
          ? dp[(i + 1) * (m + 1) + j + 1] + 1
          : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
    }
  }

  type Op = { type: 'equal' | 'del' | 'ins'; line: string; oldNo: number; newNo: number };
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) {
      ops.push({ type: 'equal', line: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
      j++;
    } else if (j >= m || (i < n && dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1])) {
      ops.push({ type: 'del', line: a[i], oldNo: i + 1, newNo: j + 1 });
      i++;
    } else {
      ops.push({ type: 'ins', line: b[j], oldNo: i + 1, newNo: j + 1 });
      j++;
    }
  }

  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === 'ins') added++;
    else if (op.type === 'del') removed++;
  }
  if (added === 0 && removed === 0) return { patch: '', added: 0, removed: 0 };

  // 变更分组合并 hunk（间隔 ≤ 2·context 的相邻组合一）
  const changedIdx = ops.flatMap((op, k) => (op.type === 'equal' ? [] : [k]));
  const groups: number[][] = [];
  for (const k of changedIdx) {
    const last = groups[groups.length - 1];
    if (last && k - last[last.length - 1] <= 2 * contextLines + 1) last.push(k);
    else groups.push([k]);
  }

  // 每个位置的旧/新文件游标（hunk 头用）
  const oldAt = new Array<number>(ops.length + 1);
  const newAt = new Array<number>(ops.length + 1);
  oldAt[0] = 1;
  newAt[0] = 1;
  for (let k = 0; k < ops.length; k++) {
    oldAt[k + 1] = oldAt[k] + (ops[k].type === 'ins' ? 0 : 1);
    newAt[k + 1] = newAt[k] + (ops[k].type === 'del' ? 0 : 1);
  }

  const lines: string[] = [`+++ b/${fileName}`];
  for (const group of groups) {
    const from = Math.max(0, group[0] - contextLines);
    const to = Math.min(ops.length - 1, group[group.length - 1] + contextLines);
    const countOld = oldAt[to + 1] - oldAt[from];
    const countNew = newAt[to + 1] - newAt[from];
    lines.push(`@@ -${oldAt[from]},${countOld} +${newAt[from]},${countNew} @@`);
    for (let k = from; k <= to; k++) {
      const op = ops[k];
      lines.push(`${op.type === 'del' ? '-' : op.type === 'ins' ? '+' : ' '}${op.line}`);
    }
  }

  return { patch: lines.join('\n'), added, removed };
}
