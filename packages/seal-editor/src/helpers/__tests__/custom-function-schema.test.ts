import { describe, expect, it, test } from 'vitest';

import {
  buildDefaultFunctionExpression,
  computeFunctionArgsDrift,
  computeInstanceSchedule,
  findDollarFormRows,
  healExpressionsForScope,
  legacyValueToNamedCall,
  migrateDollarFormArgs,
  resolveFunctionScope,
} from '../custom-function-schema';

const namespaces = [
  {
    name: 'debug',
    title: 'debug',
    tools: [
      {
        name: 'inout',
        title: 'inout',
        parameters: {
          type: 'object',
          properties: {
            a: { type: 'string', description: '参数 a', default: 'x' },
            b: { type: 'integer', description: '参数 b' },
          },
          required: ['a'],
        },
        returns: { type: 'string' },
      },
      { name: 'func_without_args', parameters: { type: 'object', properties: {} } },
    ],
  },
  {
    name: 'shared_counter',
    title: 'shared_counter',
    tools: [
      { name: 'rate_1h', parameters: { type: 'object', properties: { field: { type: 'string' } } } },
      { name: 'group_distinct_1h', parameters: { type: 'object', properties: { a: {}, b: {} } } },
    ],
  },
  {
    name: 'phone',
    title: 'phone',
    tools: [{ name: 'phone_number_info', parameters: { type: 'object', properties: { phone: {} } } }],
  },
];

describe('findDollarFormRows / migrateDollarFormArgs（OQ7 随档动作②：$-形态检测与一键迁移）', () => {
  const row = (kwargs: Record<string, unknown>, id = 'r1', key = 'out1') => ({
    id,
    key,
    type: 'function',
    value: { $call: 'fn', kwargs },
  });

  it('检测：裸 $. 字符串 / expression·reference 信封内 $-路径，literal 信封与普通值不报', () => {
    const expressions = [
      row({
        bad: '$.customer.tier',
        envExpr: { mode: 'expression', value: '$.a' },
        envRef: { mode: 'reference', value: '$.customer' },
        litEnv: { mode: 'literal', value: '$.not.a.path' },
        plain: 'GOLD',
        num: 3,
      }),
    ];
    const rows = findDollarFormRows(expressions);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ rowId: 'r1', rowKey: 'out1', params: ['bad', 'envExpr', 'envRef'] });
  });

  it('非数组/无 $-形态返回空清单', () => {
    expect(findDollarFormRows(undefined)).toEqual([]);
    expect(findDollarFormRows([row({ plain: 'GOLD' })])).toEqual([]);
  });

  it('迁移：剥 $. 前缀为裸路径；literal 信封与普通值不动；幂等', () => {
    const expressions = [
      row({
        bad: '$.customer.tier',
        env: { mode: 'reference', value: '$.vip' },
        litEnv: { mode: 'literal', value: '$.keep' },
      }),
      row({ plain: 'GOLD' }, 'r2', 'out2'),
    ];
    const migrated = migrateDollarFormArgs(expressions);
    expect(migrated).not.toBeNull();
    expect((migrated as any[])[0].value.kwargs.bad).toBe('customer.tier');
    expect((migrated as any[])[0].value.kwargs.env).toEqual({ mode: 'reference', value: 'vip' });
    // literal 信封原样（$.x 作字面量是 ADR-016 歧义根治语义）
    expect((migrated as any[])[0].value.kwargs.litEnv).toEqual({ mode: 'literal', value: '$.keep' });
    expect((migrated as any[])[1].value.kwargs.plain).toBe('GOLD');
    // 幂等：迁移后再检为空
    expect(findDollarFormRows(migrated)).toEqual([]);
    expect(migrateDollarFormArgs(migrated)).toBeNull();
  });
});

describe('legacyValueToNamedCall（旧格式读时转换，防写回损毁）', () => {
  const rosterDef = {
    parameters: { type: 'object', properties: { roster: { type: 'string' }, value: { type: 'string' } } },
  };

  it(';; 字符串按声明序映射 kwargs（引号感知）', () => {
    expect(legacyValueToNamedCall('roster;;roster;;value', rosterDef)).toEqual({
      $call: 'roster',
      kwargs: { roster: 'roster', value: 'value' },
    });
    // 引号字面量保留原样（含引号 = 字面量，引擎侧语义）
    expect(
      legacyValueToNamedCall('crypto;;text;;"sha256"', {
        parameters: { type: 'object', properties: { input: { type: 'string' }, algorithm: { type: 'string' } } },
      }),
    ).toEqual({
      $call: 'crypto',
      kwargs: { input: 'text', algorithm: '"sha256"' },
    });
  });

  it('裸函数名 → 空 kwargs；位置数组 → 声明序映射；超序落 argN', () => {
    expect(legacyValueToNamedCall('current_date', rosterDef)).toEqual({ $call: 'current_date', kwargs: {} });
    expect(legacyValueToNamedCall(['roster', 'a', 'b'], rosterDef)).toEqual({
      $call: 'roster',
      kwargs: { roster: 'a', value: 'b' },
    });
    expect(legacyValueToNamedCall(['f', 'x'], { parameters: { type: 'object', properties: {} } })).toEqual({
      $call: 'f',
      kwargs: { arg1: 'x' },
    });
  });

  it('规范形对象返回 null（调用方直用原值）；空值返回 null', () => {
    const canonical = { $call: 'roster', kwargs: { roster: 'a' } };
    expect(legacyValueToNamedCall(canonical, rosterDef)).toBeNull();
    expect(legacyValueToNamedCall(undefined, rosterDef)).toBeNull();
    expect(legacyValueToNamedCall('', rosterDef)).toBeNull();
  });
});

