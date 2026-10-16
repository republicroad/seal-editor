import { describe, expect, it } from 'vitest';

import {
  analyzeExpressionValue,
  cellHasDollarNavigation,
  findTableCellDollarNavigation,
  rowKeyShadowsInput,
} from '../zen-dollar-hints';

describe('analyzeExpressionValue（C1：$.<输入字段> 静默丢行哨兵）', () => {
  const opts = { rowKeys: ['c', 'd'], inputFieldNames: ['a', 'b', 'user'] };

  it('$.a 引输入字段（非行键）→ 提示改裸名', () => {
    expect(analyzeExpressionValue('$.a', opts)).toEqual([
      { kind: 'input-ref-via-dollar', name: 'a', start: 0, end: 3, ref: '$.a', suggestion: 'a' },
    ]);
  });

  it('$.c 引行键 → 不提示', () => {
    expect(analyzeExpressionValue('$.c + 1', opts)).toEqual([]);
  });

  it('$.c 引行键优先于输入同名——行键命中即不提示', () => {
    expect(analyzeExpressionValue('$.a', { rowKeys: ['a'], inputFieldNames: ['a'] })).toEqual([]);
  });

  it('多段路径剥前缀给完整建议', () => {
    expect(analyzeExpressionValue('$.user.name', opts)).toEqual([
      { kind: 'input-ref-via-dollar', name: 'user', start: 0, end: 11, ref: '$.user.name', suggestion: 'user.name' },
    ]);
  });

  it('同名去重 + 混合行键引用只报输入段', () => {
    expect(analyzeExpressionValue('$.a + $.a.b + $.c + $.d', opts)).toEqual([
      { kind: 'input-ref-via-dollar', name: 'a', start: 0, end: 3, ref: '$.a', suggestion: 'a' },
    ]);
  });

  it('未知名字（既非行键也非输入字段）不提示——宁漏勿误报', () => {
    expect(analyzeExpressionValue('$.unknown + 1', opts)).toEqual([]);
  });

  it('空值安全', () => {
    expect(analyzeExpressionValue(undefined, opts)).toEqual([]);
    expect(analyzeExpressionValue('', opts)).toEqual([]);
  });
});

describe('rowKeyShadowsInput（C3：行键与输入字段同名三义）', () => {
  it('同名 → hazard', () => {
    expect(rowKeyShadowsInput('v', ['v', 'w'])).toBe(true);
  });

  it('首尾空白容忍', () => {
    expect(rowKeyShadowsInput(' v ', ['v'])).toBe(true);
  });

  it('不同名 / 空键 → 无 hazard', () => {
    expect(rowKeyShadowsInput('total', ['v'])).toBe(false);
    expect(rowKeyShadowsInput('   ', ['v'])).toBe(false);
    expect(rowKeyShadowsInput(undefined, ['v'])).toBe(false);
  });
});

describe('cellHasDollarNavigation（C2 单元级）', () => {
  it('$. 导航 → true', () => {
    expect(cellHasDollarNavigation('$.a == 1')).toBe(true);
    expect(cellHasDollarNavigation(' len($.items) > 2 ')).toBe(true);
  });

  it('裸 $（unary 列值）与 $root 不触发', () => {
    expect(cellHasDollarNavigation('$ == 1')).toBe(false);
    expect(cellHasDollarNavigation("$[0:5] == 'sample'")).toBe(false);
    expect(cellHasDollarNavigation('$root.a == 1')).toBe(false);
  });

  it('空单元安全', () => {
    expect(cellHasDollarNavigation('')).toBe(false);
    expect(cellHasDollarNavigation(undefined)).toBe(false);
  });
});

describe('findTableCellDollarNavigation（C2 表级扫描）', () => {
  it('只扫无 field 列，命中输出行号/列号/截样', () => {
    const table = {
      inputs: [
        { id: 'i1', field: 'a', name: 'A' },
        { id: 'i2', name: 'Expr' },
      ],
      outputs: [
        { id: 'o1', field: 'r', name: 'R' },
        { id: 'o2', name: 'Out' },
      ],
      rules: [
        { _id: 'r1', i1: '== 1', i2: '$.a == 1', o1: '1', o2: '$root.a' },
        { _id: 'r2', i1: '== 2', i2: 'a == 1', o1: '2', o2: '$.b' },
      ],
    };
    expect(findTableCellDollarNavigation(table)).toEqual([
      { ruleIndex: 0, columnId: 'i2', sample: '$.a == 1' },
      { ruleIndex: 1, columnId: 'o2', sample: '$.b' },
    ]);
  });

  it('field 列里的 $. 导航合法不报', () => {
    const table = {
      inputs: [{ id: 'i1', field: 'u', name: 'U' }],
      outputs: [{ id: 'o1', field: 'r', name: 'R' }],
      rules: [{ _id: 'r1', i1: '$.b == 1', o1: '1' }],
    };
    expect(findTableCellDollarNavigation(table)).toEqual([]);
  });

  it('空表安全', () => {
    expect(findTableCellDollarNavigation(null)).toEqual([]);
    expect(findTableCellDollarNavigation({})).toEqual([]);
  });
});
