import { DeleteOutlined, PlusOutlined } from '#icons';
import type { EdgeProps } from '@xyflow/react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from '@xyflow/react';
import clsx from 'clsx';
import React from 'react';
import { P, match } from 'ts-pattern';

import { nodeSchema } from '../../helpers/schema';
import { useT } from '../../theming/i18n';
import { Button } from '../primitives';
import { useDecisionGraphActions, useDecisionGraphState, useEdgeDiff } from './context/dg-store.context';
import { nodeSpecification } from './nodes/specifications/specifications';

type PickerItem = {
  /** 内置节点 type；customNode 时恒为 'customNode' 并附加 component */
  type: string;
  component?: string;
  label: React.ReactNode;
  icon: React.ReactNode;
};

type AnySpec = {
  type?: string;
  kind?: string;
  generateNode?: (o: { index: number }) => { name: string; config?: unknown };
};

/** WS1-R3：连接线"+"选型插入（flow-1 connector 模式）——规范清单 = 内置 + 自定义组件 */
const usePickerItems = (): PickerItem[] => {
  const components = useDecisionGraphState(({ components }) => components);
  const allSpecs = [
    ...(Object.values(nodeSpecification) as unknown as AnySpec[]),
    ...((components ?? []) as unknown as AnySpec[]),
  ];
  return allSpecs.map((spec) => ({
    type: spec.kind ? 'customNode' : (spec.type ?? 'customNode'),
    component: spec.kind,
    label: spec.kind
      ? ((spec as { displayName?: React.ReactNode }).displayName ?? spec.kind)
      : ((spec as { displayName?: React.ReactNode }).displayName ?? ''),
    icon: (spec as { icon?: React.ReactNode }).icon,
  }));
};

