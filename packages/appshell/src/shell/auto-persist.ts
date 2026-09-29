import type { TabSnapshot } from '@republicroad/seal-editor';
import { useEffect, useMemo, useRef, useState } from 'react';

import { type GraphPersistenceAdapter, GraphPersistenceError, type PersistenceErrorCode } from './persistence';

/*
 * AutoPersistController（docs/design/appshell-auto-persist.md §2，ADR-008 L2 模式 D 落地）。
 * 把内核编辑面 onChange 流接往 GraphPersistenceAdapter：防抖连续保存 + 乐观锁 + 冲突停轮。
 *
 * 业界实践对齐（2026-09 实施时核定）：
 * - 防抖 + maxWait 兜底（纯防抖会饿死连续编辑流的保存）
 * - no-op 跳过（与已同步基线快照对比；同时吞掉受控回写/加载的 onChange 回声）
 * - 单 inflight + 尾随合并；baseRevision 乐观锁，CONFLICT 停轮不自动重试
 * - 非冲突错误指数退避重试（FORBIDDEN/NOT_FOUND 不重试）
 * - pagehide/visibilitychange 冲刷 + fetch keepalive（unload/beforeunload 已弃用）
 * - 遥测事件钩子（saved/conflict/error/retry + 耗时）
 * 内核零改动；合并策略、多标签广播、离线队列不在本机制内（设计档 §4）。
 */

/** 受控快照：content = DecisionGraphType；session = GraphRef.serialize() 的页签现场（best-effort） */
export interface AutoPersistSnapshot {
  content: unknown;
  session?: TabSnapshot;
}

export interface AutoPersistPolicy {
  /** 防抖窗口：onChange 静默期后才落盘。缺省 2000ms */
  debounceMs?: number;
  /** maxWait 兜底：防抖被连续编辑不断重置时，距上次变更最多 maxWaitMs 强制落盘一轮。缺省 15000ms，0=关闭 */
  maxWaitMs?: number;
  /** 自动保存条目打 auto 标记（GraphRecordMeta.auto，走保留策略）。缺省 true */
  autoEntry?: boolean;
  /** 每 N 次成功自动保存升级为命名版本（0=不升级）。缺省 0 */
  namedVersionEvery?: number;
  /** 非冲突错误（网络/5xx 类）的退避重试次数。缺省 2；FORBIDDEN/NOT_FOUND 不重试，CONFLICT 停轮 */
  retries?: number;
  /** 退避基值：delay = retryBaseMs × 2^attempt + 均匀抖动(≤250ms)。缺省 1000ms */
  retryBaseMs?: number;
}

export type AutoPersistStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'conflict' | 'error';

export interface AutoPersistState {
  status: AutoPersistStatus;
  lastSavedAt?: string;
  lastError?: { code: PersistenceErrorCode | 'NETWORK'; message: string };
  /**
   * CONFLICT 详情：localBaseRevision 为本端乐观锁基线；serverHeadRevision 契约不回传，
   * 需宿主经 adapter.load/listVersions 获取后回填展示。
   */
  conflict?: { localBaseRevision?: string; serverHeadRevision?: string };
}

export type AutoPersistEvent =
  | { type: 'saved'; micros: number; revision: string; versionName?: string }
  | { type: 'conflict'; localBaseRevision?: string }
  | { type: 'error'; code: PersistenceErrorCode | 'NETWORK'; message: string }
  | { type: 'retry'; attempt: number; message: string };

export interface AutoPersistRecordMeta {
  name: string;
  description?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

const IDLE_STATE: AutoPersistState = { status: 'idle' };

/** 键序无关的稳定序列化——快照对比的口径（回声/乱序键不触发保存轮）；集成桥判外部注入也用它 */
export const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
};

