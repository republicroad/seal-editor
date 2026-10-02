import { describe, expect, it } from 'bun:test';

import { expandTypedValues } from '../src/typed-values';

describe('expandTypedValues（Typed Input 信封展开）', () => {
  const $call = '$call';

  it('kwargs 中的 {mode,value} 信封展开为裸值/表达式串', () => {
    const model = {
      nodes: [
        {
          id: 'cn-1',
          type: 'customNode',
          kind: 'ns',
          content: {
            config: {
              expressions: [
                {
                  id: 'e1',
                  key: 'out1',
                  type: 'function',
                  value: {
                    $call,
                    kwargs: {
                      literal: 'GOLD',
                      expr: { mode: 'expression', value: '$.customer.tier' },
                      ref: { mode: 'reference', value: '$.customer.vip' },
                    },
                  },
                },
              ],
            },
          },
        },
      ],
      edges: [],
    };

    const expanded = expandTypedValues(structuredClone(model));
    const kwargs = (expanded as any).nodes[0].content.config.expressions[0].value.kwargs;
    expect(kwargs).toEqual({
      literal: 'GOLD',
      expr: '$.customer.tier',
      ref: '$.customer.vip',
    });
    // 原模型不被修改（纯函数）
    expect((model as any).nodes[0].content.config.expressions[0].value.kwargs.expr).toEqual({
      mode: 'expression',
      value: '$.customer.tier',
    });
  });

  it('位置数组 args 中的信封同样展开', () => {
    const expanded = expandTypedValues({
      nodes: [
        {
          id: 'cn-2',
          type: 'customNode',
          content: {
            config: {
              expressions: [{ id: 'e1', key: 'out1', type: 'function', value: ['fn', { mode: 'literal', value: 7 }] }],
            },
          },
        },
      ],
      edges: [],
    });
    const value = (expanded as any).nodes[0].content.config.expressions[0].value;
    expect(value).toEqual(['fn', 7]);
  });

  it('窄识别：普通双键对象 {mode,value} 之外形状不误伤', () => {
    const expanded = expandTypedValues({
      nodes: [],
      edges: [],
      payload: { mode: 'literal' }, // 缺 value 键 → 非信封
      nested: { mode: 'note', value: 'keep' }, // mode 非法 → 非信封
    });
    expect(expanded).toEqual({
      nodes: [],
      edges: [],
      payload: { mode: 'literal' },
      nested: { mode: 'note', value: 'keep' },
    });
  });
});
