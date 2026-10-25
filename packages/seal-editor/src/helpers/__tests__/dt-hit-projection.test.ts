import { describe, expect, it } from 'vitest';

import { deriveDeadRowIds, deriveHitRuleIds } from '../dt-hit-projection';

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
    expect(deriveHitRuleIds(traceData)).toEqual(new Set(['r1']));
  });
});

describe('deriveDeadRowIds（A1 死行检测）', () => {
  it('未被命中集合覆盖的行 = 死行', () => {
    const rules = [{ _id: 'r1' }, { _id: 'r2' }, { _id: 'r3' }];
    expect(deriveDeadRowIds(rules, new Set(['r2']))).toEqual(['r1', 'r3']);
  });

  it('全命中 → 空数组；无 _id 行跳过', () => {
    expect(deriveDeadRowIds([{ _id: 'r1' }], new Set(['r1']))).toEqual([]);
    expect(deriveDeadRowIds([{}, { _id: 'r1' }, undefined], new Set())).toEqual(['r1']);
    expect(deriveDeadRowIds(undefined, new Set())).toEqual([]);
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
