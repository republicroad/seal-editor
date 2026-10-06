/**
 * E2E 管线测试（ADR-016 信封线闭环）：TypedValue 信封模型经 /v1/execute
 * HTTP 边界（expandTypedValues → zen-udf 1.1.0+ 原生绑定）→ 实例结果。
 * 三模式全矩阵：literal 原样绑定 / expression 展开（服务端）/ reference 原生路径。
 */
import { describe, expect, test } from 'bun:test';

import { createApp } from './app';
import { assertZenUdfEnvelopeSupport, expandTypedValues, installedZenUdfVersion } from './typed-values';

const app = createApp();

const post = async (path: string, body: unknown): Promise<{ status: number; json: any }> => {
  const res = await app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return { status: res.status, json: await res.json() };
};

/** roster 查询节点（demo_vip = ['gold-user', 'vip-001']），value 形态即被测信封 */
const model = (valueArg: unknown) => ({
  id: 'g',
  nodes: [
    { id: 'in', type: 'inputNode', name: 'Request' },
    {
      id: 'c1',
      type: 'customNode',
      name: 'custom',
      content: {
        kind: 'UDF',
        config: {
          expressions: [
            {
              id: 'e1',
              key: 'hit',
              value: {
                $call: 'roster',
                kwargs: {
                  roster: { mode: 'literal', value: 'demo_vip' },
                  value: valueArg,
                },
              },
            },
          ],
        },
      },
    },
    { id: 'out', type: 'outputNode', name: 'Response' },
  ],
  edges: [
    { id: 'x1', sourceId: 'in', targetId: 'c1', type: 'edge' },
    { id: 'x2', sourceId: 'c1', targetId: 'out', type: 'edge' },
  ],
});

const execute = async (valueArg: unknown, input: Record<string, unknown> = {}) =>
  await post('/v1/execute', { model: model(valueArg), input });

describe('信封 E2E：/v1/execute 三模式全矩阵', () => {
  test('literal：原样绑定不求值（裸值无需引号仪式）', async () => {
    const { status, json } = await execute({ mode: 'literal', value: 'gold-user' });
    expect(status).toBe(200);
    expect(json.result?.hit).toMatchObject({ hit: true, roster: 'demo_vip' });
  });

  test('literal 陷阱回归：形如表达式的字面量不被求值', async () => {
    // 旧裸串形态下 '$.gold-user' 会被求值成 null——信封后原样绑定
    const { json } = await execute({ mode: 'literal', value: 'gold-user' });
    expect(json.result?.hit).toMatchObject({ hit: true });
  });

  test('expression：服务端展开 → 裸值语义（动态取 input，字段引用 = 裸路径）', async () => {
    // typed-input-spec §7 立法 + 本次 E2E 实证：本嵌入下 zen-expression 的输入
    // 访问器 = 裸路径（'user' → 命中）；'$.user' 求值落 null（$ 根不绑定节点输入）
    // —— $. 前缀保留给实例引用（ADR-015 执行前替换协议），字段引用一律裸路径。
    const { status, json } = await execute({ mode: 'expression', value: 'user' }, { user: 'vip-001' });
    expect(status).toBe(200);
    expect(json.result?.hit).toMatchObject({ hit: true });
  });

  test('reference：透传引擎原生路径解析（OQ1 ≡ expression + $. 前缀）', async () => {
    const { status, json } = await execute({ mode: 'reference', value: 'user' }, { user: 'gold-user' });
    expect(status).toBe(200);
    expect(json.result?.hit).toMatchObject({ hit: true });
  });

  test('literal 未命中返回 false（非执行错误）', async () => {
    const { json } = await execute({ mode: 'literal', value: 'nope' });
    expect(json.result?.hit).toMatchObject({ hit: false });
  });

  test('信封模型过 /v1/validate（引擎级校验接受信封形态）', async () => {
    const { status, json } = await post('/v1/validate', model({ mode: 'literal', value: 'gold-user' }));
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true });
  });
});

describe('expandTypedValues（expression-only 展开）', () => {
  test('literal / reference 透传，expression 拆包', () => {
    const model = {
      nodes: [
        {
          content: {
            config: {
              expressions: [
                {
                  value: {
                    $call: 'f',
                    kwargs: { a: { mode: 'literal', value: 'x' }, b: { mode: 'expression', value: '$.y' } },
                  },
                },
                { value: { $call: 'g', kwargs: { c: { mode: 'reference', value: 'k' } } } },
              ],
            },
          },
        },
      ],
    };
    const expanded = expandTypedValues(model) as any;
    const exprs = expanded.nodes[0].content.config.expressions;
    expect(exprs[0].value.kwargs.a).toEqual({ mode: 'literal', value: 'x' });
    expect(exprs[0].value.kwargs.b).toBe('$.y');
    expect(exprs[1].value.kwargs.c).toEqual({ mode: 'reference', value: 'k' });
  });

  test('非信封对象字面量与数组元素照常深走', () => {
    const model = {
      cfg: {
        nested: [
          { mode: 'expression', value: '$.a' },
          { mode: 'literal', value: 1 },
        ],
      },
    };
    const expanded = expandTypedValues(model) as any;
    expect(expanded.cfg.nested[0]).toBe('$.a');
    expect(expanded.cfg.nested[1]).toEqual({ mode: 'literal', value: 1 });
  });
});

describe('zen-udf 版本断言（信封语义 ≥ 1.1.0）', () => {
  test('当前安装版本满足', () => {
    assertZenUdfEnvelopeSupport(installedZenUdfVersion());
  });

  test('低版本 fail fast', () => {
    expect(() => assertZenUdfEnvelopeSupport('1.0.9')).toThrow(/>= 1.1.0/);
    expect(() => assertZenUdfEnvelopeSupport('1.1.0')).not.toThrow();
    expect(() => assertZenUdfEnvelopeSupport('2.0.0')).not.toThrow();
  });
});
