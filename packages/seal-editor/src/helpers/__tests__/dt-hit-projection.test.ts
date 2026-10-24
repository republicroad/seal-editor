import { describe, expect, it } from 'vitest';

import { deriveHitRuleIds } from '../dt-hit-projection';

describe('deriveHitRuleIds（A3 行级命中投影）', () => {
  it('数组 traceData（collect 多行命中）→ 全量规则 id 集合', () => {
    const traceData = [
      { index: 0, rule: { _id: 'r1' } },
      { index: 2, rule: { _id: 'r3' } },
    ];
    expect(deriveHitRuleIds(traceData)).toEqual(new Set(['r1', 'r3']));
  });

  it('单条 traceData（first 单命中）→ 单元素集合', () => {
    expect(deriveHitRulesSafe({ index: 1, rule: { _id: 'r2' } })).toEqual(new Set(['r2']));
  });

  it('undefined / 空数组 → 空集合', () => {
    expect(deriveHitRulesSafe(undefined)).toEqual(new Set());
    expect(deriveHitRulesSafe([])).toEqual(new Set());
  });

  it('条目缺 rule._id 时跳过（不产 undefined 键）', () => {
    const traceData = [{ index: 0, rule: {} }, { index: 1, rule: { _id: 'r2' } }, { index: 2 }];
    expect(deriveHitRulesSafe(traceData)).toEqual(new Set(['r2']));
  });

  it('同规则多条目去重', () => {
    const traceData = [
      { index: 0, rule: { _id: 'r1' } },
      { index: 1, rule: { _id: 'r1' } },
    ];
    expect(deriveHitRulesSafe(traceData)).toEqual(new Set(['r1']));
  });
});

// 防呆包装：非 string _id（数字等）不应进集合——直接调用并断言
function deriveHitRulesSafe(traceData: unknown): Set<string> {
  const ids = deriveHitRuleIds(traceData);
  for (const id of ids) {
    expect(typeof id).toBe('string');
  }
  return ids;
}