export interface AutoPersistControllerOptions {
  adapter: GraphPersistenceAdapter;
  documentId: string;
  /** 当前快照来源（受控 value / ref 皆可）；返回 undefined 时静默跳过保存轮 */
  getSnapshot: () => AutoPersistSnapshot | undefined;
  /** 静态记录元数据（name 必填——GraphRecordMeta 契约）；变更后请重新创建控制器或 adopt */
  recordMeta: AutoPersistRecordMeta;
  /** 初始 head revision（宿主从 load 结果带入；成功保存后控制器自跟踪新 revision） */
  getBaseRevision?: () => string | undefined;
  policy?: AutoPersistPolicy;
  onEvent?: (event: AutoPersistEvent) => void;
  onStateChange?: (state: AutoPersistState) => void;
  /** 命名版本生成器（namedVersionEvery 到点调用）；缺省「自动版本 N」 */
  versionNameFactory?: (savedCount: number) => string;
}

export interface AutoPersistController {
  /**
   * 外部文档注入（初始 load / 宿主加载 head / 文档切换）：重置基线、乐观锁与冲突态，
   * 吞掉注入引发的 onChange 回声。conflict 'loadHead' 路径的收尾也走这里。
   */
  adopt(init: { documentId?: string; baseRevision?: string; snapshot?: AutoPersistSnapshot }): void;
  /** 编辑变更进入防抖队列；conflict 停轮期间调用被忽略（变更仅留在本地，等待三选裁决） */
  scheduleChange(): void;
  /** 立即保存（跳过防抖与 maxWait；页面卸载冲刷传 keepalive=true） */
  flush(opts?: { keepalive?: boolean }): void;
  /** CONFLICT 三选原语：内容合并与三选 UI 归宿主（契约见 save-persistence-contract.md §3） */
  resolveConflict(choice: 'overwrite' | 'loadHead' | 'saveCopy', opts?: { copyId?: string }): void;
  getState(): AutoPersistState;
  destroy(): void;
}

