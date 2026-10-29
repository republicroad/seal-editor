import { type VariableType } from '@gorules/zen-engine-wasm';
import type { Monaco } from '@monaco-editor/react';
import type { EdgeChange, NodeChange, ReactFlowInstance, useEdgesState, useNodesState } from '@xyflow/react';
import equal from 'fast-deep-equal/es6/react';
import type { WritableDraft } from 'immer';
import { produce } from 'immer';
import React, { type MutableRefObject, createRef, useMemo, useRef } from 'react';
import { match } from 'ts-pattern';
import type { StoreApi, UseBoundStore } from 'zustand';
import { create, useStore } from 'zustand';

import { computeAutoLayout } from '../../../helpers/auto-layout';
import { snapNodesToGrid } from '../../../helpers/graph-align';
import { useMemoEquality } from '../../../helpers/use-memoized-selector';
import { normalizeCustomNodeExpressions } from '../../../helpers/utility';
import type { DictionaryMap } from '../../../theme';
import type { CodeEditorProps } from '../../code-editor';
import type { JdmUiMode } from '../../decision-table/context/dt-store.context';
import type { FunctionLibrary } from '../../function/helpers/libs';
import type { DecisionEdge, DecisionGraphAnnotation, DecisionGraphType, DecisionNode } from '../dg-types';
import { privateSymbol } from '../dg-types';
import { mapToGraphEdge, mapToGraphEdges, mapToGraphNode, mapToGraphNodes } from '../dg-util';
import { buildContractFixtures, graphFingerprint, listInputNodes, runFixturesForNode } from '../graph/fixtures-run';
import type { ContractDriftEvent, ExampleRunReport, FixturesRunner } from '../graph/fixtures-runner';
import type { useGraphClipboard } from '../hooks/use-graph-clipboard';
import type { CustomNodeSpecification } from '../nodes/custom-node';
import { NodeKind, type NodeSpecification } from '../nodes/specifications/specification-types';
import type { Simulation } from '../simulator/simulation.types';
import { applyCloseTab, applyOpenTab } from './dg-tab-strategy';
import { createUndoRedoStack } from './undo-redo';

/** Run 历史一笔（批 3 时间线）：snapshot 保整次结果，可回看旧输出 */
export type SimulateRunEntry = {
  id: string;
  ts: string;
  ok: boolean;
  performance?: string;
  error?: string;
  /** 置顶保留：环形淘汰与载荷持久化的豁免标记 */
  pinned?: boolean;
  /** 载荷（持久化场景：未 pin 的条目可被剥除——只剩元数据行） */
  snapshot?: Simulation;
};

/** 栈深上限（防超大输出堆积） */
export const SIMULATE_RUNS_LIMIT = 50;

export type PanelType = {
  id: string;
  icon: React.ReactNode;
  title: string;
  renderPanel?: () => React.ReactNode;
  hideHeader?: boolean;
  onClick?: () => void;
};

type DraftUpdateCallback<T> = (draft: WritableDraft<T>) => WritableDraft<T>;

export type ViewConfigPermission = 'edit:values' | 'edit:rules' | 'edit:full';

export type ViewConfig = {
  enabled: boolean;
  description?: string;
  permissions?: Record<string, ViewConfigPermission | null | undefined> | null;
};

export enum NodeTypeKind {
  Input,
  Output,
  InferredInput,
  InferredOutput,
}

export type SetDecisionGraphOptions = {
  skipOnChangeEvent?: boolean;
};

/**
 * simulator ↔ 示例绑定（运行态，不入图）：身份 = nodeId + exampleId（契约稳定 id）。
 * 业界铁律：绑定不用下标——删除/重排示例后下标全体漂移，id 恒定；消费方按
 * 当前示例集解析下标，id 失配自愈为未绑定（面板 effect 会重绑缺省项）。
 */
export type SimulatorExampleBinding = {
  nodeId: string;
  exampleId: string;
  sourceName?: string;
} | null;

