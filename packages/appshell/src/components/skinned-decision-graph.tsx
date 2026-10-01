import {
  DecisionGraph,
  type DecisionGraphProps,
  type DecisionGraphRef,
  type DecisionGraphType,
  GraphSimulator,
  type Simulation,
  type ToolbarItem,
} from '@republicroad/seal-editor';
import { PanelRightIcon } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useTheme } from '../context/theme.provider';
import PlayCircleIcon from '../reui/icons/animated/outline/play-circle';
import {
  type AutoPersistController,
  type AutoPersistEvent,
  type AutoPersistPolicy,
  type AutoPersistRecordMeta,
  type AutoPersistSnapshot,
  type AutoPersistState,
  stableStringify,
  useAutoPersist,
} from '../shell/auto-persist';
import { createSimulateFixturesRunner } from '../shell/fixtures-adapter';
import type { GraphPersistenceAdapter } from '../shell/persistence';
import type { SimulateHandler } from '../shell/types';
import { mapPanelSlotIds, mapToolbarSlots } from '../skin/layout';
import type { SkinHeaderSlots, SkinSlotHostContext } from '../skin/types';
import { ShellHeader } from './shell-header';
import { SyncStatusBadge } from './sync-status-badge';
import { ScrollArea } from './ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

type PanelItem = NonNullable<DecisionGraphProps['panels']>[number];

/** 模式 D 自动持久化桥（docs/design/appshell-auto-persist.md；ADR-008 L2） */
export type AutoPersistBridgeOptions = {
  adapter: GraphPersistenceAdapter;
  documentId: string;
  /** 静态记录元数据（name 必填——GraphRecordMeta 契约） */
  recordMeta: AutoPersistRecordMeta;
  /** 初始 head revision（宿主 load 后更新此值即触发基线重置；之后控制器自跟踪） */
  baseRevision?: string;
  policy?: AutoPersistPolicy;
  /** 会话快照来源；缺省经 graphRef.serialize() best-effort 取页签现场 */
  getSession?: () => AutoPersistSnapshot['session'];
  onEvent?: (event: AutoPersistEvent) => void;
  /** 状态面镜像（宿主自渲染徽标/页面 UI 时用；默认徽标注入时无需） */
  onStateChange?: (state: AutoPersistState) => void;
  /** 控制器就绪回调：宿主经此做手动保存（flush）、CONFLICT 三选（resolveConflict）等宿主 UX */
  onController?: (controller: AutoPersistController) => void;
};

export type SkinnedDecisionGraphProps = DecisionGraphProps & {
  /**
   * 传入后自动注册左侧栏 simulator 面板（kernel GraphSimulator：输入 JSON →
   * Run → 画布命中高亮 + Output/Trace），onRun 经由此 handler 调执行引擎。
   * 不传则与直接渲染 `<DecisionGraph>` 行为完全一致。
   */
  simulateHandler?: SimulateHandler;
  /** ADR-008 L1：宿主头部槽位注入——与 activeSkin 槽位浅合并（宿主优先） */
  headerSlots?: SkinHeaderSlots;
  /**
   * 模式 D 自动持久化：拦截 onChange 喂控制器（防抖连续保存 + 乐观锁 + CONFLICT 停轮），
   * 外部 value 注入（load/adopt）自动重置基线；宿主未提供 right 槽时自动注入同步徽标
   * （Saving…/Saved/Conflict）。未传则行为完全不变。
   */
  autoPersist?: AutoPersistBridgeOptions;
  /**
   * ADR-008 L3：仿真面板底部宿主条——宿主联动入口（verdict：「在调试页打开」→
   * /debug?ws=&model=）。直通内核 GraphSimulator 底部动作条；需与 simulateHandler
   * 同传（面板本身由 simulateHandler 驱动）。
   */
  simulationFooter?: React.ReactNode;
};

/**
 * 皮肤感知的 DecisionGraph（S005 P1）：读取 activeSkin.layout 把工具栏槽位
 * 映射为 kernel `toolbarItems`（追加在宿主自有项之后），其余 props 全透传。
 *
 * - 无皮肤 / 皮肤无 layout → 与直接渲染 `<DecisionGraph>` 行为完全一致
 * - ctx.graph 随受控 value 更新；graphRef 惰性挂载（挂载后首次重渲染时注入）
 */
// 显式标注 ExoticComponent：推断类型穿过 monaco 依赖时不可命名（dts 产物可移植性）
export const SkinnedDecisionGraph: React.ForwardRefExoticComponent<
  SkinnedDecisionGraphProps & React.RefAttributes<DecisionGraphRef>
