import { beforeEach, describe, expect, it } from 'vitest';

import { getCompletions, setUdfCompletions } from './completion';

// 移植自 jdm 批 1/2 的同名测试（WS2 A2 + A4）——本仓补全消费端（zen.ts 的
// applyCompletion/topLevelCompletions/hover）与 jdm 同源，契约一致。
describe('setUdfCompletions (轨道 B A2)', () => {
  beforeEach(() => {
    setUdfCompletions([]);
  });

  it('merges registry tools into the completion list as function entries', () => {
    setUdfCompletions([
      {
        name: 'roster',
        title: '名单查询',
        description: '按名单名称查询成员',
        parameters: {
          properties: { roster: { type: 'string', description: '名单名称' }, value: { type: 'string' } },
          required: ['roster'],
        },
      },
    ]);

    const udf = getCompletions().filter((c) => c.label === 'roster');
    expect(udf).toHaveLength(1);
    expect(udf[0].type).toBe('function');
    expect(udf[0].kind).toBe('function');
    expect(udf[0].detail).toBe('roster(roster, value)');
    expect(udf[0].info).toContain('名单查询');
    expect(udf[0].info).toContain('roster (string) — 名单名称');
    expect(udf[0].boost ?? 0).toBeGreaterThan(0);
  });

  it('supports zero-parameter tools and clears on empty injection', () => {
    setUdfCompletions([{ name: 'current_date' }]);
    expect(getCompletions().find((c) => c.label === 'current_date')?.info).toContain('无参数');

    setUdfCompletions([]);
    expect(getCompletions().find((c) => c.label === 'current_date')).toBeUndefined();
  });
});

describe('setUdfCompletions (轨道 B A4 弃用标记)', () => {
  beforeEach(() => {
    setUdfCompletions([]);
  });

  it('flags deprecated tools in the completion info', () => {
    setUdfCompletions([
      {
        name: 'legacy_hash',
        title: '旧版摘要',
        deprecated: { since: '0.6.0', note: '请改用 crypto 函数' },
        parameters: { properties: {} },
      },
    ]);

    const info = getCompletions().find((c) => c.label === 'legacy_hash')?.info ?? '';
    expect(info).toContain('⚠️ 已弃用（自 0.6.0 起）: 请改用 crypto 函数');
  });
});
