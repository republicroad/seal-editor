import { describe, expect, it } from 'vitest';

import { diffRunPaths, runOutputText } from './simulate-run-diff';
import type { Simulation } from './simulation.types';

const run = (nodes: Record<string, { rule?: string } | Array<{ rule?: string }>>): Simulation =>
  ({
    ok: true,
    result: {
      performance: '1ms',
      result: { out: 1 },
      snapshot: {} as never,
      trace: Object.fromEntries(
        Object.entries(nodes).map(([nodeId, traceData]) => [
          nodeId,
          {
            traceData: Array.isArray(traceData)
              ? traceData.map((entry) => ({ rule: entry.rule ? { _id: entry.rule } : undefined }))
              : { rule: traceData.rule ? { _id: traceData.rule } : undefined },
          },
        ]),
      ),
    },
  }) as unknown as Simulation;

describe('diffRunPaths（运行对比）', () => {
  it('节点集差：仅 A / 仅 B', () => {
    const diff = diffRunPaths(run({ n1: { rule: 'r1' } }), run({ n2: { rule: 'r2' } }));
    expect(diff.nodesOnlyInBase).toEqual(['n1']);
    expect(diff.nodesOnlyInCompare).toEqual(['n2']);
    expect(diff.ruleDiffs).toEqual([]);
  });

  it('共有节点规则行不同 → ruleDiffs；一致 → 空', () => {
    const same = diffRunPaths(run({ n1: { rule: 'r1' } }), run({ n1: { rule: 'r1' } }));
    expect(same.ruleDiffs).toEqual([]);

    const changed = diffRunPaths(run({ n1: { rule: 'r1' } }), run({ n1: { rule: 'r2' } }));
    expect(changed.ruleDiffs).toEqual([{ nodeId: 'n1', baseRuleIds: ['r1'], compareRuleIds: ['r2'] }]);
  });

  it('dt 多命中数组形态：序敏感比较', () => {
    const diff = diffRunPaths(
      run({ dt: [{ rule: 'r1' }, { rule: 'r2' }] }),
      run({ dt: [{ rule: 'r2' }, { rule: 'r1' }] }),
    );
    expect(diff.ruleDiffs).toEqual([{ nodeId: 'dt', baseRuleIds: ['r1', 'r2'], compareRuleIds: ['r2', 'r1'] }]);
  });

  it('空运行（错误/undefined）与正常运行的对比', () => {
    const diff = diffRunPaths(undefined, run({ n1: { rule: 'r1' } }));
    expect(diff.nodesOnlyInBase).toEqual([]);
    expect(diff.nodesOnlyInCompare).toEqual(['n1']);
  });
});

describe('runOutputText', () => {
  it('正常运行取 result；错误运行取 error；undefined 取 null', () => {
    expect(runOutputText(run({}))).toBe('{\n  "out": 1\n}');
    expect(runOutputText({ ok: false, error: { message: 'boom', data: {} } } as Simulation)).toContain('boom');
    expect(runOutputText(undefined)).toBe('null');
  });
});