export const createAutoPersistController = (options: AutoPersistControllerOptions): AutoPersistController => {
  const debounceMs = options.policy?.debounceMs ?? 2000;
  const maxWaitMs = options.policy?.maxWaitMs ?? 15000;
  const autoEntry = options.policy?.autoEntry ?? true;
  const namedVersionEvery = options.policy?.namedVersionEvery ?? 0;
  const retries = options.policy?.retries ?? 2;
  const retryBaseMs = options.policy?.retryBaseMs ?? 1000;

  let documentId = options.documentId;
  let headRevision = options.getBaseRevision?.();
  let lastSyncedJson: string | undefined;
  let lastSavedAt: string | undefined;
  let lastError: AutoPersistState['lastError'];
  let conflict: AutoPersistState['conflict'];
  let status: AutoPersistStatus = 'idle';
  let savedCount = 0;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let maxTimer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let inflight = false;
  let pendingAfter = false;
  let destroyed = false;
  /** adopt 会作废在途保存轮（旧文档的完成回调不得写新文档的基线） */
  let saveSeq = 0;

  const emit = () => options.onStateChange?.(getState());

  const setState = (patch: Partial<AutoPersistState>) => {
    status = patch.status ?? status;
    if ('lastSavedAt' in patch) lastSavedAt = patch.lastSavedAt;
    if ('lastError' in patch) lastError = patch.lastError;
    if ('conflict' in patch) conflict = patch.conflict;
    emit();
  };

  function getState(): AutoPersistState {
    return {
      status,
      ...(lastSavedAt !== undefined && { lastSavedAt }),
      ...(lastError !== undefined && { lastError }),
      ...(conflict !== undefined && { conflict }),
    };
  }

  const clearTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (maxTimer) clearTimeout(maxTimer);
    if (retryTimer) clearTimeout(retryTimer);
    debounceTimer = maxTimer = retryTimer = undefined;
  };

  const delay = (ms: number) =>
    new Promise<void>((resolve) => {
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        resolve();
      }, ms);
    });

  const armTimers = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined;
      if (maxTimer) {
        clearTimeout(maxTimer);
        maxTimer = undefined;
      }
      void runSave({});
    }, debounceMs);
    if (!maxTimer && maxWaitMs > 0) {
      maxTimer = setTimeout(() => {
        maxTimer = undefined;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
          debounceTimer = undefined;
        }
        void runSave({});
      }, maxWaitMs);
    }
  };

  const onEvent = options.onEvent;

  const finishError = (seq: number, code: PersistenceErrorCode | 'NETWORK', message: string) => {
    if (seq !== saveSeq || destroyed) return;
    inflight = false;
    lastError = { code, message };
    status = 'error';
    onEvent?.({ type: 'error', code, message });
    emit();
  };

  const runSave = async (force: { overwrite?: boolean; keepalive?: boolean; copyId?: string; copyName?: string }) => {
    if (destroyed) return;
    clearTimers();
    const seq = ++saveSeq;

    const snapshot = options.getSnapshot();
    if (!snapshot) {
      if (status === 'pending') setState({ status: lastSavedAt ? 'saved' : 'idle' });
      return;
    }
    const json = stableStringify(snapshot);
    const isCopy = force.copyId !== undefined;
    if (!isCopy && !force.overwrite && json === lastSyncedJson) {
      // no-op 跳过：受控回写/加载回声或未产生实质变更——不打冗余保存轮
      if (status === 'pending') setState({ status: lastSavedAt ? 'saved' : 'idle' });
      return;
    }
    if (inflight) {
      pendingAfter = true;
      return;
    }

    inflight = true;
    const t0 = Date.now();
    setState({ status: 'saving' });

    const versionName = isCopy
      ? (force.copyName ?? '冲突副本')
      : namedVersionEvery > 0 && (savedCount + 1) % namedVersionEvery === 0
        ? (options.versionNameFactory?.(savedCount + 1) ?? `自动版本 ${savedCount + 1}`)
        : undefined;

    const record = {
      id: isCopy ? force.copyId! : documentId,
      ...options.recordMeta,
      ...(autoEntry && !isCopy && { auto: true }),
      ...(versionName !== undefined && { versionName }),
      content: snapshot.content,
      ...(snapshot.session !== undefined && { session: snapshot.session }),
    };
    const baseRevision = isCopy || force.overwrite ? undefined : headRevision;

    let result: { id: string; revision: string };
    for (let attempt = 0; ; attempt += 1) {
      try {
        result = await options.adapter.save(record, { baseRevision, keepalive: force.keepalive === true });
        break;
      } catch (e) {
        if (e instanceof GraphPersistenceError) {
          if (e.code === 'CONFLICT') {
            inflight = false;
            conflict = { localBaseRevision: baseRevision };
            status = 'conflict';
            onEvent?.({ type: 'conflict', localBaseRevision: baseRevision });
            emit();
            return;
          }
          // NOT_FOUND/FORBIDDEN：重试无意义
          finishError(seq, e.code, e.message);
          return;
        }
        if (attempt >= retries) {
          finishError(seq, 'NETWORK', e instanceof Error ? e.message : String(e));
          return;
        }
        if (destroyed) return;
        onEvent?.({ type: 'retry', attempt: attempt + 1, message: e instanceof Error ? e.message : String(e) });
        await delay(retryBaseMs * 2 ** attempt + Math.random() * 250);
        if (destroyed || seq !== saveSeq) return;
      }
    }

    inflight = false;
    if (destroyed || seq !== saveSeq) return;
    headRevision = result.revision;
    if (isCopy) documentId = result.id;
    lastSyncedJson = json;
    lastSavedAt = new Date().toISOString();
    lastError = undefined;
    conflict = undefined;
    status = 'saved';
    savedCount += 1;
    onEvent?.({ type: 'saved', micros: Date.now() - t0, revision: result.revision, versionName });
    emit();

    if (pendingAfter) {
      pendingAfter = false;
      setState({ status: 'pending' });
      armTimers();
    }
  };

  return {
    adopt(init) {
      if (destroyed) return;
      clearTimers();
      saveSeq += 1;
      inflight = false;
      pendingAfter = false;
      if (init.documentId !== undefined) documentId = init.documentId;
      headRevision = init.baseRevision;
      lastSyncedJson = init.snapshot ? stableStringify(init.snapshot) : undefined;
      conflict = undefined;
      lastError = undefined;
      savedCount = 0;
      lastSavedAt = undefined;
      status = 'idle';
      emit();
    },

    scheduleChange() {
      if (destroyed || status === 'conflict') return;
      if (inflight) pendingAfter = true; // 保存/重试中到达：完成后立即合并为下一轮
      if (status !== 'saving') setState({ status: 'pending' });
      armTimers();
    },

    flush(opts) {
      if (destroyed || status === 'conflict') return;
      void runSave({ keepalive: opts?.keepalive === true });
    },

    resolveConflict(choice, opts) {
      if (destroyed || status !== 'conflict') return;
      if (choice === 'overwrite') {
        conflict = undefined;
        status = 'pending';
        void runSave({ overwrite: true });
        return;
      }
      if (choice === 'saveCopy') {
        conflict = undefined;
        status = 'pending';
        void runSave({
          copyId: opts?.copyId ?? `${documentId}-conflict-${Date.now()}`,
          copyName: '冲突副本',
        });
        return;
      }
      // loadHead：控制器让位，等待宿主 adapter.load 完成后 adopt(...) 重入
      conflict = undefined;
      status = 'idle';
      emit();
    },

    getState,

    destroy() {
      destroyed = true;
      clearTimers();
      saveSeq += 1;
    },
  };
};

