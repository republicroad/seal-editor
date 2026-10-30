import { AutoLayoutOutlined, CompressOutlined, LeftOutlined, RightOutlined, WarningOutlined } from '#icons';
import type { Connection, Edge, Node, ProOptions, ReactFlowInstance, Viewport } from '@xyflow/react';
import {
  Background,
  ControlButton,
  Controls,
  MiniMap,
  type NodeChange,
  Panel,
  ReactFlow,
  SelectionMode,
  getOutgoers,
  useEdgesState,
  useNodesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import equal from 'fast-deep-equal';
import { Minimize2Icon, Redo2Icon, StickyNoteIcon, Undo2Icon } from 'lucide-react';
import React, { type MutableRefObject, forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useT } from '../../../theming/i18n';
import { App, Button, Tooltip, Typography } from '../../primitives';
import {
  type DecisionGraphStoreType,
  type ExposedStore,
  useDecisionGraphActions,
  useDecisionGraphListeners,
  useDecisionGraphRaw,
  useDecisionGraphReferences,
  useDecisionGraphState,
} from '../context/dg-store.context';
import { type DecisionGraphSnapshot, useSerializerRegistry } from '../context/serializer.context';
import { edgeFunction } from '../custom-edge';
import { mapToDecisionEdge } from '../dg-util';
import { useGraphClipboard } from '../hooks/use-graph-clipboard';
import { useGraphDnd } from '../hooks/use-graph-dnd';
import { componentsOpenedKey, useGraphSerializers } from '../hooks/use-graph-serializers';
import { useNodeAdd } from '../hooks/use-node-add';
import { AnnotationNode } from '../nodes/annotation-node';
import type { CustomNodeSpecification } from '../nodes/custom-node';
import { GraphNode } from '../nodes/graph-node';
import { resolveCustomNode } from '../nodes/resolve-custom-node';
import type { MinimalNodeProps } from '../nodes/specifications/specification-types';
import { NodeKind } from '../nodes/specifications/specification-types';
import { nodeSpecification } from '../nodes/specifications/specifications';
import { DiagnosticsController, DiagnosticsPanel } from './diagnostics-panel';
import { GraphCommandMenu } from './graph-command-menu';
import { GraphComponents } from './graph-components';
import { NodeInspector } from './node-inspector';
import { ShortcutsHelp } from './shortcuts-help';
import { XYFLOW_THEME } from './xyflow-theme';

export type GraphProps = {
  className?: string;
  onDisableTabs?: (val: boolean) => void;
  reactFlowProOptions?: ProOptions;
};

export type GraphRef = DecisionGraphStoreType['actions'] & {
  stateStore: ExposedStore<DecisionGraphStoreType['state']>;
  serialize: () => DecisionGraphSnapshot;
  restore: (snapshot: DecisionGraphSnapshot) => void;
};

// 模块环防线（2026-10-08）：specifications ↔ graph 存在模块环，模块作用域
// 直接消费 nodeSpecification 会因求值序撞上半初始化（不同测试文件入口下
// 非确定性复现）。惰性化——首次渲染时一切模块已就绪。
let defaultNodeTypesCache: Record<string, React.FC<MinimalNodeProps>> | null = null;
const getDefaultNodeTypes = (): Record<string, React.FC<MinimalNodeProps>> =>
  (defaultNodeTypesCache ??= Object.entries(nodeSpecification).reduce(
    (acc, [key, value]) => ({
      ...acc,
      [key]: React.memo(
        (props: MinimalNodeProps) => value.renderNode({ specification: value, ...props }),
        (prevProps, nextProps) => {
          return (
            prevProps.id === nextProps.id &&
            prevProps.selected === nextProps.selected &&
            equal(prevProps.data, nextProps.data)
          );
        },
      ),
    }),
    {},
  ));

const edgeTypes = {
  edge: React.memo(edgeFunction(null)),
};

export const Graph = forwardRef<GraphRef, GraphProps>(function GraphInner({ reactFlowProOptions, className }, ref) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const reactFlowInstance = useRef<ReactFlowInstance>(null);

  const nodesState = useNodesState<Node>([]);
  const edgesState = useEdgesState<Edge>([]);

  const [componentsOpened, setComponentsOpened] = useState(() => {
    const localStorageKey = localStorage.getItem(componentsOpenedKey);
    if (!localStorageKey) {
      localStorage.setItem(componentsOpenedKey, 'true');
      return true;
    }
    return localStorage.getItem(componentsOpenedKey) === 'true';
  });

  const initialViewport = useRef<Viewport | undefined>(undefined);

  const raw = useDecisionGraphRaw();
  const registry = useSerializerRegistry();
  const graphActions = useDecisionGraphActions();
  const t = useT();
  const graphReferences = useDecisionGraphReferences((s) => s);
  const { onReactFlowInit } = useDecisionGraphListeners(({ onReactFlowInit }) => ({ onReactFlowInit }));
  const { modal } = App.useApp();
  const {
    disabled,
    hasInputNode,
    components,
    customNodes,
    id,
    canvasLocked,
    snapToGrid,
    annotations,
    focusMode,
    canUndo,
    canRedo,
  } = useDecisionGraphState(
    ({
      id,
      disabled,
      components,
      customNodes,
      decisionGraph,
      canvasLocked,
      snapToGrid,
      focusMode,
      canUndo,
      canRedo,
    }) => ({
      id,
      disabled,
      components,
      customNodes,
      canvasLocked,
      snapToGrid,
      annotations: decisionGraph?.annotations,
      hasInputNode: (decisionGraph?.nodes || []).some((n) => n.type === NodeKind.Input),
      focusMode,
      canUndo,
      canRedo,
    }),
  );

  graphReferences.nodesState.current = nodesState;
  graphReferences.edgesState.current = edgesState;
  graphReferences.graphClipboard.current = useGraphClipboard(reactFlowInstance, reactFlowWrapper);
  graphReferences.reactFlowInstance.current = reactFlowInstance.current;

  const customNodeRenderer = useMemo(() => {
    return React.memo(
      (props: MinimalNodeProps) => {
        const t = useT();
        const { openTab } = useDecisionGraphActions();
        // ADR-017：kind 精确 + tester 谓词统一解析（RF 域 type 恒为 'customNode'）
        const node = resolveCustomNode(customNodes, {
          kind: props?.data?.kind,
          type: 'customNode',
          config: props?.data?.config,
          node: props?.data,
        }) as CustomNodeSpecification<object, string> | undefined;

        if (!node) {
          console.warn('node not found', props, customNodes);
          return (
            <GraphNode
              id={props.id}
              specification={{
                displayName: `${props.data?.kind}`,
                color: 'var(--destructive)',
                icon: <WarningOutlined />,
              }}
              name={props?.data?.name}
              isSelected={props.selected}
              displayError
              noBodyPadding
              handleLeft={true}
              handleRight={true}
              actions={[
                <Button key='edit-expression' type='text' onClick={() => openTab(props.id)}>
                  {t('dg.node.editExpression')}
                </Button>,
              ]}
            />
          );
        }

        return node.renderNode({
          specification: node,
          ...props,
        });
      },
      (prevProps, nextProps) => {
        return (
          prevProps.id === nextProps.id &&
          prevProps.selected === nextProps.selected &&
          equal(prevProps.data, nextProps.data)
        );
      },
    );
  }, [customNodes]);

  const nodeTypes = useMemo<Record<string, React.FC<any>>>(() => {
    return components.reduce(
      (acc, component) => ({
        ...acc,
        [component.type]: React.memo(
          (props: MinimalNodeProps) => component.renderNode({ specification: component, ...props }),
          (prevProps, nextProps) => {
            return (
              prevProps.id === nextProps.id &&
              prevProps.selected === nextProps.selected &&
              equal(prevProps.data, nextProps.data)
            );
          },
        ),
      }),
      { ...getDefaultNodeTypes(), customNode: customNodeRenderer, annotationNode: AnnotationNode },
    );
  }, [components, customNodeRenderer]);

  const addNodeInner = useNodeAdd({
    reactFlowWrapper,
    reactFlowInstance,
    customNodes,
    components,
    addNodes: graphActions.addNodes,
  });

  // B1 注释框：annotations → React Flow 背景便签节点（zIndex -1，语义图节点之上不参与引擎）
  const annotationFlowNodes = useMemo<Node[]>(
    () =>
      (annotations ?? []).map((a) => ({
        id: `annotation-${a.id}`,
        type: 'annotationNode',
        position: a.position,
        data: { text: a.text },
        style: { width: a.width, height: a.height },
        zIndex: -1,
      })),
    [annotations],
  );
  const flowNodes = useMemo<Node[]>(
    () => [...nodesState[0], ...annotationFlowNodes],
    [nodesState[0], annotationFlowNodes],
  );

  // 变更路由：annotation- 前缀 → 注释动作（几何持久化到 annotations）；其余 → 语义图节点
  const handleRoutedNodesChange = React.useCallback(
    (changes: NodeChange[]) => {
      const annotationChanges = changes.filter((c) =>
        String((c as { id?: string }).id ?? '').startsWith('annotation-'),
      );
      const rest = changes.filter((c) => !String((c as { id?: string }).id ?? '').startsWith('annotation-'));
      if (annotationChanges.length > 0) {
        graphActions.applyAnnotationChanges(annotationChanges);
      }
      if (rest.length > 0) {
        graphActions.handleNodesChange(rest);
      }
    },
    [graphActions],
  );

  // P0-1 undo/redo 键位（⌘Z/⌘⇧Z；Win Ctrl+Z/Ctrl+Y）——window 级监听：
  // 工具条按钮点击后焦点停在按钮上，div 级监听收不到；文本编辑焦点让路
  // （monaco/输入框的内部撤销不受打断，closest 守卫 + monaco 自身 stopPropagation 双保险）
  React.useEffect(() => {
    if (disabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      const isUndo = key === 'z' && mod && !event.shiftKey;
      const isRedo = (key === 'z' && mod && event.shiftKey) || (key === 'y' && mod);
      if (!isUndo && !isRedo) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable], .monaco-editor, .cm-editor')) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (isRedo) {
        graphActions.redo();
      } else {
        graphActions.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [disabled, graphActions]);

  // B2 拖线悬空释放：从端口拉线落空白处 → 原地弹节点搜索（n8n/ComfyUI 模式）
  const [connectMenu, setConnectMenu] = useState<{
    screenX: number;
    screenY: number;
    flowX: number;
    flowY: number;
    fromNodeId: string;
    fromHandleId: string | null;
  } | null>(null);
  const [connectMenuQuery, setConnectMenuQuery] = useState('');

  const onConnectEnd = (event: MouseEvent | TouchEvent, connectionState: any) => {
    if (
      disabled ||
      connectMenu ||
      connectionState?.isValid ||
      !connectionState?.fromHandle ||
      !connectionState?.fromNode
    ) {
      return;
    }
    const coords = 'changedTouches' in event ? event.changedTouches[0] : (event as MouseEvent);
    const flow = reactFlowInstance.current?.screenToFlowPosition({ x: coords.clientX, y: coords.clientY });
    if (!flow) {
      return;
    }
    setConnectMenuQuery('');
    setConnectMenu({
      screenX: coords.clientX,
      screenY: coords.clientY,
      flowX: flow.x,
      flowY: flow.y,
      fromNodeId: connectionState.fromNode.id,
      fromHandleId: connectionState.fromHandle.id ?? null,
    });
  };

  const handleCreateFromMenu = async (spec: { type?: string; kind?: string }) => {
    if (!connectMenu) {
      return;
    }
    const created = await addNodeInner(
      spec.type ?? 'customNode',
      { x: connectMenu.flowX, y: connectMenu.flowY },
      spec.kind,
    );
    if (created && connectMenu.fromNodeId) {
      onConnect({
        source: connectMenu.fromNodeId,
        sourceHandle: connectMenu.fromHandleId,
        target: created.id,
        targetHandle: null,
      });
    }
    setConnectMenu(null);
  };

  const isValidConnection = (connection: Connection | Edge): boolean => {
    // Disallow self-reference
    if (connection.source === connection.target) {
      return false;
    }

    if (disabled) {
      return false;
    }

    const [nodes] = nodesState;
    const [edges] = edgesState;

    const hasDuplicate = edges.some(
      (edge) =>
        edge.source === connection.source &&
        edge.target === connection.target &&
        (edge.sourceHandle ?? null) === (connection.sourceHandle ?? null) &&
        (edge.targetHandle ?? null) === (connection.targetHandle ?? null),
    );

    const target = nodes.find((node) => node.id === connection.target);
    if (!target || target.id === connection.source) {
      return false;
    }

    const hasCycle = (node: Node, visited = new Set()) => {
      if (visited.has(node.id)) {
        return false;
      }

      visited.add(node.id);

      for (const outgoer of getOutgoers(node, nodes, edges)) {
        if (outgoer.id === connection.source) return true;
        if (hasCycle(outgoer, visited)) return true;
      }
    };

    return !hasDuplicate && !hasCycle(target);
  };

  const { onDrop, onDragOver } = useGraphDnd({
    reactFlowWrapper,
    reactFlowInstance,
    addNodes: graphActions.addNodes,
    addNode: addNodeInner,
  });

  const onConnect = (params: any) => {
    const edge = {
      ...params,
      type: 'edge',
      id: crypto.randomUUID(),
    };

    if (disabled) return;
    graphActions.addEdges([mapToDecisionEdge(edge)]);
  };

  useGraphSerializers({
    reactFlowInstance,
    onRestoreViewport: (viewport) => {
      initialViewport.current = viewport;
    },
    stateStore: raw.stateStore,
    componentsOpened,
    setComponentsOpened,
  });

  useImperativeHandle(ref, () => ({
    ...graphActions,
    stateStore: raw.stateStore,
    serialize: () => registry?.serialize() ?? {},
    restore: (snapshot) => registry?.restore(snapshot ?? {}),
  }));

  return (
    <div
      className={clsx([
        'relative h-full w-full flex-1 min-h-0 bg-[var(--seal-color-bg-container)] outline-none focus:outline-none focus-within:outline-none',
        className,
      ])}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'v' && (e.metaKey || e.ctrlKey) && !disabled) {
          graphActions.pasteNodes();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          display: 'flex',
        }}
      >
        <div
          tabIndex={0}
          className={'h-full w-full flex-1 flex-row outline-none!'}
          onKeyDown={(e) => {
            const [nodes] = nodesState;
            const [edges] = edgesState;

            if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
              const selectedNodeIds = nodesState[0].filter((n) => n.selected).map(({ id }) => id);
              if (selectedNodeIds.length === 0) {
                return;
              }

              graphActions.copyNodes(selectedNodeIds);
              e.preventDefault();
            } else if (e.key === 'd' && (e.metaKey || e.ctrlKey)) {
              if (!disabled) {
                const selectedNodeIds = nodes.filter((n) => n.selected).map(({ id }) => id);
                if (selectedNodeIds.length === 0) {
                  return;
                }

                graphActions.duplicateNodes(selectedNodeIds);
              }
              e.preventDefault();
            } else if (e.key === 'Backspace') {
              if (!disabled) {
                const selectedNodes = nodes.filter((n) => n.selected);
                const selectedEdges = edges.filter((e) => e.selected);

                if (selectedNodes.length > 0) {
                  const length = selectedNodes.length;
                  const text = length > 1 ? 'nodes' : 'node';
                  modal.confirm({
                    icon: null,
                    title: `Delete ${text}`,
                    content: (
                      <Typography.Text>
                        Are you sure you want to delete {length > 1 ? `${length} ${text}` : text}?
                      </Typography.Text>
                    ),
                    okButtonProps: { danger: true },
                    onOk: () => {
                      if (selectedEdges.length > 0) {
                        graphActions.removeEdges(selectedEdges.map((e) => e.id));
                      }
                      graphActions.removeNodes(selectedNodes.map((n) => n.id));
                    },
                  });
                } else if (selectedEdges.length > 0) {
                  graphActions.removeEdges(selectedEdges.map((e) => e.id));
                }
              }
              e.stopPropagation();
              e.preventDefault();
            }
          }}
        >
          <div className={clsx(['react-flow'], XYFLOW_THEME)} ref={reactFlowWrapper}>
            <ReactFlow
              deleteKeyCode={null}
              elevateEdgesOnSelect={false}
              elevateNodesOnSelect={true}
              zoomOnDoubleClick={false}
              connectionRadius={35}
              nodes={flowNodes}
              edges={edgesState[0]}
              defaultViewport={initialViewport.current}
              fitView={!initialViewport.current}
              fitViewOptions={{ padding: 0.15 }}
              onInit={(instance) => {
                (reactFlowInstance as MutableRefObject<ReactFlowInstance>).current = instance;
                if (initialViewport.current) {
                  instance.setViewport(initialViewport.current);
                }
                onReactFlowInit?.(instance);
              }}
              snapToGrid={snapToGrid}
              snapGrid={[5, 5]}
              minZoom={0.25}
              selectionMode={SelectionMode.Partial}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              proOptions={reactFlowProOptions}
              nodesConnectable={!disabled && !canvasLocked}
              nodesDraggable={!disabled && !canvasLocked}
              edgesReconnectable={!disabled && !canvasLocked}
              onNodesChange={handleRoutedNodesChange}
              onEdgesChange={graphActions.handleEdgesChange}
              onConnectEnd={onConnectEnd}
              onNodesDelete={(e) => {
                e.forEach((node) => {
                  // B1 注释框删除路由（annotation- 前缀不触及语义图/页签）
                  if (String(node.id).startsWith('annotation-')) {
                    graphActions.removeAnnotation(String(node.id).replace(/^annotation-/, ''));
                    return;
                  }
                  graphActions.closeTab(node?.id);
                });
              }}
              onEdgeMouseEnter={(_, edge) => graphActions.setHoveredEdgeId(edge.id)}
              onEdgeMouseLeave={() => graphActions.setHoveredEdgeId(null)}
            >
              <Controls showInteractive={false}>
                <ControlButton onClick={() => graphActions.toggleCompactMode()}>
                  <CompressOutlined />
                </ControlButton>
                {/* B1 图可读性：注释框（背景便签，画布中心 1/3 处落位） */}
                <ControlButton
                  title={t('dg.toolbar.addAnnotation')}
                  aria-label={t('dg.toolbar.addAnnotation')}
                  data-testid='add-annotation'
                  onClick={() => {
                    const rect = reactFlowWrapper.current?.getBoundingClientRect();
                    if (!rect || !reactFlowInstance.current) {
                      return;
                    }
                    const flow = reactFlowInstance.current.screenToFlowPosition({
                      x: rect.left + rect.width / 2,
                      y: rect.top + rect.height / 3,
                    });
                    graphActions.addAnnotation(flow);
                  }}
                >
                  <StickyNoteIcon className='size-3' />
                </ControlButton>
              </Controls>
              <MiniMap pannable zoomable position='bottom-left' />
              <Background id={id} color='var(--border)' gap={20} />
              {/* P0-1 高频三钮浮动层：undo/redo/auto-layout 贴画布左上（Figma 式画布
                  浮动工具条；聚焦模式随 chrome 一并隐藏，键盘 ⌘Z 恒可用） */}
              {!focusMode && (
                <Panel position='top-left' style={{ margin: 10 }}>
                  <div className='nodrag nopan flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--seal-color-bg-container)] p-0.5 shadow-md'>
                    <Tooltip title={t('dg.toolbar.undo')} placement={'bottom'}>
                      <Button
                        type='text'
                        size='small'
                        className='h-7 w-7 p-0'
                        aria-label={t('dg.toolbar.undo')}
                        disabled={!canUndo}
                        data-testid='undo-button'
                        icon={<Undo2Icon className='size-4' />}
                        onClick={graphActions.undo}
                      />
                    </Tooltip>
                    <Tooltip title={t('dg.toolbar.redo')} placement={'bottom'}>
                      <Button
                        type='text'
                        size='small'
                        className='h-7 w-7 p-0'
                        aria-label={t('dg.toolbar.redo')}
                        disabled={!canRedo}
                        data-testid='redo-button'
                        icon={<Redo2Icon className='size-4' />}
                        onClick={graphActions.redo}
                      />
                    </Tooltip>
                    <Tooltip title={t('dg.toolbar.autoLayout')} placement={'bottom'}>
                      <Button
                        type='text'
                        size='small'
                        className='h-7 w-7 p-0'
                        aria-label={t('dg.toolbar.autoLayout')}
                        disabled={disabled}
                        data-testid='auto-layout'
                        icon={<AutoLayoutOutlined />}
                        onClick={() => {
                          graphActions
                            .autoLayout()
                            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
                        }}
                      />
                    </Tooltip>
                  </div>
                </Panel>
              )}
              {!focusMode && <NodeInspector />}
              <DiagnosticsController />
              {!focusMode && <DiagnosticsPanel />}
              {focusMode && (
                <Panel position='top-right' style={{ margin: 10 }}>
                  <Button
                    size='small'
                    aria-label={t('dg.focus.exit')}
                    data-testid='focus-exit'
                    icon={<Minimize2Icon className='size-4' />}
                    onClick={() => graphActions.setFocusMode(false)}
                  >
                    {t('dg.focus.exit')}
                  </Button>
                </Panel>
              )}
              <ShortcutsHelp />
            </ReactFlow>
            {/* B2 拖线悬空释放 → 节点搜索菜单（fixed 定位在释放点；backdrop 点击/Esc 关闭） */}
            {connectMenu && (
              <>
                <div
                  className='fixed inset-0 z-[59]'
                  onPointerDown={() => setConnectMenu(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setConnectMenu(null);
                    }
                  }}
                />
                <div
                  data-testid='connect-menu'
                  className='fixed z-[60] w-64 rounded-lg border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg'
                  style={{ left: connectMenu.screenX, top: connectMenu.screenY }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    placeholder={t('dg.connectMenu.search')}
                    className='mb-1 w-full border-b border-[var(--border)] bg-transparent px-2 py-1.5 text-xs outline-none'
                    value={connectMenuQuery}
                    onChange={(e) => setConnectMenuQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setConnectMenu(null);
                      }
                    }}
                  />
                  <div className='max-h-56 overflow-y-auto'>
                    {[...Object.values(nodeSpecification), ...components, ...customNodes]
                      .filter((spec) =>
                        `${(spec as any).displayName ?? ''} ${(spec as any).type ?? ''} ${(spec as any).kind ?? ''}`
                          .toLowerCase()
                          .includes(connectMenuQuery.toLowerCase()),
                      )
                      .map((spec, index) => (
                        <button
                          key={(spec as any).type ?? (spec as any).kind ?? index}
                          type='button'
                          className='flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-accent'
                          onClick={() =>
                            void handleCreateFromMenu({
                              type: (spec as any).type,
                              kind: (spec as any).kind,
                            })
                          }
                        >
                          {(spec as any).icon}
                          <span className='truncate'>{(spec as any).displayName}</span>
                        </button>
                      ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {!disabled && (
          <div
            className={clsx(
              'flex h-full min-h-0 flex-col border-l border-l-[var(--border)] bg-[var(--seal-color-bg-container)]',
              !componentsOpened ? 'w-10 min-w-10' : 'w-[260px] min-w-[260px]',
            )}
          >
            <div className='box-border flex flex-row items-center border-b border-b-[var(--border)] bg-[var(--seal-color-primary-bg-fade)] px-3 py-1.5'>
              {componentsOpened && (
                <div className='flex flex-1 items-center'>
                  <Typography.Text strong style={{ marginBottom: 0 }}>
                    Components
                  </Typography.Text>{' '}
                  <Typography.Text type='secondary' style={{ fontSize: 10, marginLeft: 5 }}>
                    (Drag-and-drop)
                  </Typography.Text>
                </div>
              )}
              <Button
                type={'text'}
                size='small'
                icon={
                  componentsOpened ? (
                    <RightOutlined style={{ fontSize: 12 }} />
                  ) : (
                    <LeftOutlined style={{ fontSize: 12 }} />
                  )
                }
                onClick={() => {
                  const value = !componentsOpened;
                  setComponentsOpened(!componentsOpened);
                  localStorage.setItem(componentsOpenedKey, `${value}`);
                }}
              />
            </div>
            <GraphCommandMenu
              addNode={addNodeInner}
              specifications={[...Object.values(nodeSpecification), ...components, ...customNodes]}
            />
            <div className='min-h-0 flex-1 overflow-y-auto'>
              <GraphComponents inputDisabled={hasInputNode} collapsed={!componentsOpened} disabled={disabled} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
