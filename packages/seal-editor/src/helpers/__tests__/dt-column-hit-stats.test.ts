import { describe, expect, it } from 'vitest';

import { computeColumnHitStats } from '../dt-column-hit-stats';

describe('computeColumnHitStats（D2：条件列命中参与计数）', () => {
  const table = {
    inputs: [{ id: 'i1' }, { id: 'i2' }],
    rules: [
      { _id: 'r1', i1: '> 0', i2: '' },
      { _id: 'r2', i1: '', i2: '"US"' },
      { _id: 'r3', i1: '[20..40]', i2: '< 5' },
    ],
  };

  it('命中规则在该列有非空 cell → 计数', () => {
    expect(computeColumnHitStats(table, ['r1', 'r3'])).toEqual([
      { columnId: 'i1', count: 2 },
      { columnId: 'i2', count: 1 },
    ]);
  });

  it('全部命中 / 零命中', () => {
    expect(computeColumnHitStats(table, ['r1', 'r2', 'r3'])).toEqual([
      { columnId: 'i1', count: 2 },
      { columnId: 'i2', count: 2 },
    ]);
    expect(computeColumnHitStats(table, [])).toEqual([]);
  });

  it('命中 id 不在规则集中 → 不计', () => {
    expect(computeColumnHitStats(table, ['ghost'])).toEqual([
      { columnId: 'i1', count: 0 },
      { columnId: 'i2', count: 0 },
    ]);
  });

  it('空表安全', () => {
    expect(computeColumnHitStats(null, ['r1'])).toEqual([]);
  });
});