describe('resolveFunctionScope', () => {
  it('returns free scope without kind', () => {
    const scope = resolveFunctionScope(undefined, namespaces);
    expect(scope.mode).toBe('free');
    expect(scope.orphanKind).toBeUndefined();
    expect(scope.functions.map((f) => f.name)).toEqual([
      'inout',
      'func_without_args',
      'rate_1h',
      'group_distinct_1h',
      'phone_number_info',
    ]);
  });

  it('未知 kind → free + orphanKind（孤儿容器降级，不白块）', () => {
    const scope = resolveFunctionScope('rate-window', namespaces);
    expect(scope.mode).toBe('free');
    expect(scope.orphanKind).toBe('rate-window');
    // free 全集可见（UX 供给非安全围栏，授权在服务端 registry）
    expect(scope.functions.length).toBe(5);
  });

  it('legacy UDF 与命名空间命中不挂孤儿标', () => {
    expect(resolveFunctionScope('UDF', namespaces).orphanKind).toBeUndefined();
    expect(resolveFunctionScope('debug', namespaces).orphanKind).toBeUndefined();
    expect(resolveFunctionScope('debug', namespaces).mode).toBe('scoped');
  });

  it('returns legacy scope for UDF kind with all functions', () => {
    const scope = resolveFunctionScope('UDF', namespaces);
    expect(scope.mode).toBe('legacy');
    expect(scope.functions).toHaveLength(5);
  });

  it('returns scoped scope for namespace container kind', () => {
    const scope = resolveFunctionScope('shared_counter', namespaces);
    expect(scope.mode).toBe('scoped');
    expect(scope.functions.map((f) => f.name)).toEqual(['rate_1h', 'group_distinct_1h']);
    expect(scope.functions.every((f) => f.namespace === 'shared_counter')).toBe(true);
  });

  it('returns scoped scope for namespace without explicit type', () => {
    const scope = resolveFunctionScope('phone', namespaces);
    expect(scope.mode).toBe('scoped');
    expect(scope.functions.map((f) => f.name)).toEqual(['phone_number_info']);
  });

  it('returns free scope for bare function-name kinds (naming abandoned)', () => {
    expect(resolveFunctionScope('inout', namespaces).mode).toBe('free');
    expect(resolveFunctionScope('phone_number_info', namespaces).mode).toBe('free');
  });

  it('does not treat legacy derived ns.tool kind as scoped (naming abandoned)', () => {
    const scope = resolveFunctionScope('debug.inout', namespaces);
    expect(scope.mode).toBe('free');
  });

  it('returns free scope for unknown kinds', () => {
    expect(resolveFunctionScope('nonexistent', namespaces).mode).toBe('free');
  });

  it('returns free scope with empty functions for non-array input', () => {
    const scope = resolveFunctionScope('shared_counter', undefined);
    expect(scope.mode).toBe('free');
    expect(scope.functions).toHaveLength(0);
  });
});

describe('buildDefaultFunctionExpression', () => {
  it('builds value array and arg exprs from parameter defaults', () => {
    const funcDef = namespaces[0].tools[0];
    const entry = buildDefaultFunctionExpression(funcDef);

    expect(entry.type).toBe('function');
    expect(entry.value).toEqual(['inout', 'x', '']);
    expect(entry.arg_exprs).toEqual({ a: 'x', b: '' });
    expect(entry.funcmeta).toBe(funcDef);
    expect(entry.returnSchema).toEqual({ type: 'string' });
  });
});

