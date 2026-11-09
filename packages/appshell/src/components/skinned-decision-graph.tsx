import {
  DecisionGraph,
  type DecisionGraphProps,
  type DecisionGraphRef,
  type DecisionGraphType,
  FixturesPanel,
  GraphSimulator,
  JdmConfigProvider,
  type Simulation,
  type ToolbarItem,
  resolveSimulatorInput,
} from '@republicroad/seal-editor';
import { useT } from '@republicroad/seal-editor';
import { FlaskConicalIcon, PanelRightIcon } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

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
import { useOptionalEditorShell } from '../shell/editor-shell.context';
import { createSimulateFixturesRunner } from '../shell/fixtures-adapter';
import type { GraphPersistenceAdapter } from '../shell/persistence';
import { resolveShellCustomFunctions } from '../shell/shell-custom-functions';
import type { SimulateHandler } from '../shell/types';
import { mapPanelSlotIds, mapToolbarSlots } from '../skin/layout';
import type { SkinHeaderSlots, SkinSlotHostContext } from '../skin/types';
import { DefaultShellHeader } from './default-shell-header';
import { ShellHeader } from './shell-header';
import { SyncStatusBadge } from './sync-status-badge';
import { ScrollArea } from './ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';
import { Toaster } from './ui/sonner';

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
  headerSlots?: SkinHeaderSlots; /**
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
  /** Run 历史持久化键（传入即启用：元数据环形常驻 + pin 载荷保留） */
  runsPersistenceKey?: string;
  /** 治理谓词（批 23）：按 namespace/kind 过滤 customNodes——缺省不过滤 */
  allowedNamespaces?: Set<string>;
  /** ⌘K 二期：宿主注入扩展命令 */
  extraCommands?: Array<{
    id: string;
    group: string;
    label: string;
    icon?: React.ReactNode;
    keywords: string;
    run: () => void;
  }>;
  /**
   * navbar-5 默认头部（DefaultShellHeader：back + enabled Switch + History +
   * Test Run 主钮 + more 菜单）。opt-in——缺省 false=无槽位时维持裸图（今日行为）；
   * 皮肤/宿主槽位在场时槽位形态优先（ADR-008 L1 不动）。
   */
  defaultHeader?: boolean;
  /** 默认头部：返回导航（无则不渲染 back 钮） */
  onBack?: () => void;
  /** 默认头部：标题（文档名属宿主） */
  headerTitle?: React.ReactNode;
  /** 默认头部：历史入口（version-history 数据属宿主 persistence，回调入口制） */
  onOpenHistory?: () => void;
  /** 默认头部 more 菜单：Duplicate */
  onDuplicate?: () => void;
  /** 默认头部 more 菜单：Delete（AlertDialog 确认后回调） */
  onDelete?: () => void;
  /** 默认头部 more 菜单：覆盖内建 Export JSON */
  onExportJson?: () => void;
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
  const { activeSkin, isDarkTheme } = useTheme();
  const {
    simulateHandler,
    headerSlots,
    autoPersist,
    simulationFooter,
    customFunctions,
    runsPersistenceKey,
    allowedNamespaces,
    extraCommands,
    defaultHeader,
    onBack,
    headerTitle,
    onOpenHistory,
    onDuplicate,
    onDelete,
    onExportJson,
    ...restProps
  } = props;
  const t = useT();
  const shell = useOptionalEditorShell();
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
      renderPanel: () => (
        <GraphSimulator
          defaultRequest={'{\n  \n}'}
          loading={running}
          simulationFooter={simulationFooter}
          runsPersistenceKey={runsPersistenceKey}
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
    // ADR-013 批次三 / 分屏范式 §1.2：Run all 图级执行面（与 simulator 对称），
    // 渲染 kernel FixturesPanel（读 fixturesRunner 槽位，作用于唯一 inputNode）
    const fixturesPanel: PanelItem = {
      id: 'fixtures',
      title: 'Fixtures',
      icon: <FlaskConicalIcon className='size-4' />,
      renderPanel: () => <FixturesPanel />,
    };
    return [...(props.panels ?? []), simulatorPanel, fixturesPanel];
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

  // 批 3：仿真完成 toast（kernel 发 seal:simulation-finished 事件桥——kernel 不依赖 sonner）
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ ok: boolean; performance?: string; error?: string }>).detail;
      if (detail?.ok) {
        toast.success(t('dg.simulation.toastOk') + (detail.performance ? ' · ' + detail.performance : ''));
      } else {
        toast.error(t('dg.simulation.toastErr') + (detail?.error ? ' · ' + detail.error : ''));
      }
    };
    window.addEventListener('seal:simulation-finished', handler);
    return () => window.removeEventListener('seal:simulation-finished', handler);
  }, []);

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
  const hasHeaderSlots = !!(headerSlotsFinal?.left || headerSlotsFinal?.right);

  const hasRail = !!rightSlots?.length;
  const handleGraphChange = (val: DecisionGraphType) => {
    latestValueRef.current = val;
    if (autoPersistActive) {
      emittedJsonRef.current = stableStringify(val);
      autoPersistController?.scheduleChange();
    }
    restProps.onChange?.(val);
  };
  // enabled 文档级翻转走 handleGraphChange 全链（autoPersist 接线时同轮触发保存）
  const handleEnabledChange = (enabled: boolean) => {
    const current = slotContext.graph;
    if (!current) return;
    handleGraphChange({ ...current, enabled });
  };
  // navbar-5 默认头部（defaultHeader opt-in）：槽位在场时槽位形态优先（ADR-008 L1 不动）
  const headerNode = hasHeaderSlots ? (
    <ShellHeader
      graph={slotContext.graph}
      disabled={slotContext.disabled}
      graphRef={slotContext.graphRef}
      slots={headerSlotsFinal}
    />
  ) : defaultHeader ? (
    <DefaultShellHeader
      graph={slotContext.graph}
      disabled={slotContext.disabled}
      graphRef={slotContext.graphRef}
      onEnabledChange={handleEnabledChange}
      // 无 simulateHandler = simulator 面板未注册 → 不给通道（按钮诚实禁用，防静默失效）。
      // 直跑语义（n8n Execute Workflow 模式）：examples[0] 预处理（无则空 {}）→ 执行 →
      // 面板自动打开 + Request 回填本次输入（用户可改后经面板 Run 重跑）
      onTestRun={
        simulateHandler
          ? () => {
              if (!mounted) return;
              const graphRef = internalRef.current;
              const graph = slotContext.graph;
              if (!graphRef || !graph) return;
              const input = resolveSimulatorInput(graph);
              setRunning(true);
              simulateHandler(graph, input)
                .then((outcome) => setSimulation(outcome.simulation))
                .finally(() => setRunning(false));
              graphRef.setSimulatorRequest(JSON.stringify(input, null, 2));
              graphRef.setActivePanel('simulator');
            }
          : undefined
      }
      onBack={onBack}
      title={headerTitle}
      onOpenHistory={onOpenHistory}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
      onExportJson={onExportJson}
      syncBadge={
        autoPersistActive && autoPersistController ? (
          <SyncStatusBadge state={autoPersistState} onRetry={() => autoPersistController.flush()} />
        ) : undefined
      }
    />
  ) : null;
  const hasHeader = hasHeaderSlots || !!defaultHeader;
  // 兜底 tab 函数作用域缺省接线（InstanceEditor 函数下拉/参数行数据源）：
  // 宿主显式 customFunctions 优先（宿主优先原则），否则取 shell schema——
  // EditorShellProvider 场景零接线；无 Provider（stories 直用）行为不变
  const effectiveCustomFunctions = resolveShellCustomFunctions(customFunctions, shell?.schema);
  // M4 收缩（ADR-025 D4）：appshell 解析结果（模式+皮肤种子/token）经 theme/seeds
  // 显式下传内核——内核自持根 data-mode 显式化，不再依赖外层 Provider 的 dataset 写入
  const decisionGraph = (
    <DecisionGraph
      {...restProps}
      theme={{ mode: isDarkTheme ? 'dark' : 'light', token: activeSkin?.tokens }}
      seeds={activeSkin?.seeds}
      allowedNamespaces={allowedNamespaces}
      extraCommands={extraCommands}
      ref={setRef}
      toolbarItems={toolbarItems}
      panels={panels}
      simulate={props.simulate ?? simulation}
      fixturesRunner={fixturesRunner}
      customFunctions={effectiveCustomFunctions}
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

  // 外层 Provider（chrome=false）：岛容器 scope 供 header 浮层（more 菜单/确认框）
  // 的 portal 挂进 kernel 自持岛根——header 本体在岛外，读不到 kernel 内层
  // SealContainerProvider；data-mode 双写同值幂等（与内层同源 isDarkTheme）
  return (
    <JdmConfigProvider theme={{ mode: isDarkTheme ? 'dark' : 'light' }} chrome={false}>
      <div className='flex h-full w-full min-h-0 flex-col'>
        {headerNode}
        {body}
        {sheetNode}
        <Toaster position='bottom-right' />
      </div>
    </JdmConfigProvider>
  );
});