export type DecisionGraphStoreType = {
  state: {
    id?: string;
    hideLeftToolbar?: boolean;
    components: NodeSpecification[];
    disabled?: boolean;
    decisionGraph: DecisionGraphType;
    hoveredEdgeId: string | null;
    openTabs: string[];
    activeTab: string;

    viewConfigCta?: string;
    viewConfig?: ViewConfig;

    name: string;

    canUndo: boolean;
    canRedo: boolean;

    customNodes: CustomNodeSpecification<object, any>[];

    /** ADR-024 D2：函数参考面板目录（Libraries 页签；缺省内置表，宿主可注入） */
    functionLibraries: FunctionLibrary[];

    panels?: PanelType[];
    activePanel?: string;
    onPanelsChange?: (val?: string) => void;

    simulate?: Simulation;

    /** A3 即时求值：重跑请求计数器——dt 页签内容变更时递增，simulator 请求面板监听后按当前输入复跑 */
    simulateRequestTick: number;

    /** Run 历史（新运行头部追加） */
    simulateRuns: SimulateRunEntry[];

    /** ⌘K 全局调色板开合（批 20：GraphSideToolbar 触发钮与弹层分居两处，经 store 联通） */
    commandMenuOpen: boolean;

    /** 画布锁（flow-1 形态参照）：锁定节点拖拽/连线/重连，保留平移缩放与选择 */
    canvasLocked: boolean;

    /** 网格吸附开关（拖拽过程吸附；snapGrid [5,5] 常开） */
    snapToGrid: boolean;

    /** ⌘K 二期：宿主注入的扩展命令（保存/验证/导出/皮肤等） */
    extraCommands: Array<{
      id: string;
      group: string;
      label: string;
      icon?: React.ReactNode;
      keywords: string;
      run: () => void;
    }>;

    user: string;

    simulatorRequest?: string;
    simulatorExampleBinding?: SimulatorExampleBinding;

    /** ADR-013 批次三：Run all 执行槽位——宿主注入（appshell = simulateHandler 适配），未注入时 Run all 不渲染 */
    fixturesRunner?: FixturesRunner | null;

    /** 分屏范式 §1.2：Fixtures 面板图级运行状态（跨页签存续） */
    fixturesRun?: {
      nodeId: string;
      status: 'running' | 'done' | 'error';
      report?: ExampleRunReport;
      error?: string;
      /** 运行时点的图指纹：与当前图比对 → 报告过期检查（深链/调试装载防旧错困惑） */
      graphFingerprint?: string;
    } | null;
    /** 域约束：规则图至多一个 inputNode——面板直接作用于它，无绑定概念 */

    compactMode?: boolean;

    dictionaries?: DictionaryMap;
    mode?: JdmUiMode;

    nodeTypes: Record<string, Partial<Record<NodeTypeKind, VariableType>>>;
    globalType: Record<string, VariableType>;
  };

  references: {
    nodesState: MutableRefObject<ReturnType<typeof useNodesState>>;
    edgesState: MutableRefObject<ReturnType<typeof useEdgesState>>;
    reactFlowInstance: MutableRefObject<ReactFlowInstance | null>;
    graphClipboard: MutableRefObject<ReturnType<typeof useGraphClipboard>>;
  };

  actions: {
    setDecisionGraph: (val: Partial<DecisionGraphType>, options?: SetDecisionGraphOptions) => void;

    undo: () => void;
    redo: () => void;
    commitUndo: () => void;
    /** 历史边界重置（切换模型/恢复历史版本后由宿主调用——快照栈跨文档无意义） */
    resetHistory: () => void;

    handleNodesChange: (nodesChange: NodeChange[]) => void;
    handleEdgesChange: (edgesChange: EdgeChange[]) => void;

    setNodes: (nodes: DecisionNode[]) => void;
    addNodes: (nodes: DecisionNode[]) => void;
    updateNode: (id: string, updater: DraftUpdateCallback<DecisionNode>) => void;
    removeNodes: (ids: string[]) => void;

    /** WS1-R6: dagre auto-layout (lazily imported); optional fitView afterwards */
    autoLayout: (options?: { ranksep?: number; nodesep?: number; fitView?: boolean }) => Promise<void>;

    duplicateNodes: (ids: string[]) => void;
    copyNodes: (ids: string[]) => void;
    pasteNodes: () => void;

    setEdges: (edges: DecisionEdge[]) => void;
    addEdges: (edge: DecisionEdge[]) => void;
    removeEdges: (ids: string[]) => void;
    removeEdgeByHandleId: (handleId: string) => void;
    setHoveredEdgeId: (edgeId: string | null) => void;

    closeTab: (id: string, action?: string) => void;
    openTab: (id: string) => void;
    goToNode: (id: string) => void;

    setActivePanel: (panel?: string) => void;

    /** Run 历史追加（头部插入，裁到栈深；pin 条目豁免淘汰） */
    pushSimulateRun: (entry: SimulateRunEntry) => void;
    /** A3 即时求值：请求 simulator 按当前输入复跑一次（计数器语义，面板监听） */
    requestSimulation: () => void;
    /** ⌘K 调色板开合 */
    setCommandMenuOpen: (open: boolean) => void;
    /** 画布锁切换 */
    setCanvasLocked: (locked: boolean) => void;
    /** 网格吸附切换 */
    setSnapToGrid: (on: boolean) => void;
    /** 节点位置对齐网格（B2 整理动作：全量节点取整到 snapGrid） */
    alignNodesToGrid: () => void;
    /** B1 注释框：新增（同时向 React Flow 注入 annotation- 前缀节点） */
    addAnnotation: (position: { x: number; y: number }) => void;
    /** B1 注释框：文本/几何更新（不进 undo 栈——文本逐键不刷栈） */
    updateAnnotation: (id: string, patch: Partial<DecisionGraphAnnotation>) => void;
    /** B1 注释框：删除（同时移除 React Flow 节点） */
    removeAnnotation: (id: string) => void;
    /** B1 注释框：React Flow 节点变更路由（拖拽/缩放/删除——带 annotation- 前缀） */
    applyAnnotationChanges: (changes: NodeChange[]) => void;
    /** 宿主注入扩展命令 */
    setExtraCommands: (
      commands: Array<{
        id: string;
        group: string;
        label: string;
        icon?: React.ReactNode;
        keywords: string;
        run: () => void;
      }>,
    ) => void;
    /** 置顶切换：pin = 环淘汰豁免 + 载荷持久化保留 */
    setSimulateRunPinned: (id: string, pinned: boolean) => void;
    /** 持久化水合：整表替换（面板挂载时从 localStorage 恢复） */
    hydrateSimulateRuns: (entries: SimulateRunEntry[]) => void;
    /** 清空 Run 历史 */
    clearSimulateRuns: () => void;

    setCompactMode: (mode: boolean) => void;
    toggleCompactMode: () => void;

    setNodeType: (id: string, kind: NodeTypeKind, vt: VariableType) => void;
    removeNodeType: (id: string, kind?: NodeTypeKind) => void;

    setSimulatorRequest: (req: string) => void;
    setSimulatorExampleBinding: (binding?: SimulatorExampleBinding) => void;
    setFixturesRunner: (runner: FixturesRunner | null) => void;
    /** Fixtures 面板/节点页签共用运行入口：作用于图内唯一 inputNode；打开面板 + 图级状态机驱动 */
    runFixtures: () => Promise<void>;
    /** 漂移事件外发：经 listeners.onContractEvent 投递（无订阅者时静默） */
    emitContractEvent: (event: ContractDriftEvent) => void;

    triggerNodeSelect: (id: string, mode: 'toggle' | 'only') => void;
  };

  listeners: {
    onChange?: (val: DecisionGraphType) => void;
    onPanelsChange?: (val?: string) => void;
    onContractEvent?: (event: ContractDriftEvent) => void;
    onReactFlowInit?: (instance: ReactFlowInstance) => void;
    onCodeExtension?: CodeEditorProps['extension'];
    onFunctionReady?: (monaco: Monaco) => void;
    onViewConfigCta?: () => void;
  };
};

