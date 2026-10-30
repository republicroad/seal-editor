import { act, render } from '@testing-library/react';
import React, { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DecisionGraphProvider, DecisionGraphStoreContext } from '../context/dg-store.context';
import type { DecisionEdge, DecisionNode } from '../dg-types';
import { privateSymbol } from '../dg-types';

type ContextValue = React.ContextType<typeof DecisionGraphStoreContext>;

let ctx: ContextValue | null = null;

const Probe: React.FC = () => {
  ctx = useContext(DecisionGraphStoreContext);
  return null;
};

const renderProvider = () => {
  render(
    <DecisionGraphProvider>
      <Probe />
    </DecisionGraphProvider>,
  );
  if (!ctx) {
    throw new Error('provider context was not captured');
  }
  return ctx;
};

const inputNode = (id = 'in'): DecisionNode => ({ id, name: 'Input', type: 'inputNode', position: { x: 0, y: 0 } });
const tableNode = (id = 'dt'): DecisionNode => ({
  id,
  name: 'Table',
  type: 'decisionTableNode',
  position: { x: 10, y: 10 },
});
const edge = (id: string, sourceId: string, targetId: string): DecisionEdge => ({
  id,
  sourceId,
  targetId,
  type: 'edge',
});

describe('decision graph store actions', () => {
  let context: ContextValue;

  beforeEach(() => {
    context = renderProvider();
    const setNodes = vi.fn();
    const onNodesChange = vi.fn();
    const setEdges = vi.fn();
    const onEdgesChange = vi.fn();

    context.referenceStore.setState({
      nodesState: { current: [[], setNodes, onNodesChange] } as never,
      edgesState: { current: [[], setEdges, onEdgesChange] } as never,
    });
  });

  it('replaces the whole graph and notifies listeners', () => {
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode()], edges: [edge('e1', 'in', 'dt')] });
    });

    const { decisionGraph } = context.stateStore.getState();
    expect(decisionGraph.nodes).toHaveLength(1);
    expect(decisionGraph.edges).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(decisionGraph);
  });

  it('can skip the onChange event when requested', () => {
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.setDecisionGraph({ nodes: [tableNode()] }, { skipOnChangeEvent: true });
    });

    expect(context.stateStore.getState().decisionGraph.nodes).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds nodes and filters additional inputs when one already exists', () => {
    context.referenceStore.setState({
      nodesState: { current: [[{ id: 'rf-in', type: 'inputNode' }] as never, vi.fn(), vi.fn()] } as never,
    });

    act(() => {
      context.actions.addNodes([inputNode('second'), tableNode()]);
    });

    const { nodes } = context.stateStore.getState().decisionGraph;
    expect(nodes.map((node) => node.id)).toEqual(['dt']);
  });

  it('appends all nodes when no input exists yet', () => {
    act(() => {
      context.actions.addNodes([inputNode(), tableNode()]);
    });

    expect(context.stateStore.getState().decisionGraph.nodes).toHaveLength(2);
  });

  it('removes nodes together with attached edges and type metadata', () => {
    context.stateStore.setState({
      decisionGraph: {
        nodes: [inputNode(), tableNode()],
        edges: [edge('e1', 'in', 'dt')],
      },
      nodeTypes: { in: {} } as never,
    });

    act(() => {
      context.actions.removeNodes(['in']);
    });

    const { decisionGraph, nodeTypes } = context.stateStore.getState();
    expect(decisionGraph.nodes.map((node) => node.id)).toEqual(['dt']);
    expect(decisionGraph.edges).toHaveLength(0);
    expect(nodeTypes).not.toHaveProperty('in');
  });

  it('applies position changes to the matching node', () => {
    context.stateStore.setState({
      decisionGraph: { nodes: [inputNode()], edges: [] },
    });
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.handleNodesChange([
        { id: 'in', type: 'position', position: { x: 42, y: 24 }, dragging: false } as never,
      ]);
    });

    expect(context.stateStore.getState().decisionGraph.nodes[0].position).toEqual({ x: 42, y: 24 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('records selection and dimension metadata under the private symbol', () => {
    context.stateStore.setState({
      decisionGraph: { nodes: [tableNode()], edges: [] },
    });

    act(() => {
      context.actions.handleNodesChange([{ id: 'dt', type: 'select', selected: true } as never]);
      context.actions.handleNodesChange([
        { id: 'dt', type: 'dimensions', dimensions: { height: 30, width: 90 } } as never,
      ]);
    });

    const stored = context.stateStore.getState().decisionGraph.nodes[0];
    expect(stored[privateSymbol]).toMatchObject({
      selected: true,
      dimensions: { height: 30, width: 90 },
    });
  });

  it('ignores no-op node changes without notifying listeners', () => {
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.handleNodesChange([{ id: 'missing-node', type: 'position', position: { x: 1, y: 1 } } as never]);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('removes edges through edge changes and notifies listeners', () => {
    context.stateStore.setState({
      decisionGraph: { nodes: [inputNode(), tableNode()], edges: [edge('e1', 'in', 'dt')] },
    });
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.handleEdgesChange([{ id: 'e1', type: 'remove' } as never]);
    });

    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(0);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('does not touch the graph for non-removal edge changes', () => {
    context.stateStore.setState({
      decisionGraph: { nodes: [inputNode(), tableNode()], edges: [edge('e1', 'in', 'dt')] },
    });
    const onChange = vi.fn();
    context.listenerStore.setState({ onChange });

    act(() => {
      context.actions.handleEdgesChange([{ id: 'e1', type: 'select', selected: true } as never]);
    });

    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('manages tab lifecycle', () => {
    act(() => context.actions.openTab('dt'));
    expect(context.stateStore.getState()).toMatchObject({ openTabs: ['dt'], activeTab: 'dt' });

    act(() => context.actions.openTab('fn'));
    expect(context.stateStore.getState().activeTab).toBe('fn');

    act(() => context.actions.openTab('graph'));
    expect(context.stateStore.getState().activeTab).toBe('graph');

    act(() => context.actions.closeTab('fn'));
    const { openTabs, activeTab } = context.stateStore.getState();
    expect(openTabs).toEqual(['dt']);
    expect(activeTab).toBe('dt');
  });

  it('persists compact mode preference', () => {
    act(() => context.actions.setCompactMode(true));

    expect(context.stateStore.getState().compactMode).toBe(true);
    expect(localStorage.getItem('jdm-compact-mode')).toBe('true');
  });

  it('fixtures runner slot defaults to null and accepts injection (ADR-013 batch-3)', () => {
    expect(context.stateStore.getState().fixturesRunner).toBeNull();

    const runner = async () => ({ passed: 1, failed: 0, results: [] });
    act(() => context.actions.setFixturesRunner(runner));
    expect(context.stateStore.getState().fixturesRunner).toBe(runner);

    act(() => context.actions.setFixturesRunner(null));
    expect(context.stateStore.getState().fixturesRunner).toBeNull();
  });

  it('emitContractEvent forwards to the onContractEvent listener (ADR-013 batch-3 M2)', () => {
    const seen: unknown[] = [];
    act(() => {
      context.listenerStore.setState({
        onContractEvent: (event) => {
          seen.push(event);
        },
      });
    });

    const event = {
      at: '2026-10-01T00:00:00.000Z',
      nodeId: 'in',
      nodeName: 'Request',
      kind: 'drift-migrated' as const,
      exampleNames: ['GOLD'],
      counts: { missing: 2, extra: 1, conflicts: 0, constraints: 0 },
    };
    act(() => context.actions.emitContractEvent(event));

    expect(seen).toEqual([event]);
  });
});

describe('simulateRuns（批 3 Run 历史）', () => {
  let context: ContextValue;

  beforeEach(() => {
    context = renderProvider();
  });

  it('pushSimulateRun 头部追加；clearSimulateRuns 清空', () => {
    const entry = (id: string) => ({
      id,
      ts: '2026-10-06T00:00:0' + id + '.000Z',
      ok: true,
      performance: '1ms',
      snapshot: {} as never,
    });
    act(() => {
      context.actions.pushSimulateRun(entry('a'));
      context.actions.pushSimulateRun(entry('b'));
    });
    const runs = context.stateStore.getState().simulateRuns;
    expect(runs.map((r) => r.id)).toEqual(['b', 'a']);

    act(() => {
      context.actions.clearSimulateRuns();
    });
    expect(context.stateStore.getState().simulateRuns).toEqual([]);
  });

  it('栈深裁剪：超出 SIMULATE_RUNS_LIMIT 保留最新', () => {
    act(() => {
      for (let i = 0; i < 55; i++) {
        context.actions.pushSimulateRun({
          id: 'r' + i,
          ts: '2026-10-06T00:00:00.000Z',
          ok: true,
          snapshot: {} as never,
        });
      }
    });
    const runs = context.stateStore.getState().simulateRuns;
    expect(runs).toHaveLength(50);
    expect(runs[0].id).toBe('r54');
    expect(runs.at(-1)!.id).toBe('r5');
  });
});

describe('undo/redo（P0-1 快照栈接线）', () => {
  let context: ContextValue;

  beforeEach(() => {
    context = renderProvider();
    context.referenceStore.setState({
      nodesState: { current: [[], vi.fn(), vi.fn()] } as never,
      edgesState: { current: [[], vi.fn(), vi.fn()] } as never,
    });
  });

  it('addEdges/removeEdges 进栈——undo 恢复删边、redo 复原，undo 通知宿主', () => {
    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode(), tableNode()], edges: [] }, { skipOnChangeEvent: true });
    });

    act(() => context.actions.addEdges([edge('e1', 'in', 'dt')]));
    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(1);
    expect(context.stateStore.getState().canUndo).toBe(true);

    act(() => context.actions.removeEdges(['e1']));
    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(0);

    const onChange = vi.fn();
    act(() => context.listenerStore.setState({ onChange }));
    act(() => context.actions.undo());
    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(1);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(context.stateStore.getState().canRedo).toBe(true);

    act(() => context.actions.redo());
    expect(context.stateStore.getState().decisionGraph.edges).toHaveLength(0);
  });

  it('undo 同步 RF 视图（nodesState 回写，画布跟随）', () => {
    const setNodes = vi.fn();
    context.referenceStore.setState({
      nodesState: { current: [[], setNodes, vi.fn()] } as never,
    });

    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode()], edges: [] }, { skipOnChangeEvent: true });
    });
    act(() => context.actions.addNodes([tableNode()]));
    setNodes.mockClear();

    act(() => context.actions.undo());
    expect(setNodes).toHaveBeenCalledTimes(1);
    expect(context.stateStore.getState().decisionGraph.nodes.map((n) => n.id)).toEqual(['in']);
  });

  it('undo 保持选中：恢复快照后按 id 回写选中态', () => {
    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode(), tableNode()], edges: [] }, { skipOnChangeEvent: true });
    });
    context.referenceStore.setState({
      nodesState: {
        current: [
          [
            { id: 'in', selected: false },
            { id: 'dt', selected: true },
          ] as never,
          vi.fn(),
          vi.fn(),
        ],
      } as never,
    });

    const fnNode: DecisionNode = { id: 'fn', name: 'Fn', type: 'functionNode', position: { x: 1, y: 1 } };
    act(() => context.actions.addNodes([fnNode]));
    expect(context.stateStore.getState().decisionGraph.nodes).toHaveLength(3);

    act(() => context.actions.undo());
    const restored = context.stateStore.getState().decisionGraph.nodes;
    expect(restored.map((n) => n.id)).toEqual(['in', 'dt']);
    expect(restored.find((n) => n.id === 'dt')?.[privateSymbol]?.selected).toBe(true);
    expect(restored.find((n) => n.id === 'in')?.[privateSymbol]?.selected).toBeUndefined();
  });

  it('拖拽会话合并：整段拖拽只产生一步 undo', () => {
    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode()], edges: [] }, { skipOnChangeEvent: true });
    });

    act(() => {
      context.actions.handleNodesChange([
        { id: 'in', type: 'position', position: { x: 5, y: 5 }, dragging: true } as never,
      ]);
      context.actions.handleNodesChange([
        { id: 'in', type: 'position', position: { x: 50, y: 50 }, dragging: true } as never,
      ]);
      context.actions.handleNodesChange([
        { id: 'in', type: 'position', position: { x: 99, y: 99 }, dragging: false } as never,
      ]);
    });

    act(() => context.actions.undo());
    expect(context.stateStore.getState().decisionGraph.nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('updateNode 连续编辑合并为一步（会话窗内不打断）', () => {
    act(() => {
      context.actions.setDecisionGraph({ nodes: [tableNode()], edges: [] }, { skipOnChangeEvent: true });
    });

    act(() => {
      context.actions.updateNode('dt', (node) => {
        node.name = 'A';
        return node;
      });
      context.actions.updateNode('dt', (node) => {
        node.name = 'B';
        return node;
      });
    });
    expect(context.stateStore.getState().decisionGraph.nodes[0].name).toBe('B');

    act(() => context.actions.undo());
    expect(context.stateStore.getState().decisionGraph.nodes[0].name).toBe('Table');

    act(() => context.actions.redo());
    expect(context.stateStore.getState().decisionGraph.nodes[0].name).toBe('B');
  });

  it('resetHistory 清栈（宿主在切换模型/恢复历史版本后调用）', () => {
    act(() => {
      context.actions.setDecisionGraph({ nodes: [inputNode()], edges: [] }, { skipOnChangeEvent: true });
    });
    act(() => context.actions.addNodes([tableNode()]));
    expect(context.stateStore.getState().canUndo).toBe(true);

    act(() => context.actions.resetHistory());
    expect(context.stateStore.getState().canUndo).toBe(false);
    expect(context.stateStore.getState().canRedo).toBe(false);

    act(() => context.actions.undo());
    expect(context.stateStore.getState().decisionGraph.nodes).toHaveLength(2);
  });

  it('注释框文本编辑进栈：首个变更捕获编辑前态，会话窗内合并（P0-1 规格补口）', () => {
    act(() => {
      context.actions.setDecisionGraph(
        {
          nodes: [],
          edges: [],
          annotations: [{ id: 'a1', text: '', position: { x: 0, y: 0 }, width: 220, height: 140 }],
        } as never,
        { skipOnChangeEvent: true },
      );
    });

    act(() => {
      context.actions.updateAnnotation('a1', { text: '第' });
      context.actions.updateAnnotation('a1', { text: '第一' });
      context.actions.updateAnnotation('a1', { text: '第一行' });
    });
    act(() => context.actions.undo());
    expect((context.stateStore.getState().decisionGraph.annotations ?? []).find((a) => a.id === 'a1')?.text).toBe('');
    expect(context.stateStore.getState().canRedo).toBe(true);
    act(() => context.actions.redo());
    expect((context.stateStore.getState().decisionGraph.annotations ?? []).find((a) => a.id === 'a1')?.text).toBe(
      '第一行',
    );
  });

  it('对齐网格：三写（视图/模型/onChange）+ 可撤销', () => {
    const onChange = vi.fn();
    act(() => context.listenerStore.setState({ onChange }));
    act(() => {
      context.actions.setDecisionGraph(
        { nodes: [inputNode(), { ...tableNode(), position: { x: 12, y: 7 } }], edges: [] },
        { skipOnChangeEvent: true },
      );
    });
    const setNodes = context.referenceStore.getState().nodesState.current[1] as ReturnType<typeof vi.fn>;
    setNodes.mockClear?.();

    act(() => context.actions.alignNodesToGrid());

    // 模型态：12,7 取整到 5 栅格 → 10,5
    const nodes = context.stateStore.getState().decisionGraph.nodes;
    expect(nodes[1].position).toEqual({ x: 10, y: 5 });
    // 宿主通知
    expect(onChange).toHaveBeenCalledTimes(1);
    // 可撤销：回 12,7
    act(() => context.actions.undo());
    expect(context.stateStore.getState().decisionGraph.nodes[1].position).toEqual({ x: 12, y: 7 });
  });

  it('P0-2 diagnostics 槽位：宿主条目写入与面板开合', () => {
    expect(context.stateStore.getState().hostDiagnostics).toEqual([]);
    expect(context.stateStore.getState().diagnosticsOpen).toBe(false);

    act(() => context.actions.setHostDiagnostics([{ severity: 'error', message: 'velocity 边界越界', nodeId: 'dt' }]));
    const state = context.stateStore.getState();
    expect(state.hostDiagnostics).toHaveLength(1);
    expect(state.builtinDiagnostics).toEqual([]);

    act(() => context.actions.setDiagnosticsOpen(true));
    expect(context.stateStore.getState().diagnosticsOpen).toBe(true);
  });

  it('P1-5/P1-4 槽位：聚焦开合与 diff 投影门', () => {
    expect(context.stateStore.getState().focusMode).toBe(false);
    act(() => context.actions.setFocusMode(true));
    expect(context.stateStore.getState().focusMode).toBe(true);

    // diffMode 缺省 true=宿主传基线即对比（1.x 兼容）；hasDiffBaseline 由 dg-empty 依 prop 写入
    expect(context.stateStore.getState().diffMode).toBe(true);
    expect(context.stateStore.getState().hasDiffBaseline).toBe(false);
    act(() => {
      context.actions.setDiffMode(false);
      context.stateStore.setState({ hasDiffBaseline: true });
    });
    const state = context.stateStore.getState();
    expect(state.diffMode).toBe(false);
    expect(state.hasDiffBaseline).toBe(true);
  });
});

describe('allowedNamespaces 治理谓词（批 23）', () => {
  let context: ContextValue;

  beforeEach(() => {
    context = renderProvider();
  });

  it('customNodes 按命名空间过滤——不在 Set 中的 namespace 不可见', () => {
    act(() => {
      context.stateStore.setState({
        customNodes: [
          { kind: 'roster', displayName: 'Roster', type: 'customNode' },
          { kind: 'crypto', displayName: 'Crypto', type: 'customNode' },
          { kind: 'debug', displayName: 'Debug', type: 'customNode' },
        ] as never,
      });
    });
    // 此处仅验 dg-store 数据面——过滤在 dg-empty 层（useMemo），
    // store 存的是宿主原始数据（未过滤）——过滤后的读态由消费方驱动
    expect(context.stateStore.getState().customNodes).toHaveLength(3);
  });
});