describe('healExpressionsForScope', () => {
  const scopedScope = resolveFunctionScope('shared_counter', namespaces);
  const legacyScope = resolveFunctionScope('UDF', namespaces);

  it('resets scoped rows to the first function when out of set', () => {
    const expressions = [{ id: '1', key: 'out', value: ['inout', '1'], type: 'function' }];
    const healed = healExpressionsForScope(expressions, scopedScope);

    expect(healed?.[0].value).toEqual(['rate_1h', '']);
    expect(healed?.[0].funcmeta.name).toBe('rate_1h');
  });

  it('heals drifted string-form values', () => {
    const expressions = [{ id: '1', key: 'out', value: 'inout;;ip', type: 'function' }];
    const healed = healExpressionsForScope(expressions, scopedScope);

    expect(healed?.[0].value).toEqual(['rate_1h', '']);
  });

  it('keeps scoped rows whose function is inside the set', () => {
    const expressions = [{ id: '1', key: 'out', value: ['group_distinct_1h', 'a', 'b'], type: 'function' }];
    expect(healExpressionsForScope(expressions, scopedScope)).toBeNull();
  });

  it('never heals legacy scope', () => {
    const expressions = [{ id: '1', key: 'out', value: ['whatever', '1'], type: 'function' }];
    expect(healExpressionsForScope(expressions, legacyScope)).toBeNull();
  });

  it('ignores non-function rows', () => {
    const expressions = [{ id: '1', key: 'plain', value: 'input.x' }];
    expect(healExpressionsForScope(expressions, scopedScope)).toBeNull();
  });

  it('returns null for empty scope functions', () => {
    const expressions = [{ id: '1', key: 'out', value: ['rate_1h', '1'], type: 'function' }];
    expect(healExpressionsForScope(expressions, { mode: 'scoped', functions: [] })).toBeNull();
  });
});

describe('computeInstanceSchedule（实例依赖调度：Kahn 分层）', () => {
  const expr = (key: string, kwargs: Record<string, unknown>, dependsOn?: string[]) => ({
    id: 'id-' + key,
    key,
    type: 'function',
    value: { $call: 'fn', kwargs },
    ...(dependsOn ? { dependsOn } : {}),
  });

  it('零依赖 → 单层全并行', () => {
    const result = computeInstanceSchedule([expr('a', {}), expr('b', {})]);
    expect(result).toMatchObject({ ok: true, hasEdges: false });
    if (result.ok) expect(result.layers).toEqual([['a', 'b']]);
  });

  it('依赖序：b 引用 a → a 先于 b', () => {
    const result = computeInstanceSchedule([expr('b', { val: '$.a' }), expr('a', {})]);
    expect(result).toMatchObject({ ok: true, hasEdges: true });
    if (result.ok) expect(result.layers).toEqual([['a'], ['b']]);
  });

  it('环检测：a→b→a 报 CYCLE_DETECTED', () => {
    const result = computeInstanceSchedule([expr('a', { val: '$.b' }), expr('b', { val: '$.a' })]);
    expect(result).toMatchObject({ ok: false, error: 'CYCLE_DETECTED' });
  });

  it('重复输出键报 DUPLICATE_OUTPUT', () => {
    const result = computeInstanceSchedule([expr('a', {}), expr('a', {})]);
    expect(result).toMatchObject({ ok: false, error: 'DUPLICATE_OUTPUT', keys: ['a'] });
  });

  it('悬空引用不建边（不指向已存在实例键）', () => {
    const result = computeInstanceSchedule([expr('a', { val: '$.nonexistent' })]);
    expect(result).toMatchObject({ ok: true, hasEdges: false });
  });

  it('显式 dependsOn 并集', () => {
    const result = computeInstanceSchedule([expr('a', {}), expr('b', {}, ['a'])]);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.layers).toEqual([['a'], ['b']]);
  });
});

describe('computeFunctionArgsDrift · kwargsKeyCollision（ADR-015 #3 检查单 MUST）', () => {
  const scope = {
    mode: 'scoped' as const,
    functions: [
      {
        name: 'f_kwargs',
        parameters: {
          type: 'object',
          properties: { kwargs: { type: 'object', description: '名为 kwargs 的参数' } },
        },
      },
      {
        name: 'f_plain',
        parameters: { type: 'object', properties: { x: { type: 'string' } } },
      },
    ],
  };

  const drift = (value: unknown) =>
    computeFunctionArgsDrift([{ id: '1', key: 'out', value, type: 'function' }], scope as never);

  test('函数声明 kwargs 参数 + 对象型调用 kwargs → kwargsKeyCollision', () => {
    const entries = drift({ $call: 'f_kwargs', kwargs: { inner: 1 } });
    expect(entries).toHaveLength(1);
    expect(entries[0].kwargsKeyCollision).toBe(true);
  });

  test('函数未声明 kwargs 参数：结构撞键不标记（上游 detector 需 schema 感知，差异已入档 ADR-022）', () => {
    const entries = drift({ $call: 'f_plain', kwargs: { kwargs: { deep: 1 } } });
    expect(entries.every((e) => !e.kwargsKeyCollision)).toBe(true);
  });

  test('普通具名调用无碰撞标记', () => {
    const entries = drift({ $call: 'f_plain', kwargs: { x: 'a' } });
    expect(entries.every((e) => !e.kwargsKeyCollision)).toBe(true);
  });
});