export type ExposedStore<T> = UseBoundStore<StoreApi<T>> & {
  setState: (partial: Partial<T>) => void;
};

// Empty-object default is safe: consumers only render inside
// DecisionGraphProvider, which supplies the real stores on mount.
export const DecisionGraphStoreContext = React.createContext<{
  stateStore: ExposedStore<DecisionGraphStoreType['state']>;
  listenerStore: ExposedStore<DecisionGraphStoreType['listeners']>;
  referenceStore: ExposedStore<DecisionGraphStoreType['references']>;
  actions: DecisionGraphStoreType['actions'];
}>(
  // Double-cast is intentional: consumers only render inside
  // DecisionGraphProvider, which supplies the real stores on mount.
  {} as unknown as {
    stateStore: ExposedStore<DecisionGraphStoreType['state']>;
    listenerStore: ExposedStore<DecisionGraphStoreType['listeners']>;
    referenceStore: ExposedStore<DecisionGraphStoreType['references']>;
    actions: DecisionGraphStoreType['actions'];
  },
);

export type DecisionGraphContextProps = {
  //
};

export const DecisionGraphProvider: React.FC<React.PropsWithChildren<DecisionGraphContextProps>> = (props) => {
  const { children } = props;

  const stateStore = useMemo(
    () =>
      create<DecisionGraphStoreType['state']>()(() => ({
        id: undefined,
        simulate: undefined,
        simulateRequestTick: 0,
        simulateRuns: [],
        commandMenuOpen: false,
        canvasLocked: false,
        snapToGrid: true,
        extraCommands: [],
        decisionGraph: { nodes: [], edges: [] },
        hoveredEdgeId: null,
        openTabs: [],
        activeTab: 'graph',
        name: 'graph.json',
        disabled: false,
        components: [],
        customNodes: [],
        functionLibraries: [],
        activePanel: undefined,
        panels: [],
        user: '',
        fixturesRunner: null,
        fixturesRun: null,
        compactMode: localStorage.getItem('jdm-compact-mode') === 'true',
        nodeTypes: {},
        globalType: {},
        canUndo: false,
        canRedo: false,
      })),
    [],
  );

  const undoRedoStack = useMemo(() => createUndoRedoStack<DecisionGraphType>(100), []);

  // updateNode 防抖：500ms 内同一节点的连续编辑合并为一步
  const editDebounceRef = useRef<{ nodeId: string | null; timer: ReturnType<typeof setTimeout> | null }>({
    nodeId: null,
    timer: null,
  });

  // 节点拖拽会话追踪：首次 position 变更时 pushUndo（捕获拖拽前位置）
  const dragSessionRef = useRef(false);

  const listenerStore = useMemo(
    () =>
      create<DecisionGraphStoreType['listeners']>(() => ({
        onChange: undefined,
        onPanelsChange: undefined,
      })),
    [],
  );

  const referenceStore = useMemo(
    () =>
      create<DecisionGraphStoreType['references']>(() => ({
        nodesState: createRef() as MutableRefObject<ReturnType<typeof useNodesState>>,
        edgesState: createRef() as MutableRefObject<ReturnType<typeof useEdgesState>>,
        graphClipboard: createRef() as MutableRefObject<ReturnType<typeof useGraphClipboard>>,
        reactFlowInstance: createRef() as MutableRefObject<ReactFlowInstance | null>,
      })),
    [],
  );

  const actions = useMemo<DecisionGraphStoreType['actions']>(() => {
    const pushUndo = () => {
      const { decisionGraph } = stateStore.getState();
      undoRedoStack.push(JSON.parse(JSON.stringify(decisionGraph)));
      stateStore.setState({ canUndo: undoRedoStack.canUndo, canRedo: undoRedoStack.canRedo });
    };

    // undo/redo 落地通道：与 setDecisionGraph 同款三写（RF 视图 + 模型态 + 宿主通知）——
    // 只写 decisionGraph 时画布视图不跟随（快照栈时代遗留缺口）
    const applyGraphReplacement = (graph: DecisionGraphType) => {
      const { edgesState, nodesState } = referenceStore.getState();
      edgesState?.current?.[1](mapToGraphEdges(graph?.edges ?? []));
      nodesState?.current?.[1](mapToGraphNodes(graph?.nodes ?? []));
      stateStore.setState({ decisionGraph: graph });
      listenerStore.getState().onChange?.(graph);
    };

    // undo 后保持选中：快照经 JSON 序列化不含 privateSymbol 选中态，恢复前取当前选中集
    // （annotation- 前缀视图节点除外），恢复后按 id 回写
    const preserveSelection = (graph: DecisionGraphType): DecisionGraphType => {
      const { nodesState } = referenceStore.getState();
      const selectedIds = new Set(
        (nodesState.current?.[0] ?? [])
          .filter((n) => n.selected && !String(n.id).startsWith('annotation-'))
          .map((n) => n.id),
      );
      if (selectedIds.size === 0) {
        return graph;
      }
      return produce(graph, (draft) => {
        (draft.nodes ?? []).forEach((node) => {
          if (selectedIds.has(node.id)) {
            node[privateSymbol] ??= {};
            node[privateSymbol].selected = true;
          }
        });
      });
    };

    return {
      undo: () => {
        const current = stateStore.getState().decisionGraph;
        const prev = undoRedoStack.undo(current);
        if (prev === null) return;
        applyGraphReplacement(preserveSelection(prev));
        stateStore.setState({ canUndo: undoRedoStack.canUndo, canRedo: undoRedoStack.canRedo });
      },
      redo: () => {
        const current = stateStore.getState().decisionGraph;
        const next = undoRedoStack.redo(current);
        if (next === null) return;
        applyGraphReplacement(preserveSelection(next));
        stateStore.setState({ canUndo: undoRedoStack.canUndo, canRedo: undoRedoStack.canRedo });
      },
      commitUndo: () => {
        pushUndo();
      },
      resetHistory: () => {
        undoRedoStack.clear();
        stateStore.setState({ canUndo: false, canRedo: false });
      },
      handleNodesChange: (changes = []) => {
        const { nodesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();

        // 拖拽会话追踪：首次拖拽 position 变更时 pushUndo（捕获拖拽前位置）
        const positionChanges = changes.filter((c): c is NodeChange & { type: 'position' } => c.type === 'position');
        if (positionChanges.length > 0) {
          const isDragStart = positionChanges.some((c) => 'dragging' in c && c.dragging === true);
          const isDragEnd = positionChanges.some((c) => 'dragging' in c && c.dragging === false);
          if (isDragStart && !dragSessionRef.current) {
            pushUndo();
            dragSessionRef.current = true;
          }
          if (isDragEnd) {
            dragSessionRef.current = false;
          }
        }

        const [, , onNodesChange] = nodesState.current;

        let hasChanges = false;

        onNodesChange?.(changes);
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          changes.forEach((c) =>
            match(c)
              .with({ type: 'position' }, (p) => {
                const node = draft.nodes.find((n) => n.id === p.id);
                if (node && p.position && !equal(node.position, p.position)) {
                  hasChanges = true;
                  node.position = p.position;
                }
              })
              .with({ type: 'dimensions' }, (d) => {
                const node = draft.nodes.find((n) => n.id === d.id);
                if (node && !equal(node[privateSymbol]?.dimensions, d.dimensions)) {
                  hasChanges = true;
                  node[privateSymbol] ??= {};
                  node[privateSymbol].dimensions = { height: d.dimensions?.height, width: d.dimensions?.width };
                }
              })
              .with({ type: 'select' }, (s) => {
                const node = draft.nodes.find((n) => n.id === s.id);

                if (node && node[privateSymbol]?.selected !== s.selected) {
                  hasChanges = true;
                  node[privateSymbol] ??= {};
                  node[privateSymbol].selected = s.selected;
                }
              })
              .otherwise(() => {
                // No-op
              }),
          );
        });

        if (!hasChanges) {
          return;
        }

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      handleEdgesChange: (changes = []) => {
        const { decisionGraph } = stateStore.getState();
        const { edgesState } = referenceStore.getState();

        const hasStructuralChange = changes.some((c) => c.type === 'remove' || c.type === 'add');
        if (hasStructuralChange) pushUndo();

        edgesState?.current?.[2](changes);
        if (changes.find((c) => c.type === 'remove')) {
          const newDecisionGraph = produce(decisionGraph, (draft) => {
            const edges = (draft.edges || [])
              .map((edge) => {
                const change = changes.find((change) => 'id' in change && change.id === edge.id);
                if (change?.type === 'remove') {
                  return null;
                }
                return edge;
              })
              .filter((node) => !!node) as DecisionEdge[];
            draft.edges = edges;
          });

          stateStore.setState({ decisionGraph: newDecisionGraph });
          listenerStore.getState().onChange?.(newDecisionGraph);
        }
      },
      setNodes: (nodes: DecisionNode[] = []) => {
        const { nodesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        nodesState?.current?.[1](mapToGraphNodes(nodes));

        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.nodes = nodes;
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      autoLayout: async (options) => {
        const { nodesState, reactFlowInstance } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        const modelNodes = decisionGraph?.nodes ?? [];
        const modelEdges = decisionGraph?.edges ?? [];
        if (modelNodes.length === 0) {
          return;
        }

        // rendered nodes carry reactflow's post-mount measurements — prefer
        // them over the fallback estimate so dagre spacing matches reality
        const measured: Record<string, { width: number; height: number }> = {};
        for (const rendered of nodesState?.current?.[0] ?? []) {
          if (rendered.measured?.width && rendered.measured?.height) {
            measured[rendered.id] = { width: rendered.measured.width, height: rendered.measured.height };
          }
        }

        const positions = await computeAutoLayout(modelNodes, modelEdges, measured, options);
        pushUndo();

        const positioned = modelNodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position }));
        // setNodes semantics inlined (store actions are a flat useMemo literal):
        // swap rendered nodes, then the model, then notify the host
        nodesState?.current?.[1](mapToGraphNodes(positioned));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.nodes = positioned;
        });
        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);

        if (options?.fitView !== false) {
          reactFlowInstance.current?.fitView({ padding: 0.15, duration: 400 });
        }
      },
      addNodes: (nodes: DecisionNode[]) => {
        const { nodesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        pushUndo();

        const hasInput = nodesState.current[0]?.some((n) => n.type === NodeKind.Input);
        if (hasInput) {
          nodes = nodes.filter((n) => n.type !== NodeKind.Input);
        }

        nodesState.current[1]?.((n) => n.concat(mapToGraphNodes(nodes)));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.nodes = (draft.nodes || []).concat(nodes);
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      duplicateNodes: (ids) => {
        const { nodesState, edgesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        pushUndo();

        let nodes = (decisionGraph?.nodes || []).filter((n) => ids.includes(n.id));

        const hasInput = nodesState.current[0]?.some((n) => n.type === NodeKind.Input);
        if (hasInput) {
          nodes = nodes.filter((n) => n.type !== NodeKind.Input);
        }

        if (nodes.length === 0) {
          return;
        }

        const nodeIds: Record<string, string> = nodes.reduce(
          (acc, curr) => ({
            ...acc,
            [curr.id]: crypto.randomUUID(),
          }),
          {},
        );

        const newNodes = nodes.map<DecisionNode>((node) => ({
          ...node,
          id: nodeIds[node.id],
          position: {
            x: node.position?.x || 0,
            y: (node.position?.y || 0) + 140,
          },
        }));

        const oldNodeIds = Object.keys(nodeIds);
        const newEdges: DecisionEdge[] = [];

        if (newNodes.length > 0) {
          (edgesState.current?.[0] || []).forEach((edge) => {
            if (oldNodeIds.includes(edge.source) && oldNodeIds.includes(edge.target)) {
              newEdges.push({
                id: crypto.randomUUID(),
                type: edge.type,
                sourceId: nodeIds[edge.source],
                targetId: nodeIds[edge.target],
                sourceHandle: edge.sourceHandle ?? undefined,
                targetHandle: edge.targetHandle ?? undefined,
              });
            }
          });
        }

        nodesState.current[1]?.((n) => n.concat(newNodes.map(mapToGraphNode)));
        edgesState.current[1]?.((e) => e.concat(newEdges.map(mapToGraphEdge)));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.nodes.push(...newNodes);
          draft.edges.push(...newEdges);
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      copyNodes: (ids) => {
        const { graphClipboard, nodesState } = referenceStore.getState();
        if (!graphClipboard.current || !nodesState.current) {
          return;
        }

        const [nodes] = nodesState.current;
        const copyNodes = nodes.filter((n) => ids.includes(n.id));

        graphClipboard.current.copyNodes(copyNodes);
      },
      pasteNodes: () => {
        const { graphClipboard } = referenceStore.getState();
        graphClipboard.current?.pasteNodes?.();
      },
      removeNodes: (ids = []) => {
        const { nodesState, edgesState } = referenceStore.getState();
        const { decisionGraph, nodeTypes } = stateStore.getState();
        pushUndo();

        nodesState.current[1]?.((nodes) => nodes.filter((n) => ids.every((id) => n.id !== id)));
        edgesState.current[1]?.((edges) =>
          edges.filter((e) =>
            ids.every((id) => e.source !== id && e.target !== id && e.sourceHandle !== id && e.targetHandle !== id),
          ),
        );

        const newDecisionGraph = produce(decisionGraph, (draft) => {
          const nodes = draft.nodes || [];
          const edges = draft.edges || [];
          draft.nodes = nodes.filter((n) => ids.every((id) => n.id !== id));
          draft.edges = edges.filter((e) =>
            ids.every((id) => e.sourceId !== id && e.targetId !== id && e.sourceHandle !== id && e.targetHandle !== id),
          );
        });

        const newNodeTypes = produce(nodeTypes, (draft) => {
          ids.forEach((id) => {
            if (id in draft) {
              delete draft[id];
            }
          });
        });

        stateStore.setState({ decisionGraph: newDecisionGraph, nodeTypes: newNodeTypes });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      addEdges: (edges: DecisionEdge[]) => {
        const { edgesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        // 画布连线（onConnect 主通道）可撤销
        pushUndo();

        edgesState.current?.[1]?.((els) => els.concat(edges.map(mapToGraphEdge)));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.edges = (draft.edges || []).concat(edges);
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      setEdges: (edges = []) => {
        const { edgesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();

        edgesState?.current?.[1]?.(mapToGraphEdges(edges));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.edges = edges;
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      removeEdges: (ids) => {
        const { edgesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        // 画布删边（Backspace/右键）可撤销
        pushUndo();

        edgesState?.current?.[1]?.((edges) => edges.filter((e) => !ids.find((id) => e.id === id)));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.edges = draft.edges.filter((e) => !ids.find((id) => e.id === id));
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      removeEdgeByHandleId: (handleId: string) => {
        if (!handleId) return;
        const { edgesState } = referenceStore.getState();
        const { decisionGraph } = stateStore.getState();
        pushUndo();
        edgesState?.current?.[1]?.((edges) => edges.filter((e) => e.sourceHandle !== handleId));
        const newDecisionGraph = produce(decisionGraph, (draft) => {
          draft.edges = draft.edges.filter((e) => e.sourceHandle !== handleId);
        });

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      updateNode: (id, updater) => {
        // Debounced undo: first edit of a session captures pre-edit state;
        // rapid consecutive edits on the same node merge into one undo step
        const isContinuation = editDebounceRef.current.nodeId === id && editDebounceRef.current.timer !== null;
        if (!isContinuation) {
          pushUndo();
        }
        if (editDebounceRef.current.timer) clearTimeout(editDebounceRef.current.timer);
        editDebounceRef.current.nodeId = id;
        editDebounceRef.current.timer = setTimeout(() => {
          editDebounceRef.current.nodeId = null;
          editDebounceRef.current.timer = null;
        }, 500);

        const { decisionGraph } = stateStore.getState();
        const { nodesState } = referenceStore.getState();
        const [nodes, setNodes] = nodesState.current;

        const newDecisionGraph = produce(decisionGraph, (draft) => {
          const node = (draft.nodes ?? []).find((node) => node?.id === id);
          if (!node) {
            return;
          }

          updater(node);
        });

        const changedNode = newDecisionGraph.nodes.find((n) => n.id === id);
        if (!changedNode) {
          return;
        }

        const graphChangedNode = mapToGraphNode(changedNode as DecisionNode);
        const existingGraphNode = nodes.find((n) => n.id === id);
        if (!equal(graphChangedNode, existingGraphNode)) {
          setNodes((nodes) => nodes.map((n) => (n.id === id ? graphChangedNode : n)));
        }

        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
      setDecisionGraph: (graph, options = {}) => {
        const { decisionGraph } = stateStore.getState();
        const { edgesState, nodesState } = referenceStore.getState();
        const { skipOnChangeEvent = false } = options;

        const newDecisionGraph = produce(decisionGraph, (draft) => {
          Object.assign(draft, graph);
          if (draft.nodes) {
            draft.nodes = normalizeCustomNodeExpressions(draft.nodes);
          }
        });

        edgesState?.current?.[1](mapToGraphEdges(newDecisionGraph?.edges ?? []));
        nodesState?.current?.[1](mapToGraphNodes(newDecisionGraph?.nodes ?? []));
        stateStore.setState({
          decisionGraph: newDecisionGraph,
        });
        if (!skipOnChangeEvent) {
          listenerStore.getState().onChange?.(newDecisionGraph);
        }
      },
      setHoveredEdgeId: (edgeId) => stateStore.setState({ hoveredEdgeId: edgeId }),
      goToNode: (id: string) => {
        if (stateStore.getState().activeTab !== 'graph') {
          return;
        }

        const { reactFlowInstance } = referenceStore.getState();
        if (!reactFlowInstance.current) {
          return;
        }

        const node = reactFlowInstance.current.getNode(id);
        if (!node) {
          return;
        }

        reactFlowInstance.current.fitView({ nodes: [node], duration: 1_000, maxZoom: 1.25 });
      },
      openTab: (id: string) => {
        const { openTabs } = stateStore.getState();
        stateStore.setState(applyOpenTab(openTabs, id));
      },
      closeTab: (id: string, action?: string) => {
        const { openTabs, activeTab } = stateStore.getState();
        stateStore.setState(applyCloseTab(openTabs, activeTab, id, action));
      },
      setCommandMenuOpen: (open) => {
        stateStore.setState({ commandMenuOpen: open });
      },
      setCanvasLocked: (locked) => {
        stateStore.setState({ canvasLocked: locked });
      },
      setSnapToGrid: (on) => {
        stateStore.setState({ snapToGrid: on });
      },
      // B2 整理动作：全量节点位置取整到 snapGrid（[5,5]，与拖拽吸附同栅格）
      alignNodesToGrid: () => {
        const { decisionGraph } = stateStore.getState();
        if (!decisionGraph) {
          return;
        }
        const aligned = snapNodesToGrid(decisionGraph.nodes as Array<{ position: { x: number; y: number } }>);
        stateStore.setState({
          decisionGraph: {
            ...decisionGraph,
            nodes: decisionGraph.nodes.map((node, i) => ({ ...node, position: aligned[i].position })),
          } as typeof decisionGraph,
        });
      },
      // B1 注释框：新增——pushUndo + 双写（RF 视图节点 + decisionGraph.annotations 持久化）
      addAnnotation: (position) => {
        const annotation: DecisionGraphAnnotation = {
          id: crypto.randomUUID(),
          text: '',
          position,
          width: 220,
          height: 140,
        };
        pushUndo();
        const { nodesState } = referenceStore.getState();
        nodesState.current[1]?.((nodes) =>
          nodes.concat({
            id: `annotation-${annotation.id}`,
            type: 'annotationNode',
            position: annotation.position,
            data: { text: annotation.text },
            style: { width: annotation.width, height: annotation.height },
            zIndex: -1,
          } as any),
        );
        const { decisionGraph } = stateStore.getState();
        const next = produce(decisionGraph, (draft) => {
          draft.annotations = [...(draft.annotations || []), annotation];
        });
        stateStore.setState({ decisionGraph: next });
        listenerStore.getState().onChange?.(next);
      },
      // 文本/几何直接更新（不 pushUndo——文本逐键不刷 undo 栈）
      updateAnnotation: (id, patch) => {
        const { decisionGraph } = stateStore.getState();
        if (!(decisionGraph.annotations || []).some((a) => a.id === id)) {
          return;
        }
        const next = produce(decisionGraph, (draft) => {
          const annotation = draft.annotations?.find((a) => a.id === id);
          if (annotation) {
            Object.assign(annotation, patch);
          }
        });
        stateStore.setState({ decisionGraph: next });
        listenerStore.getState().onChange?.(next);
      },
      removeAnnotation: (id) => {
        pushUndo();
        const { nodesState } = referenceStore.getState();
        nodesState.current[1]?.((nodes) => nodes.filter((n) => n.id !== `annotation-${id}`));
        const { decisionGraph } = stateStore.getState();
        const next = produce(decisionGraph, (draft) => {
          draft.annotations = (draft.annotations || []).filter((a) => a.id !== id);
        });
        stateStore.setState({ decisionGraph: next });
        listenerStore.getState().onChange?.(next);
      },
      // React Flow 节点变更路由（annotation- 前缀）：视图双写 + 几何持久化；
      // 拖拽会话追踪与节点同款（拖起 pushUndo 捕获前态）
      applyAnnotationChanges: (changes) => {
        const { nodesState } = referenceStore.getState();
        const [, , onNodesChange] = nodesState.current;
        onNodesChange?.(changes);

        const dragStart = changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging === true);
        if (dragStart && !dragSessionRef.current) {
          pushUndo();
          dragSessionRef.current = true;
        }
        if (changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging === false)) {
          dragSessionRef.current = false;
        }

        const { decisionGraph } = stateStore.getState();
        if ((decisionGraph.annotations || []).length === 0) {
          return;
        }
        const next = produce(decisionGraph, (draft) => {
          draft.annotations ??= [];
          changes.forEach((c) => {
            const cid = (c as { id?: string }).id;
            if (!cid) {
              return;
            }
            const id = String(cid).replace(/^annotation-/, '');
            const annotation = draft.annotations?.find((a) => a.id === id);
            if (!annotation) {
              return;
            }
            if (c.type === 'position' && c.position) {
              annotation.position = c.position;
            }
            if (c.type === 'dimensions' && c.dimensions) {
              if (c.dimensions.width) {
                annotation.width = c.dimensions.width;
              }
              if (c.dimensions.height) {
                annotation.height = c.dimensions.height;
              }
            }
            if (c.type === 'remove') {
              draft.annotations = (draft.annotations || []).filter((a) => a.id !== id);
            }
          });
        });
        stateStore.setState({ decisionGraph: next });
        listenerStore.getState().onChange?.(next);
      },
      setExtraCommands: (commands) => {
        stateStore.setState({ extraCommands: commands });
      },
      // A3 即时求值：计数器递增——simulator 请求面板监听后按当前输入复跑
      requestSimulation: () => {
        const { simulateRequestTick } = stateStore.getState();
        stateStore.setState({ simulateRequestTick: simulateRequestTick + 1 });
      },
      pushSimulateRun: (entry) => {
        const { simulateRuns } = stateStore.getState();
        const next = [entry, ...simulateRuns];
        // 环淘汰（pin 感知）：超限时从尾部丢最旧的未 pin 条目
        const kept: SimulateRunEntry[] = [];
        let budget = SIMULATE_RUNS_LIMIT;
        for (const run of next) {
          if (run.pinned || budget > 0) {
            if (!run.pinned) budget -= 1;
            kept.push(run);
          }
        }
        stateStore.setState({ simulateRuns: kept });
      },
      setSimulateRunPinned: (id, pinned) => {
        const { simulateRuns } = stateStore.getState();
        stateStore.setState({
          simulateRuns: simulateRuns.map((run) => (run.id === id ? { ...run, pinned } : run)),
        });
      },
      hydrateSimulateRuns: (entries) => {
        stateStore.setState({ simulateRuns: entries.slice(0, SIMULATE_RUNS_LIMIT) });
      },
      clearSimulateRuns: () => {
        stateStore.setState({ simulateRuns: [] });
      },
      setActivePanel: (panel?: string) => {
        const { panels } = stateStore.getState();
        const updatedState: Partial<DecisionGraphStoreType['state']> = {
          activePanel: panel === undefined ? undefined : (panels || []).find((p) => p.id === panel)?.id,
        };
        listenerStore.getState()?.onPanelsChange?.(panel);
        stateStore.setState(updatedState);
      },
      setCompactMode: (mode: boolean) => {
        const updatedState: Partial<DecisionGraphStoreType['state']> = {
          compactMode: mode,
        };
        localStorage.setItem('jdm-compact-mode', `${mode}`);
        stateStore.setState(updatedState);
      },
      toggleCompactMode: () => {
        const { compactMode } = stateStore.getState();
        const mode = !compactMode;
        const updatedState: Partial<DecisionGraphStoreType['state']> = {
          compactMode: mode,
        };
        localStorage.setItem('jdm-compact-mode', `${mode}`);
        stateStore.setState(updatedState);
      },
      setNodeType: (id, kind, vt) => {
        const { nodeTypes } = stateStore.getState();

        const newNodeTypes = produce(nodeTypes, (draft) => {
          draft[id] ??= {};
          draft[id][kind] = vt;
        });

        stateStore.setState({ nodeTypes: newNodeTypes });
      },
      setSimulatorRequest: (req) => {
        stateStore.setState({ simulatorRequest: req });
      },
      setSimulatorExampleBinding: (binding) => {
        stateStore.setState({ simulatorExampleBinding: binding });
      },
      setFixturesRunner: (runner) => {
        stateStore.setState({ fixturesRunner: runner });
      },
      runFixtures: async () => {
        const { fixturesRunner, decisionGraph, panels } = stateStore.getState();

        if (!fixturesRunner) {
          return;
        }

        // 域约束：图至多一个 inputNode——面板直接作用于它
        const inputNode = listInputNodes(decisionGraph)[0];
        if (!inputNode) {
          stateStore.setState({ fixturesRun: { nodeId: '', status: 'error', error: 'no-input-node' } });
          return;
        }
        const nodeId = inputNode.id;

        // 注意力跟随动作：打开/聚焦 Fixtures 面板
        const fixturesPanel = panels?.find((panel) => panel.id === 'fixtures');
        if (fixturesPanel) {
          stateStore.setState({ activePanel: fixturesPanel.id });
        }

        if (!buildContractFixtures(decisionGraph, nodeId)) {
          stateStore.setState({ fixturesRun: { nodeId, status: 'error', error: 'no-examples' } });
          return;
        }

        stateStore.setState({ fixturesRun: { nodeId, status: 'running' } });
        try {
          const report = await runFixturesForNode(decisionGraph, nodeId, fixturesRunner);
          stateStore.setState({
            fixturesRun: report
              ? {
                  nodeId,
                  status: 'done',
                  report,
                  graphFingerprint: graphFingerprint(decisionGraph),
                }
              : { nodeId, status: 'error', error: 'no-examples' },
          });
        } catch (error: any) {
          stateStore.setState({
            fixturesRun: { nodeId, status: 'error', error: error?.message ?? String(error) },
          });
        }
      },
      emitContractEvent: (event) => {
        listenerStore.getState().onContractEvent?.(event);
      },
      removeNodeType: (id, kind) => {
        const { nodeTypes } = stateStore.getState();

        const newNodeTypes = produce(nodeTypes, (draft) => {
          if (!(id in draft)) {
            return;
          }

          if (kind) {
            if (kind in draft[id]) {
              delete draft[id][kind];
            }
          } else {
            delete draft[id];
          }
        });

        stateStore.setState({ nodeTypes: newNodeTypes });
      },
      triggerNodeSelect: (id, mode) => {
        const { decisionGraph } = stateStore.getState();
        const { nodesState, edgesState } = referenceStore.getState();
        const [, setNodes] = nodesState.current;
        const [, setEdges] = edgesState.current;

        const newDecisionGraph = produce(decisionGraph, (draft) => {
          const chosenNode = draft.nodes.find((n) => n.id === id);
          if (!chosenNode) {
            return;
          }

          if (mode === 'only') {
            draft.nodes.forEach((n) => {
              if (n[privateSymbol]) {
                n[privateSymbol].selected = false;
              }
            });
          }

          chosenNode[privateSymbol] ??= {};
          chosenNode[privateSymbol].selected = match(mode)
            .with('only', () => true)
            .otherwise(() => !chosenNode[privateSymbol]?.selected);
        });

        setNodes(mapToGraphNodes(newDecisionGraph.nodes));
        if (mode == 'only') {
          setEdges((edges) =>
            edges.map((e) => ({
              ...e,
              selected: false,
            })),
          );
        }
        stateStore.setState({ decisionGraph: newDecisionGraph });
        listenerStore.getState().onChange?.(newDecisionGraph);
      },
    };
  }, []);

  const value = useMemo(
    () => ({
      stateStore,
      referenceStore,
      listenerStore,
      actions,
    }),
    [stateStore, referenceStore, listenerStore, actions],
  );

  return <DecisionGraphStoreContext.Provider value={value}>{children}</DecisionGraphStoreContext.Provider>;
};

export function useDecisionGraphState<T>(
  selector: (state: DecisionGraphStoreType['state']) => T,
  equals: (a: any, b: any) => boolean = equal,
): T {
  return useStore(React.useContext(DecisionGraphStoreContext).stateStore, useMemoEquality(selector, equals));
}

export function useDecisionGraphListeners<T>(
  selector: (state: DecisionGraphStoreType['listeners']) => T,
  equals: (a: any, b: any) => boolean = equal,
): T {
  return useStore(React.useContext(DecisionGraphStoreContext).listenerStore, useMemoEquality(selector, equals));
}

export function useDecisionGraphReferences<T>(
  selector: (state: DecisionGraphStoreType['references']) => T,
  equals: (a: any, b: any) => boolean = equal,
): T {
  return useStore(React.useContext(DecisionGraphStoreContext).referenceStore, useMemoEquality(selector, equals));
}

export function useDecisionGraphActions(): DecisionGraphStoreType['actions'] {
  return React.useContext(DecisionGraphStoreContext).actions;
}

export function useDecisionGraphRaw() {
  return React.useContext(DecisionGraphStoreContext);
}

export const useNodeDiff = (id: string) => {
  const { diff, contentDiff } = useDecisionGraphState((s) => {
    const node = (s?.decisionGraph?.nodes ?? []).find((node) => node.id === id);

    return {
      diff: node?._diff,
      contentDiff: node?.content?._diff,
    };
  });
  return {
    diff,
    contentDiff,
  };
};

export const useEdgeDiff = (id: string) => {
  const { diff } = useDecisionGraphState((s) => {
    const edge = (s?.decisionGraph?.edges ?? []).find((edge) => edge.id === id);

    return {
      diff: edge?._diff,
    };
  });
  return {
    diff,
  };
};

export default DecisionGraphProvider;
