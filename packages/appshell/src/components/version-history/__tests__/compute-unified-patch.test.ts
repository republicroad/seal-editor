import { describe, expect, test } from 'vitest';

import { DIFF_CONTEXT_LINES, DIFF_LINE_GUARD, computeUnifiedPatch } from '../compute-unified-patch';

const repeat = (n: number, prefix = 'line') => Array.from({ length: n }, (_, i) => `${prefix} ${i + 1}`).join('\n');

describe('computeUnifiedPatch（版本历史行级 diff 的 LCS→unified patch 工具）', () => {
  test('完全相同 → patch 为空且零计数', () => {
    const text = repeat(5);
    const result = computeUnifiedPatch(text, text);
    expect(result).toEqual({ patch: '', added: 0, removed: 0 });
  });

  test('尾部追加 → 单 hunk，added 计数正确，patch 可被行法解析', () => {
    const before = repeat(5);
    const after = `${repeat(5)}\nline 6`;
    const result = computeUnifiedPatch(before, after);
    expect(result).not.toBeNull();
    expect(result!.added).toBe(1);
    expect(result!.removed).toBe(0);
    expect(result!.patch).toContain('+++ b/graph.json');
    expect(result!.patch).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@$/m);
    expect(result!.patch).toContain('\n+line 6');
  });

  test('中段替换 → -/+ 成对，上下文行带空格前缀', () => {
    const lines = ['a', 'b', 'c', 'd', 'e'];
    const after = ['a', 'b', 'X', 'd', 'e'].join('\n');
    const result = computeUnifiedPatch(lines.join('\n'), after);
    expect(result!.removed).toBe(1);
    expect(result!.added).toBe(1);
    expect(result!.patch).toContain('-c');
    expect(result!.patch).toContain('+X');
    expect(result!.patch).toContain(' b');
    expect(result!.patch).toContain(' d');
  });

  test('hunk 上下文 = 3 行（git 惯例）', () => {
    const before = repeat(20);
    const after = repeat(20)
      .split('\n')
      .map((l, i) => (i === 9 ? `${l}!` : l))
      .join('\n');
    const result = computeUnifiedPatch(before, after);
    const bodyLines = result!.patch.split('\n').filter((l) => !l.startsWith('+++') && !l.startsWith('@@'));
    // 替换 = 1 del + 1 ins 两变更行 + 2×3 上下文
    expect(bodyLines).toHaveLength(2 + 2 * DIFF_CONTEXT_LINES);
  });

  test('空旧文件（全新增）→ 单 hunk 全 + 行', () => {
    const result = computeUnifiedPatch('', 'one\ntwo');
    expect(result!.added).toBe(2);
    expect(result!.removed).toBe(0);
    expect(result!.patch).toContain('+one');
    expect(result!.patch).toContain('+two');
  });

  test('行序重排按最小编辑脚本计（LCS 语义）', () => {
    const result = computeUnifiedPatch('a\nb', 'b\na');
    // LCS('a\nb','b\na') 长度 1 → 1 del + 1 ins（或等价最小脚本）
    expect(result!.added).toBe(1);
    expect(result!.removed).toBe(1);
  });

  test('超 guard 返回 null（UI 据此隐藏行级视图）', () => {
    const big = repeat(3000, 'x');
    const result = computeUnifiedPatch(big, `${big}\ny`);
    expect(result).toBeNull();
    expect(DIFF_LINE_GUARD).toBe(4_000_000);
  });
});