/* ============ React 集成 ============ */

export interface UseAutoPersistOptions extends AutoPersistControllerOptions {
  /** 页面隐藏/卸载时冲刷在途变更（pagehide + visibilitychange + fetch keepalive）。缺省 true */
  flushOnHide?: boolean;
}

/**
 * D 模式同步状态 hook：创建控制器、随 documentId/baseRevision 变化 adopt、
 * 接管页面隐藏/卸载冲刷。onChange → controller.scheduleChange() 由集成方
 * （SkinnedDecisionGraph autoPersist 桥或页面层宿主）接线。
 * recordMeta/policy/versionNameFactory 在创建时捕获——变更需更换 adapter/documentId
 * 触发重建，或经 adopt 重置。
 */
export const useAutoPersist = (
  options: UseAutoPersistOptions | undefined,
): {
  state: AutoPersistState;
  controller: AutoPersistController | undefined;
} => {
  const [state, setState] = useState<AutoPersistState>(IDLE_STATE);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const adapter = options?.adapter;
  const documentId = options?.documentId;
  const baseRevision = options?.getBaseRevision?.();
  const controller = useMemo(() => {
    if (!options) return undefined;
    return createAutoPersistController({
      ...options,
      getSnapshot: () => optionsRef.current?.getSnapshot() ?? undefined,
      getBaseRevision: () => optionsRef.current?.getBaseRevision?.(),
      onEvent: (event) => optionsRef.current?.onEvent?.(event),
      onStateChange: (s) => {
        setState(s);
        optionsRef.current?.onStateChange?.(s);
      },
    });
  }, [adapter, documentId]);

  useEffect(() => {
    if (!controller) return;
    controller.adopt({
      documentId,
      baseRevision,
      snapshot: optionsRef.current?.getSnapshot(),
    });
    // baseRevision 变化即外部加载信号（宿主 load 完成后带入）；外部注入由集成方调 adopt（M2 桥）。
  }, [controller, documentId, baseRevision]);

  useEffect(() => {
    if (!controller) return;
    const flush = () => controller.flush({ keepalive: true });
    if (
      options?.flushOnHide !== false &&
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      window.addEventListener('pagehide', flush);
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') flush();
      };
      document.addEventListener('visibilitychange', onVisibility);
      return () => {
        window.removeEventListener('pagehide', flush);
        document.removeEventListener('visibilitychange', onVisibility);
      };
    }
    return undefined;
  }, [controller, options?.flushOnHide]);

  useEffect(
    () => () => {
      controller?.flush({ keepalive: true });
      controller?.destroy();
    },
    [controller],
  );

  return { state, controller };
};
