import { describe, expect, it } from 'vitest';

import {
  buildInstanceViews,
  computeFunctionArgsDrift,
  editorValueToNamedCall,
  fillMissingFunctionArgs,
  findDuplicateKeys,
  namedCallToEditorValue,
  summarizeInstanceDrift,
} from './custom-function-schema';

describe('computeFunctionArgsDrift / fillMissingFunctionArgs（兜底 tab 参数漂移带）', () => {
  const funcDef = {
    name: 'roster',
    namespace: 'zrule',
    parameters: {
      type: 'object',
      properties: {
        tenant: { type: 'string', default: 'default' },
        version: { type: 'number', default: 1 },
        legacy_flag: { type: 'boolean' },
      },
    },
  };
  const scope = { mode: 'scoped' as const, functions: [funcDef] };
  const expr = (overrides: Record<string, unknown>) => ({
    id: 'row-1',
    key: 'output',
    type: 'function',
    value: ['roster', 'acme'],
    ...overrides,
  });

  it('reports missing and unrecognized named keys per row', () => {
    const drift = computeFunctionArgsDrift(
      [expr({ arg_exprs: { tenant: 'acme', legacy_flag: true, extra_key: 1 } })],
      scope,
    );

    expect(drift).toHaveLength(1);
    expect(drift[0].missing.map((m) => m.name)).toEqual(['version']);
    expect(drift[0].unrecognized).toEqual(['extra_key']);
  });

  it('reports tail-missing on positional-only rows and stays silent when counts match', () => {
    const positional = computeFunctionArgsDrift([expr({ arg_exprs: undefined, value: ['roster', 'acme'] })], scope);
    expect(positional[0].missing.map((m) => m.name)).toEqual(['version', 'legacy_flag']);

    const aligned = computeFunctionArgsDrift(
      [expr({ arg_exprs: undefined, value: ['roster', 'acme', 1, false] })],
      scope,
    );
    expect(aligned).toEqual([]);
  });

  it('ignores free/legacy scopes and non-function rows', () => {
    expect(computeFunctionArgsDrift([expr({})], { mode: 'free', functions: [funcDef] })).toEqual([]);
    expect(computeFunctionArgsDrift([{ id: 'r', key: 'k', value: 'plain' }], scope)).toEqual([]);
  });

  it('fill appends declared defaults in declaration order (canonical dual-write) without touching other rows', () => {
    const rows = [
      expr({ id: 'row-drift', arg_exprs: { tenant: 'acme' } }),
      expr({ id: 'row-ok', key: 'other', arg_exprs: { tenant: 'x', version: 2, legacy_flag: false } }),
    ];
    const drift = computeFunctionArgsDrift(rows, scope);
    const healed = fillMissingFunctionArgs(rows, drift, scope);

    expect(healed).not.toBeNull();
    const fixed = healed![0];
    expect(fixed.arg_exprs).toEqual({ tenant: 'acme', version: 1, legacy_flag: '' });
    // 规范形重建：value = [name, ...声明序参数]
    expect(fixed.value).toEqual(['roster', 'acme', 1, '']);
    // 未识别键不被静默删除（圆往返保真）
    expect(healed![1].arg_exprs).toEqual({ tenant: 'x', version: 2, legacy_flag: false });
  });

  it('fill preserves existing positional values when upgrading to canonical form', () => {
    const rows = [expr({ arg_exprs: undefined, value: ['roster', 'acme', 9] })];
    const drift = computeFunctionArgsDrift(rows, scope);
    const healed = fillMissingFunctionArgs(rows, drift, scope);

    expect(healed![0].arg_exprs).toEqual({ tenant: 'acme', version: 9, legacy_flag: '' });
    expect(healed![0].value).toEqual(['roster', 'acme', 9, '']);
  });

  it('returns null when nothing to fill', () => {
    const rows = [expr({ arg_exprs: { tenant: 'a', version: 1, legacy_flag: false } })];
    expect(fillMissingFunctionArgs(rows, [], scope)).toBeNull();
    expect(fillMissingFunctionArgs(rows, undefined, scope)).toBeNull();
  });
});

