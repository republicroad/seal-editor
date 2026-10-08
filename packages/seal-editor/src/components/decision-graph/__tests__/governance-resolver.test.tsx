// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React, { useContext } from 'react';
import { describe, expect, it } from 'vitest';

import { DecisionGraphProvider, DecisionGraphStoreContext } from '../context/dg-store.context';
import { DecisionGraphEmpty } from '../dg-empty';
import type { CustomNodeSpecification } from '../nodes/custom-node';
import { resolveCustomNode } from '../nodes/resolve-custom-node';

type ContextValue = React.ContextType<typeof DecisionGraphStoreContext>;

let ctx: ContextValue | null = null;

const Probe: React.FC = () => {
  ctx = useContext(DecisionGraphStoreContext);
  return null;
};

const spec = (kind: string, extra: Partial<CustomNodeSpecification<object, string>> = {}) =>
  ({
    kind,
    displayName: kind,
    generateNode: () => ({}) as never,
    renderNode: (() => null) as never,
    ...extra,
  }) as CustomNodeSpecification<object, string>;

/**
 * 治理 → 解析器顺序契约（ADR-017 × 批 23 allowedNamespaces）：
 * dg-empty 先按 allowedNamespaces 过滤再入 store，resolver 消费过滤后列表——
 * 结构上保证 tester 谓词无法复活被治理关闭的 namespace。
 */
describe('allowedNamespaces 过滤先于 resolveCustomNode（治理语义不被 tester 绕过）', () => {
  it('store 只收过滤后的列表；万能 tester 对被过滤 kind 无能为力', () => {
    const omnipotentTester = spec('omni', { tester: () => true, rank: 100 });
    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty
          value={{ nodes: [], edges: [] }}
          customNodes={[omnipotentTester, spec('roster'), spec('crypto')]}
          allowedNamespaces={new Set(['roster'])}
        />
        <Probe />
      </DecisionGraphProvider>,
    );

    expect(ctx).not.toBeNull();
    const visible = ctx!.stateStore.getState().customNodes;
    expect(visible.map((node) => node.kind)).toEqual(['roster']);

    // 被治理过滤的 crypto：resolver 输入里根本没有该 spec，万能 tester 也无从命中
    expect(resolveCustomNode(visible, { kind: 'crypto' })).toBeUndefined();
    // 未被过滤的 roster：tester 不必要，kind 精确命中
    expect(resolveCustomNode(visible, { kind: 'roster' })?.kind).toBe('roster');
  });

  it('allowedNamespaces 缺省（undefined/空集）= 全量可见，tester 正常接管', () => {
    const testerSpec = spec('by-shape', { tester: (nodeCtx) => (nodeCtx.config as { v?: number })?.v === 2 });
    render(
      <DecisionGraphProvider>
        <DecisionGraphEmpty value={{ nodes: [], edges: [] }} customNodes={[testerSpec, spec('roster')]} />
        <Probe />
      </DecisionGraphProvider>,
    );

    const visible = ctx!.stateStore.getState().customNodes;
    expect(visible).toHaveLength(2);
    // kind 精确先行（ADR-017 §2）：同 kind 有显式归属时 tester 不参与
    expect(resolveCustomNode(visible, { kind: 'roster', config: { v: 2 } })?.kind).toBe('roster');
    // 非 kind 可判定的接管：tester 按 config 形态认领未知 kind
    expect(resolveCustomNode(visible, { kind: 'mystery', config: { v: 2 } })?.kind).toBe('by-shape');
  });
});