> = React.forwardRef<DecisionGraphRef, SkinnedDecisionGraphProps>((props, ref) => {
  const { activeSkin } = useTheme();
  const { simulateHandler, headerSlots, autoPersist, simulationFooter, ...restProps } = props;
  const internalRef = useRef<DecisionGraphRef | null>(null);
  const [mounted, setMounted] = useState(false);
  const [simulation, setSimulation] = useState<Simulation | undefined>(undefined);
  const [running, setRunning] = useState(false);

  // ---- 模式 D 自动持久化桥（autoPersist 缺省时 hooks 仍无条件调用，内部空转） ----
  const latestValueRef = useRef<DecisionGraphType | undefined>(props.value);
  latestValueRef.current = props.value;
  /** 本组件经 onChange 发出的最后内容指纹——区分「自己发出的变更」与「外部 value 注入」 */
  const emittedJsonRef = useRef<string | undefined>(undefined);
  const adoptedJsonRef = useRef<string | undefined>(undefined);

  const { state: autoPersistState, controller: autoPersistController } = useAutoPersist(
    autoPersist
      ? {
          adapter: autoPersist.adapter,
          documentId: autoPersist.documentId,
          recordMeta: autoPersist.recordMeta,
          policy: autoPersist.policy,
          getBaseRevision: () => autoPersist?.baseRevision,
          getSnapshot: () => {
            const graphRef = internalRef.current;
            const session =
              autoPersist?.getSession?.() ??
              (graphRef && typeof graphRef.serialize === 'function' ? graphRef.serialize() : undefined);
            return {
              content: latestValueRef.current,
              ...(session !== undefined && { session }),
            };
          },
          onEvent: (event) => autoPersist?.onEvent?.(event),
          onStateChange: (state) => autoPersist?.onStateChange?.(state),
        }
      : undefined,
  );
  const autoPersistActive = autoPersist !== undefined;

  // 外部 value 注入（初始 load / 宿主加载 head）→ adopt 重置基线与乐观锁；
  // 自己经 onChange 发出的内容（emitted）与已注入过的内容（adopted）跳过。
  useEffect(() => {
    if (!autoPersistController || !autoPersist || props.value === undefined) return;
    const json = stableStringify(props.value);
    if (json === emittedJsonRef.current || json === adoptedJsonRef.current) return;
    adoptedJsonRef.current = json;
    autoPersistController.adopt({
      documentId: autoPersist.documentId,
      baseRevision: autoPersist.baseRevision,
      snapshot: { content: props.value, session: autoPersist.getSession?.() },
    });
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (autoPersistController && autoPersist?.onController) {
      autoPersist.onController(autoPersistController);
    }
  }, [autoPersistController, autoPersist]);

  const setRef = React.useCallback(
    (node: DecisionGraphRef | null) => {
      internalRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  const toolbarItems = useMemo<ToolbarItem[] | undefined>(() => {
    const host: SkinSlotHostContext = {
      graph: (props.value ?? props.defaultValue) as DecisionGraphType | undefined,
      disabled: props.disabled,
      graphRef: mounted ? internalRef.current : null,
    };
    const mapped = mapToolbarSlots(activeSkin?.layout?.toolbar, host);
    if (!mapped) {
      return props.toolbarItems;
    }
    return [...(props.toolbarItems ?? []), ...mapped];
    // activeSkin 参与依赖：切肤即重映射
  }, [activeSkin, mounted, props.value, props.defaultValue, props.disabled, props.toolbarItems]);

  const panels = useMemo<DecisionGraphProps['panels']>(() => {
    if (!simulateHandler) {
      return props.panels;
    }
    const simulatorPanel: PanelItem = {
      id: 'simulator',
      title: 'Simulator',
      icon: <PlayCircleIcon className='size-4' />,
      hideHeader: true,
      renderPanel: () => (
        <GraphSimulator
          defaultRequest={'{\n  \n}'}
          loading={running}
          simulationFooter={simulationFooter}
          onRun={({ graph, context }) => {
            setRunning(true);
            simulateHandler(graph as DecisionGraphType, context)
              .then((outcome) => setSimulation(outcome.simulation))
              .finally(() => setRunning(false));
          }}
          onClear={() => setSimulation(undefined)}
        />
      ),
    };
    return [...(props.panels ?? []), simulatorPanel];
  }, [props.panels, simulateHandler, running, simulationFooter]);

  // ADR-013 批次三：Run all 执行槽位——宿主显式传入优先，否则由 simulateHandler
  // 派生（执行语义与模拟器单源）；两者皆无时 kernel 优雅降级（按钮不渲染）
  const fixturesRunner = useMemo(
    () => props.fixturesRunner ?? (simulateHandler ? createSimulateFixturesRunner(simulateHandler) : undefined),
    [props.fixturesRunner, simulateHandler],
  );

  // S005 P2：右缘面板槽位（VersionHistoryPanel 同款 Sheet 容器）
  const rightSlots = useMemo(() => mapPanelSlotIds(activeSkin?.layout?.panels?.right), [activeSkin]);
  const rightSlotRenders = activeSkin?.layout?.panels?.right?.slots;
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  useEffect(() => {
    // 切肤/槽位变化后，打开态指向不存在的槽位时收起
    setOpenSlot((current) => (current && rightSlots?.includes(current) ? current : null));
  }, [rightSlots]);

  const slotContext: SkinSlotHostContext = {
    graph: (props.value ?? props.defaultValue) as DecisionGraphType | undefined,
    disabled: props.disabled,
    graphRef: mounted ? internalRef.current : null,
  };

  // S005 P3：皮肤头部槽位（ShellHeader，kernel 无 header）
  // ADR-008 L1：宿主优先浅合并——宿主给定的侧覆盖皮肤槽位
  const mergedHeaderSlots = { ...activeSkin?.layout?.header?.slots, ...headerSlots };
  // 模式 D：autoPersist 接线且宿主未提供 right 槽 → 注入默认同步徽标（宿主优先原则不变）
  const headerSlotsFinal =
    autoPersistActive && autoPersistController && !mergedHeaderSlots.right
      ? {
          ...mergedHeaderSlots,
          right: () => <SyncStatusBadge state={autoPersistState} onRetry={() => autoPersistController.flush()} />,
        }
      : mergedHeaderSlots;
  const hasHeader = !!(headerSlotsFinal?.left || headerSlotsFinal?.right);
  const headerNode = hasHeader ? (
    <ShellHeader
      graph={slotContext.graph}
      disabled={slotContext.disabled}
      graphRef={slotContext.graphRef}
      slots={headerSlotsFinal}
    />
  ) : null;

  const hasRail = !!rightSlots?.length;
  const handleGraphChange = (val: DecisionGraphType) => {
    latestValueRef.current = val;
    if (autoPersistActive) {
      emittedJsonRef.current = stableStringify(val);
      autoPersistController?.scheduleChange();
    }
    restProps.onChange?.(val);
  };
  const decisionGraph = (
    <DecisionGraph
      {...restProps}
      ref={setRef}
      toolbarItems={toolbarItems}
      panels={panels}
      simulate={props.simulate ?? simulation}
      fixturesRunner={fixturesRunner}
      onChange={autoPersistActive ? handleGraphChange : restProps.onChange}
    />
  );

  const sheetNode = hasRail ? (
    <Sheet open={openSlot !== null} onOpenChange={(open) => !open && setOpenSlot(null)}>
      <SheetContent
        side='right'
        className='flex w-full flex-col gap-4 sm:max-w-md'
        aria-label={openSlot ? `Skin panel ${openSlot}` : undefined}
      >
        <SheetHeader>
          <SheetTitle>{openSlot}</SheetTitle>
        </SheetHeader>
        <ScrollArea className='-mx-2 min-h-0 flex-1 px-2'>
          {openSlot !== null &&
            rightSlotRenders?.[openSlot]?.({
              graph: slotContext.graph ?? { nodes: [], edges: [] },
              disabled: !!slotContext.disabled,
              graphRef: slotContext.graphRef,
            })}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  ) : null;

  const railNode = hasRail ? (
    <div
      aria-label='skin-panel-rail'
      className='flex w-12 shrink-0 flex-col items-center gap-2 border-l border-[var(--border)] bg-[var(--seal-color-bg-container)] py-2'
    >
      {rightSlots.map((slotId) => (
        <button
          key={slotId}
          type='button'
          title={`${openSlot === slotId ? 'Close' : 'Open'} ${slotId}`}
          aria-label={`${openSlot === slotId ? 'Close' : 'Open'} ${slotId}`}
          aria-expanded={openSlot === slotId}
          className='flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
          style={openSlot === slotId ? { background: 'rgba(0, 0, 0, 0.1)' } : undefined}
          onClick={() => setOpenSlot((current) => (current === slotId ? null : slotId))}
        >
          <PanelRightIcon className='h-4 w-4' />
        </button>
      ))}
    </div>
  ) : null;

  if (!hasHeader && !hasRail) {
    return <div className='contents'>{decisionGraph}</div>;
  }

  const body = hasRail ? (
    <div className='flex h-full min-h-0 w-full min-w-0 flex-1'>
      <div className='h-full min-w-0 flex-1'>{decisionGraph}</div>
      {railNode}
    </div>
  ) : (
    <div className='h-full min-w-0 flex-1'>{decisionGraph}</div>
  );

  return (
    <div className='flex h-full w-full min-h-0 flex-col'>
      {headerNode}
      {body}
      {sheetNode}
    </div>
  );
});
