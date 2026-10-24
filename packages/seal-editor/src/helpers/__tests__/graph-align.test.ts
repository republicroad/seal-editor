import { describe, expect, it } from 'vitest';

import { snapNodesToGrid } from '../graph-align';

describe('snapNodesToGrid（B2 对齐网格）', () => {
  it('位置取整到栅格（5px 缺省）', () => {
    const nodes = [
      { id: 'a', position: { x: 103, y: 97 } },
      { id: 'b', position: { x: -7, y: 12 } },
    ];
    expect(snapNodesToGrid(nodes as never)).toEqual([
      { id: 'a', position: { x: 105, y: 95 } },
      { id: 'b', position: { x: -5, y: 10 } },
    ]);
  });

  it('自定义栅格与不可变原对象', () => {
    const nodes = [{ id: 'a', position: { x: 23, y: 0 } }];
    const out = snapNodesToGrid(nodes as never, 10);
    expect(out[0].position).toEqual({ x: 20, y: 0 });
    expect(nodes[0].position).toEqual({ x: 23, y: 0 });
  });

  it('空数组安全', () => {
    expect(snapNodesToGrid([] as never)).toEqual([]);
  });
});
