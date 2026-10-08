import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CustomNodeSpecification } from '../nodes/custom-node';
import { definePack, resolveCustomNode } from '../nodes/resolve-custom-node';

type Spec = CustomNodeSpecification<object, string>;

const spec = (kind: string, extra: Partial<Spec> = {}): Spec =>
  ({
    kind,
    displayName: kind,
    generateNode: () => ({ name: kind }) as never,
    renderNode: (() => null) as never,
    ...extra,
  }) as Spec;

// vitest 不天然静音 console.warn，冲突告警用例需临时截获
afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveCustomNode（ADR-017 §2 编辑接管层注册表）', () => {
  test('kind 精确匹配命中', () => {
    const roster = spec('roster');
    expect(resolveCustomNode([spec('crypto'), roster], { kind: 'roster' })).toBe(roster);
  });

  test('kind 精确组按 rank 降序；同 rank 按声明序', () => {
    const legacy = spec('udf', { rank: -10 });
    const official = spec('udf', { rank: 10 });
    const plain = spec('udf');
    // rank 降序：官方覆盖胜出
    expect(resolveCustomNode([legacy, plain, official], { kind: 'udf' })).toBe(official);
    // 同 rank：声明序
    expect(resolveCustomNode([plain, legacy], { kind: 'udf' })).toBe(plain);
  });

  test('kind 精确先行——谓词组匹配也不得过显式归属', () => {
    const exact = spec('roster');
    const predicate = spec('generic', {
      tester: () => true, // 万能谓词
      rank: 100,
    });
    expect(resolveCustomNode([predicate, exact], { kind: 'roster' })).toBe(exact);
  });

  test('同 kind 双 spec：tester 组内仲裁按 config 分流（多代编辑器场景）', () => {
    const v1 = spec('riskQuery', {
      tester: (ctx) => (ctx.config as { schemaVersion?: number })?.schemaVersion === 1,
    });
    const v2 = spec('riskQuery', {
      tester: (ctx) => (ctx.config as { schemaVersion?: number })?.schemaVersion === 2,
      rank: 10,
    });
    // kind 收窄候选（两个同 kind 都入组，v2 rank 高在前），tester 分流
    expect(resolveCustomNode([v1, v2], { kind: 'riskQuery', config: { schemaVersion: 1 } })).toBe(v1);
    expect(resolveCustomNode([v1, v2], { kind: 'riskQuery', config: { schemaVersion: 2 } })).toBe(v2);
  });

  test('精确组 tester 全拒 → 回落跨 kind 谓词组（而非直接无主）', () => {
    const strict = spec('roster', { tester: () => false });
    const fallback = spec('legacy-fallback', { tester: () => true });
    expect(resolveCustomNode([strict, fallback], { kind: 'roster' })).toBe(fallback);
  });

  test('同 kind 无 tester：rank 定胜负，语义与纯排序一致（向后兼容）', () => {
    const a = spec('k');
    const b = spec('k', { rank: 5 });
    expect(resolveCustomNode([a, b], { kind: 'k' })).toBe(b);
  });

  test('tester 谓词组：kind 未命中时按 rank 降序接管', () => {
    const v1 = spec('legacy-editor', {
      tester: (ctx) => (ctx.config as { schemaVersion?: number })?.schemaVersion === 1,
    });
    const v2 = spec('v2-editor', {
      tester: (ctx) => (ctx.config as { schemaVersion?: number })?.schemaVersion === 2,
      rank: 5,
    });
    expect(resolveCustomNode([v1, v2], { kind: 'roster', config: { schemaVersion: 2 } })).toBe(v2);
    expect(resolveCustomNode([v1, v2], { kind: 'roster', config: { schemaVersion: 1 } })).toBe(v1);
    expect(resolveCustomNode([v1, v2], { kind: 'roster', config: {} })).toBeUndefined();
  });

  test('tester 上下文携带 kind/type/config/node', () => {
    const node = { id: 'n1' };
    const seen: unknown[] = [];
    const spy = spec('spy', {
      tester: (ctx) => {
        seen.push([ctx.kind, ctx.type, ctx.config, ctx.node]);
        return true;
      },
    });
    resolveCustomNode([spy], { kind: 'k', type: 'customNode', config: { a: 1 }, node });
    expect(seen[0]).toEqual(['k', 'customNode', { a: 1 }, node]);
  });

  test('tester 抛异常按不匹配处理（单 pack 故障隔离）', () => {
    const broken = spec('broken', {
      tester: () => {
        throw new Error('pack bug');
      },
      rank: 10,
    });
    const healthy = spec('healthy', { tester: () => true });
    expect(resolveCustomNode([broken, healthy], { kind: 'x' })).toBe(healthy);
    expect(resolveCustomNode([broken], { kind: 'x' })).toBeUndefined();
  });

  test('无 kind 入参时仅 tester 组生效', () => {
    const predicate = spec('catch-all', { tester: (ctx) => ctx.kind === '' });
    expect(resolveCustomNode([spec('a'), predicate], { type: 'customNode' })).toBe(predicate);
  });

  test('undefined/空数组安全', () => {
    expect(resolveCustomNode(undefined, { kind: 'k' })).toBeUndefined();
    expect(resolveCustomNode([], { kind: 'k' })).toBeUndefined();
  });

  test('开发模式同 rank 冲突 console.warn；不同 rank 静默', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    resolveCustomNode([spec('a'), spec('b')], { kind: 'x' });
    expect(warn).not.toHaveBeenCalled();

    resolveCustomNode([spec('tie-1', { tester: () => true }), spec('tie-2', { tester: () => true })], {
      kind: 'no-kind-hit',
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('tie on rank');
  });

  test('definePack：pack 级 meta 注入（spec 显式 meta 优先）+ 槽位透传', () => {
    const pack = definePack({
      namespace: 'verdict-risk',
      version: '2.1.0',
      license: 'proprietary',
      specs: [spec('roster'), spec('matrix', { meta: { origin: 'reference', version: '0.0.1' } })],
      migrations: [{ from: '1.0.0', describe: 'seed', migrate: (c) => c }],
    });
    expect(pack.specs[0].meta).toEqual({ origin: 'extension', version: '2.1.0', license: 'proprietary' });
    // spec 已带 meta：显式值优先（不静默覆盖声明）
    expect(pack.specs[1].meta).toEqual({ origin: 'reference', version: '0.0.1', license: 'proprietary' });
    expect(pack.migrations).toHaveLength(1);
    // 注入后的 spec 继续被解析器消费
    expect(resolveCustomNode(pack.specs, { kind: 'roster' })?.meta?.version).toBe('2.1.0');
  });
});