export const CustomEdge: React.FC<EdgeProps & { sourceHandle?: string | null; targetHandle?: string | null }> = (
  props,
) => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const {
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    style = {},
    markerEnd,
    label,
  } = props;
  const { isHovered, disabled, decisionGraph, components, simulated, executed } = useDecisionGraphState(
    ({ hoveredEdgeId, disabled, decisionGraph, components, simulate }) => ({
      isHovered: hoveredEdgeId === id,
      disabled,
      decisionGraph,
      components,
      // A3 执行链路着色：仿真已运行 → 两端节点都命中 trace 的边 = 执行路径（流动高亮），否则置灰
      simulated: match(simulate)
        .with({ result: P._ }, () => true)
        .otherwise(() => false),
      executed: match(simulate)
        .with({ result: P._ }, ({ result }) => Boolean(result?.trace?.[source] && result?.trace?.[target]))
        .otherwise(() => false),
    }),
  );

  const { diff } = useEdgeDiff(id);
  const [picking, setPicking] = React.useState(false);
  const pickerItems = usePickerItems();
  // ② 探针订阅：组件体独立取 simulate（选择器参数仅回调内可见）
  const simulate = useDecisionGraphState(({ simulate }) => simulate);

  // ② 数据探针：执行边 hover 显示源节点 output（流经数据，trace 现成）
  const probeData = React.useMemo(() => {
    if (!simulated) {
      return undefined;
    }
    return (
      match(simulate)
        .with({ result: P._ }, ({ result }) => result?.trace?.[source])
        .otherwise(() => null)?.output ?? null
    );
  }, [simulate, simulated, source]);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  // WS1-R4：分支路径标签（flow-2 named branch paths 模式）——有 label 的边在路径上方渲染 chip。
  // 必须放进 EdgeLabelRenderer（portal 到 HTML 层）：xyflow 把自定义边渲染在 SVG 命名空间，
  // 标签层之外的裸 div 不可见（59227fd 的实现踩了这一点，仅 DOM 断言假绿）。
  const labelChip =
    label != null && String(label).trim() !== '' ? (
      <div
        data-slot='edge-label-chip'
        className='nodrag nopan pointer-events-none absolute z-[999]'
        style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 18}px)` }}
      >
        <span className='whitespace-nowrap rounded-sm border border-[var(--border)] bg-[var(--seal-color-bg-container)] px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]'>
          {label}
        </span>
      </div>
    ) : null;

  const insertBetween = async (item: PickerItem) => {
    setPicking(false);
    const existingCount = (decisionGraph?.nodes ?? []).filter((n) =>
      item.type === 'customNode' ? n.content?.kind === item.component : n.type === item.type,
    ).length;
    const allSpecs = [...Object.values(nodeSpecification), ...(components as unknown as AnySpec[])] as AnySpec[];
    const spec =
      item.type === 'customNode'
        ? allSpecs.find((s) => s.kind === item.component)
        : allSpecs.find((s) => s.type === item.type);
    if (!spec?.generateNode) return;
    const partialNode = spec.generateNode({ index: existingCount + 1 });

    const position = { x: labelX - 110, y: labelY - 20 };
    const newNode =
      item.type === 'customNode'
        ? {
            id: crypto.randomUUID(),
            type: 'customNode',
            name: partialNode.name,
            position,
            content: { kind: item.component, config: partialNode?.config },
          }
        : { id: crypto.randomUUID(), type: item.type, position, ...partialNode };

    const parsed = nodeSchema.safeParse(newNode);
    if (!parsed.success) return;

    // 插入并重连：source→new→target，移除原边
    graphActions.addNodes([parsed.data]);
    graphActions.addEdges([
      {
        id: crypto.randomUUID(),
        sourceId: source,
        sourceHandle: sourceHandle ?? undefined,
        targetId: newNode.id,
        type: 'edge',
      },
      {
        id: crypto.randomUUID(),
        sourceId: newNode.id,
        targetId: target,
        targetHandle: targetHandle ?? undefined,
        type: 'edge',
      },
    ]);
    graphActions.removeEdges([id]);
  };

  return (
    <>
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...(style || {}),
          stroke: match(diff)
            .with({ status: 'added' }, () => 'var(--seal-color-success)')
            .with({ status: 'removed' }, () => 'var(--destructive)')
            .otherwise(() => undefined),
          // A3 执行链路着色：执行路径流动高亮（复用 RF 自带 dashdraw 关键帧），
          // 仿真已运行但不在路径上的边置灰——语义：数据流向下游
          ...(executed && diff == null
            ? {
                stroke: 'var(--primary)',
                strokeWidth: 2,
                strokeDasharray: 5,
                // ① 流动渐停（#6 时间语义诚实）：只播 4 拍 ≈1.6s 后静止为虚线主色
                // （路径标记保留；持续流动会误暗示实时流转——决策流原子执行）
                animation: 'dashdraw 0.4s linear 4',
              }
            : {}),
          ...(simulated && !executed && diff == null ? { strokeOpacity: 0.25 } : {}),
        }}
      />
      <EdgeLabelRenderer>
        {labelChip}
        {/* ② 数据探针：hover 执行边显示源节点 output（只读，不截交互） */}
        {isHovered && executed && !picking && probeData != null && (
          <div
            data-testid='edge-data-probe'
            className='nodrag nopan pointer-events-none absolute z-[1001] max-w-72 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 shadow-md'
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px,${labelY - 28}px)` }}
          >
            <div className='mb-1 text-[9px] font-medium uppercase tracking-wide opacity-50'>{t('dg.edge.probe')}</div>
            <pre className='max-h-40 overflow-hidden font-mono text-[10px] leading-relaxed whitespace-pre-wrap break-all'>
              {JSON.stringify(probeData, null, 2)}
            </pre>
          </div>
        )}
        <div
          data-visible={isHovered || picking}
          className={
            'seal-edge-insert-toolbar nodrag nopan absolute z-[1000] flex items-center justify-center gap-1 text-xs'
          }
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {!disabled && picking && (
            <>
              <div className='fixed inset-0 -z-10' onClick={() => setPicking(false)} />
              <div
                className='absolute bottom-full mb-1 max-h-44 w-48 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--seal-color-bg-container)] p-1 shadow-md'
                data-slot='edge-node-picker'
              >
                {pickerItems.map((item) => (
                  <button
                    key={`${item.type}:${item.component ?? ''}`}
                    type='button'
                    className='flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-[var(--accent)]'
                    onClick={() => void insertBetween(item)}
                  >
                    <span className='flex h-4 w-4 items-center justify-center'>{item.icon}</span>
                    <span className='truncate'>{item.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {!disabled && (
            <Button
              type='primary'
              shape='round'
              icon={<PlusOutlined />}
              className='seal-edge-add-button'
              data-visible={isHovered || picking}
              onClick={() => setPicking((p) => !p)}
            />
          )}
          {!disabled && (
            <Button
              type='primary'
              shape='round'
              icon={<DeleteOutlined />}
              danger
              className={clsx('seal-edge-delete-button p-0 w-8')}
              data-visible={isHovered && !picking}
              onClick={() => graphActions.removeEdges([id])}
            />
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export const edgeFunction = (outer: any) => (props: any) => <CustomEdge {...props} {...outer} />;
