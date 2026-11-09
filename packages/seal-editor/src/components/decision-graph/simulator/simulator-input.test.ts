import { describe, expect, it } from 'vitest';

import type { DecisionGraphType } from '../dg-types';
import { resolveSimulatorInput } from './simulator-input';

const graph = (content?: Record<string, unknown>, inputType = 'inputNode'): DecisionGraphType =>
  ({
    nodes: [
      {
        id: 'in-1',
        name: 'Request',
        type: inputType,
        position: { x: 0, y: 0 },
        ...(content ? { content } : {}),
      },
    ],
    edges: [],
  }) as unknown as DecisionGraphType;

describe('resolveSimulatorInput（单击直跑输入解析）', () => {
  it('取契约示例集第一条（默认值合并 + 归一管线）', () => {
    const content = {
      inputContract: {
        contractVersion: 1,
        schema: { type: 'object' },
        examples: [
          { id: 'e1', name: 'heavy', data: { weight: 50 } },
          { id: 'e2', name: 'light', data: { weight: 10 } },
        ],
      },
    };
    expect(resolveSimulatorInput(graph(content))).toEqual({ weight: 50 });
  });

  it('无 examples 回落空对象（MISSING_INPUT 诊断语义）', () => {
    expect(resolveSimulatorInput(graph({}))).toEqual({});
  });

  it('content 非 record 回落空对象', () => {
    expect(resolveSimulatorInput(graph('not-a-record' as unknown as Record<string, unknown>))).toEqual({});
  });

  it('无 inputNode 回落空对象', () => {
    expect(resolveSimulatorInput(graph(undefined, 'functionNode'))).toEqual({});
  });
});
