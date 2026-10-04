import { describe, expect, it } from 'bun:test';

import { assertZenUdfEnvelopeSupport, expandTypedValues } from '../src/typed-values';

describe('expandTypedValues（expression 信封展开——literal/reference 引擎原生透传）', () => {
  const CALL = '$call';

  it('kwargs：expression 信封拆包，literal/reference 信封透传（1.1.0 原生绑定）', () => {
    const model = {
      nodes: [
        {
          id: 'cn-1',
          type: 'customNode',
          content: {
            kind: 'ns',
            config: {
              expressions: [
                {
                  id: 'e1',
                  key: 'out1',
                  type: 'function',
                  value: {
                    [CALL]: 'fn',
                    kwargs: {
                      lit: { mode: 'literal', value: 'demo_block' },
                      expr: { mode: 'expression', value: '$.customer.tier' },
                      ref: { mode: 'reference', value: 'customer.vip' },
                      plain: 'GOLD',
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

    const expanded = expandTypedValues(structuredClone(model)) as typeof model;
    const kwargs = (expanded.nodes[0] as any).content.config.expressions[0].value.kwargs;
    // literal/reference 透传——1.1.0 引擎原生绑定（实证 2026-10-04）
    expect(kwargs.lit).toEqual({ mode: 'literal', value: 'demo_block' });
    expect(kwargs.ref).toEqual({ mode: 'reference', value: 'customer.vip' });
    expect(kwargs.plain).toBe('GOLD');
    // 仅 expression 拆成裸串
    expect(kwargs.expr).toBe('$.customer.tier');
    // 原模型不被修改（纯函数）+ 幂等（对已展开结构再展开不变）
    const snapshot = JSON.stringify(model);
    const first = expandTypedValues(structuredClone(model));
    const again = expandTypedValues(structuredClone(first));
    expect(JSON.stringify(again)).toBe(JSON.stringify(first));
    expect(JSON.stringify(model)).toBe(snapshot);
  });

  it('位置数组 args 中的 expression 信封同样展开', () => {
    const expanded = expandTypedValues({
      nodes: [
        {
          id: 'cn-2',
          type: 'customNode',
          content: {
            config: {
              expressions: [
                { id: 'e1', key: 'out1', type: 'function', value: ['fn', { mode: 'expression', value: '$.x' }] },
              ],
            },
          },
        },
      ],
      edges: [],
    }) as any;
    expect(expanded.nodes[0].content.config.expressions[0].value).toEqual(['fn', '$.x']);
  });

  it('窄识别：非信封形状不误伤', () => {
    const expanded = expandTypedValues({
      nodes: [],
      edges: [],
      payload: { mode: 'literal' },
      nested: { mode: 'note', value: 'keep' },
    }) as any;
    expect(expanded.payload).toEqual({ mode: 'literal' });
    expect(expanded.nested).toEqual({ mode: 'note', value: 'keep' });
  });
});

describe('assertZenUdfEnvelopeSupport（运行时版本断言）', () => {
  it('>= 1.1.0 通过', () => {
    expect(() => assertZenUdfEnvelopeSupport('1.1.0')).not.toThrow();
    expect(() => assertZenUdfEnvelopeSupport('1.2.3')).not.toThrow();
    expect(() => assertZenUdfEnvelopeSupport('2.0.0')).not.toThrow();
  });
  it('< 1.1.0 fail fast', () => {
    expect(() => assertZenUdfEnvelopeSupport('1.0.9')).toThrow(/1.1.0/);
    expect(() => assertZenUdfEnvelopeSupport('0.14.0')).toThrow();
  });
});