describe('ADR-015 规范形（{$call, kwargs}）双向转换', () => {
  const funcDef = {
    name: 'roster',
    parameters: {
      type: 'object',
      properties: {
        tenant: { type: 'string', default: 'default' },
        version: { type: 'number', default: 1 },
        legacy_flag: { type: 'boolean' },
      },
    },
  };
  const scope = { mode: 'scoped' as const, functions: [funcDef] };

  it('editorValueToNamedCall：位置数组按声明序映射为 kwargs', () => {
    const named = editorValueToNamedCall(['roster', 'acme', 2], funcDef);
    expect(named).toEqual({ $call: 'roster', kwargs: { tenant: 'acme', version: 2 } });
  });

  it('editorValueToNamedCall：溢出位置值收进 $positional 保留键', () => {
    const named = editorValueToNamedCall(['roster', 'acme', 2, 'x', 'y'], funcDef);
    // 3 个声明参数吃掉 acme/2/x（legacy_flag），仅 'y' 溢出
    expect(named!.kwargs.$positional).toEqual(['y']);
  });

  it('namedCallToEditorValue：声明序取 kwargs + $positional 追加', () => {
    const array = namedCallToEditorValue(
      { $call: 'roster', kwargs: { version: 9, tenant: 'a', $positional: ['x'] } },
      funcDef,
    );
    // legacy_flag 槽位无值 → 空串占位（声明序），$positional 追加在后
    expect(array).toEqual(['roster', 'a', 9, '', 'x']);
  });

  it('computeFunctionArgsDrift 支持规范形行（kwargs 键对比 + $positional 不算未识别）', () => {
    const drift = computeFunctionArgsDrift(
      [{ id: 'r', key: 'k', value: { $call: 'roster', kwargs: { tenant: 'a', extra: 1 } } }],
      scope,
    );
    expect(drift).toHaveLength(1);
    expect(drift[0].missing.map((m) => m.name)).toEqual(['version', 'legacy_flag']);
    expect(drift[0].unrecognized).toEqual(['extra']);
  });
});

const funcDefDrift = {
  name: 'roster',
  parameters: {
    type: 'object',
    properties: {
      tenant: { type: 'string' },
      version: { type: 'number' },
    },
  },
};

describe('多实例视图（ADR-015 增补 P1 骨架）', () => {
  const instance = (overrides: Record<string, unknown>) => ({
    id: overrides.id as string,
    key: (overrides.key as string) ?? '',
    type: 'function',
    value: overrides.value ?? ['roster', 'acme'],
    ...(overrides.dependsOn ? { dependsOn: overrides.dependsOn } : {}),
  });

  it('buildInstanceViews：fn/key/seq 全量投影，同函数多实例 seq 递增', () => {
    const views = buildInstanceViews([
      instance({ id: 'r1', key: 'best', value: ['roster', 'acme'] }),
      instance({ id: 'r2', key: 'score', value: ['scorer', 9] }),
      instance({ id: 'r3', key: 'backup', value: ['roster', 'other'] }),
    ]);

    expect(views).toHaveLength(3);
    // 展示序 = 字典序（fn→key）：backup < best
    expect(views.map((view) => view.key)).toEqual(['backup', 'best', 'score']);
    expect(views[0]).toMatchObject({ fn: 'roster', seq: 2 });
    expect(views[1]).toMatchObject({ fn: 'roster', seq: 1 });
  });

  it('buildInstanceViews：按函数名→输出键字典序排序（集合观，不暗示执行序）', () => {
    const views = buildInstanceViews([
      instance({ id: 'r1', key: 'z', value: ['scorer'] }),
      instance({ id: 'r2', key: 'a', value: ['roster'] }),
    ]);

    expect(views.map((view) => view.fn)).toEqual(['roster', 'scorer']);
    expect(views.map((view) => view.key)).toEqual(['a', 'z']);
  });

  it('buildInstanceViews：dependsOn additive 透传 + 未解析行 fn=null', () => {
    const views = buildInstanceViews([
      instance({ id: 'r1', key: 'k', value: ['roster'], dependsOn: ['a', 'b'] }),
      { id: 'r2', key: 'free', value: 'plain-text' },
    ]);

    expect(views[0].fn).toBeNull();
    expect(views[1].dependsOn).toEqual(['a', 'b']);
    expect(views[1].fn).toBe('roster');
  });

  it('findDuplicateKeys：输出键重复检出，空白键忽略', () => {
    expect(
      findDuplicateKeys([
        { id: 'a', key: 'best' },
        { id: 'b', key: 'best' },
        { id: 'c', key: '  ' },
        { id: 'd', key: 'other' },
      ]),
    ).toEqual(['best']);
    expect(findDuplicateKeys([{ id: 'a', key: 'only' }])).toEqual([]);
  });

  it('summarizeInstanceDrift：按 rowId 聚合三类计数', () => {
    const drift = computeFunctionArgsDrift(
      [{ id: 'r1', key: 'best', type: 'function', value: { $call: 'roster', kwargs: { tenant: 'a', extra: 1 } } }],
      { mode: 'scoped' as const, functions: [funcDefDrift] },
    );

    const summary = summarizeInstanceDrift(drift);
    expect(summary.r1).toEqual({ missing: 1, unrecognized: 1 });
  });
});
