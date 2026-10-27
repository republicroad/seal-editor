import { describe, expect, it } from 'vitest';

import type { DecisionGraphType } from '../dg-types';
import { buildContractFixtures } from './fixtures-run';

const graph = (content: Record<string, unknown>): DecisionGraphType =>
  ({
    nodes: [
      {
        id: 'in-1',
        name: 'Request',
        type: 'inputNode',
        position: { x: 0, y: 0 },
        content,
      },
    ],
    edges: [],
  }) as unknown as DecisionGraphType;

describe('buildContractFixtures 期望透传（CONTRACT §10 serializable 子集）', () => {
  it('契约示例的 expectation 原样成为 fixture.expect', () => {
    const content = {
      inputContract: {
        contractVersion: 1,
        schema: { type: 'object' },
        examples: [
          {
            id: 'e1',
            name: 'heavy',
            data: { weight: 50 },
            expectation: { mode: 'deep', value: { fee: 40 } },
          },
          {
            id: 'e2',
            name: 'light',
            data: { weight: 10 },
            expectation: { mode: 'expression', source: 'result.fee < 40' },
          },
          { id: 'e3', name: 'none', data: { weight: 20 } },
        ],
      },
    };

    const fixtures = buildContractFixtures(graph(content), 'in-1');
    expect(fixtures).toHaveLength(3);
    expect(fixtures?.[0]).toEqual({
      name: 'heavy',
      input: { weight: 50 },
      expect: { mode: 'deep', value: { fee: 40 } },
    });
    expect(fixtures?.[1]?.expect).toEqual({ mode: 'expression', source: 'result.fee < 40' });
    expect(fixtures?.[2]).toEqual({ name: 'none', input: { weight: 20 } });
  });

  it('无示例集返回 null（不产生空跑）', () => {
    expect(buildContractFixtures(graph({}), 'in-1')).toBeNull();
  });
});
