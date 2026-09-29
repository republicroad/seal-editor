import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { type AutoPersistEvent, type AutoPersistSnapshot, createAutoPersistController } from '../auto-persist';
import { type GraphPersistenceAdapter, GraphPersistenceError } from '../persistence';

const snapshotOf = (content: unknown): AutoPersistSnapshot => ({ content });

const createHarness = (opts: {
  adapter?: Partial<GraphPersistenceAdapter>;
  policy?: Parameters<typeof createAutoPersistController>[0]['policy'];
  initialRevision?: string;
  initialSnapshot?: AutoPersistSnapshot;
}) => {
  let current: AutoPersistSnapshot | undefined = opts.initialSnapshot;
  let baseRevision: string | undefined = opts.initialRevision;
  const save = vi.fn<(record: any, o: any) => Promise<{ id: string; revision: string }>>();
  const adapter = {
    save: (record: any, o: any) => save(record, o),
    ...opts.adapter,
  } as GraphPersistenceAdapter;
  const events: AutoPersistEvent[] = [];
  const controller = createAutoPersistController({
    adapter,
    documentId: 'g1',
    recordMeta: { name: 'demo' },
    policy: opts.policy,
    getSnapshot: () => current,
    getBaseRevision: () => baseRevision,
    onEvent: (e) => events.push(e),
  });
  if (opts.initialSnapshot) {
    controller.adopt({ documentId: 'g1', baseRevision: baseRevision, snapshot: opts.initialSnapshot });
  }
  return {
    controller,
    save,
    events,
    setSnapshot: (s: AutoPersistSnapshot | undefined) => {
      current = s;
    },
    setBaseRevision: (r: string | undefined) => {
      baseRevision = r;
    },
  };
};

const ok = (revision: string) => async () => ({ id: 'g1', revision });

describe('createAutoPersistController（模式 D 自动保存）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('防抖窗口内的多次变更合并为一轮保存，携带最新快照与 baseRevision', async () => {
    const h = createHarness({
      policy: { debounceMs: 2000 },
      initialRevision: 'v7',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockImplementation(ok('v8'));

    h.controller.scheduleChange();
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange();

    await vi.advanceTimersByTimeAsync(1999);
    expect(h.save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][0].content).toEqual({ v: 3 });
    expect(h.save.mock.calls[0][1].baseRevision).toBe('v7');
    expect(h.save.mock.calls[0][0].auto).toBe(true);
    expect(h.controller.getState().status).toBe('saved');
    expect(h.controller.getState().lastSavedAt).toBeDefined();
  });

  test('maxWait 兜底：连续编辑不断重置防抖时仍周期性落盘', async () => {
    const h = createHarness({
      policy: { debounceMs: 2000, maxWaitMs: 5000 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 0 }),
    });
    h.save.mockImplementation(ok('v2'));

    // 每秒一次变更：防抖(2s)永远达不到静默期 → 5s maxWait 必须兜底
    for (let t = 1; t <= 6; t += 1) {
      h.setSnapshot(snapshotOf({ v: t }));
      h.controller.scheduleChange();
      await vi.advanceTimersByTimeAsync(1000);
    }

    expect(h.save).toHaveBeenCalledTimes(1); // 6s 内恰好在 maxWait 到点落盘一次
    expect(h.save.mock.calls[0][0].content).toEqual({ v: 5 });
  });

  test('no-op 跳过：与基线深等（键序无关）的快照不触发保存轮', async () => {
    const h = createHarness({ policy: { debounceMs: 500 }, initialSnapshot: snapshotOf({ a: 1, b: 2 }) });
    h.save.mockImplementation(ok('v2'));

    h.controller.scheduleChange(); // 回声：内容与 adopt 基线相同
    await vi.advanceTimersByTimeAsync(500);
    expect(h.save).not.toHaveBeenCalled();
    expect(h.controller.getState().status).toBe('idle');

    h.setSnapshot(snapshotOf({ b: 2, a: 1 })); // 键序不同，内容相同
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.save).not.toHaveBeenCalled();

    h.setSnapshot(snapshotOf({ a: 1, b: 3 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.controller.getState().status).toBe('saved');
  });

  test('单 inflight：保存中到达的变更排队为下一轮（尾随合并）', async () => {
    let resolveFirst!: (v: { id: string; revision: string }) => void;
    const h = createHarness({
      policy: { debounceMs: 100 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockImplementationOnce(() => new Promise<{ id: string; revision: string }>((res) => (resolveFirst = res)));
    h.save.mockImplementation(ok('v3'));

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.controller.getState().status).toBe('saving');

    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange(); // saving 期间变更 → 状态保持 saving，计时器已布防
    h.setSnapshot(snapshotOf({ v: 4 }));
    h.controller.scheduleChange();

    resolveFirst({ id: 'g1', revision: 'v2' });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.controller.getState().status).toBe('pending');
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.save.mock.calls[1][0].content).toEqual({ v: 4 });
    expect(h.save.mock.calls[1][1].baseRevision).toBe('v2');
    expect(h.controller.getState().status).toBe('saved');
  });

  test('CONFLICT 停轮：不重试、状态 conflict、后续变更被忽略直至裁决', async () => {
    const h = createHarness({
      policy: { debounceMs: 100 },
      initialRevision: 'v7',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockRejectedValueOnce(new GraphPersistenceError('CONFLICT', 'stale'));
    h.save.mockImplementation(ok('v9'));

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);

    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.controller.getState().status).toBe('conflict');
    expect(h.controller.getState().conflict).toEqual({ localBaseRevision: 'v7' });
    expect(h.events.some((e) => e.type === 'conflict')).toBe(true);

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.save).toHaveBeenCalledTimes(1); // 停轮：未新增保存
  });

  test('非冲突错误退避重试：两次网络失败后第三轮成功，发出 retry 事件', async () => {
    const h = createHarness({
      policy: { debounceMs: 100, retryBaseMs: 1000, retries: 2 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.save
      .mockRejectedValueOnce(new Error('network down'))
      .mockRejectedValueOnce(new Error('still down'))
      .mockImplementation(ok('v2'));

    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000 + 250); // 第一次退避（含抖动上限）
    expect(h.save).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(2000 + 250); // 第二次退避
    expect(h.save).toHaveBeenCalledTimes(3);
    expect(h.controller.getState().status).toBe('saved');
    expect(h.events.filter((e) => e.type === 'retry')).toHaveLength(2);
  });

  test('FORBIDDEN 不重试：单次调用即 error 态', async () => {
    const h = createHarness({
      policy: { debounceMs: 100, retries: 3 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.save.mockRejectedValue(new GraphPersistenceError('FORBIDDEN', 'no'));

    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.controller.getState().status).toBe('error');
    expect(h.controller.getState().lastError).toMatchObject({ code: 'FORBIDDEN' });
  });

  test('namedVersionEvery：第 N 次成功保存升级命名版本，auto 标记随行', async () => {
    const h = createHarness({
      policy: { debounceMs: 100, namedVersionEvery: 2 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockImplementation(ok('v2'));

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save.mock.calls[0][0].versionName).toBeUndefined();

    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save.mock.calls[1][0].versionName).toBe('自动版本 2');
    const savedEvents = h.events.filter((e) => e.type === 'saved');
    expect(savedEvents).toHaveLength(2);
    expect(savedEvents[1]).toMatchObject({ revision: 'v2', versionName: '自动版本 2' });
  });

  test('adopt 吞回声：注入后同内容 onChange 不产生保存轮，实质变更才保存', async () => {
    const h = createHarness({ policy: { debounceMs: 100 } });
    h.save.mockImplementation(ok('v1'));

    h.controller.adopt({ documentId: 'g2', baseRevision: 'v0', snapshot: snapshotOf({ loaded: true }) });
    h.setSnapshot(snapshotOf({ loaded: true })); // 注入回声
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(200);
    expect(h.save).not.toHaveBeenCalled();

    h.setSnapshot(snapshotOf({ loaded: true, edited: 1 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][0].id).toBe('g2');
    expect(h.save.mock.calls[0][1].baseRevision).toBe('v0');
  });

  test('resolveConflict overwrite：无 baseRevision 强写 head，成功后恢复自动轮', async () => {
    const h = createHarness({
      policy: { debounceMs: 100 },
      initialRevision: 'v7',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockRejectedValueOnce(new GraphPersistenceError('CONFLICT'));
    h.save.mockImplementation(ok('v9'));
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    expect(h.controller.getState().status).toBe('conflict');

    h.controller.resolveConflict('overwrite');
    await vi.advanceTimersByTimeAsync(0);
    expect(h.save).toHaveBeenCalledTimes(2);
    expect(h.save.mock.calls[1][1].baseRevision).toBeUndefined();
    expect(h.controller.getState().status).toBe('saved');
  });

  test('resolveConflict saveCopy：副本 id + 命名版本，成功后编辑目标切至副本', async () => {
    const h = createHarness({
      policy: { debounceMs: 100 },
      initialRevision: 'v7',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.save.mockRejectedValueOnce(new GraphPersistenceError('CONFLICT'));
    h.save.mockImplementation(async (_r, _o) => ({ id: 'g1-conflict-1', revision: 'v1' }));
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);

    h.controller.resolveConflict('saveCopy', { copyId: 'g1-conflict-1' });
    await vi.advanceTimersByTimeAsync(500); // 容纳副本保存轮与其完成回调的微任务交错
    expect(h.save.mock.calls[1][0].id).toBe('g1-conflict-1');
    expect(h.save.mock.calls[1][0].versionName).toBe('冲突副本');
    expect(h.controller.getState().status).toBe('saved');

    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(5000);
    expect(h.save.mock.calls[2][0].id).toBe('g1-conflict-1'); // 后续保存落副本
  });

  test('flush 立即落盘并透传 keepalive；destroy 后静默', async () => {
    const h = createHarness({ initialRevision: 'v1', initialSnapshot: snapshotOf({ v: 1 }) });
    h.save.mockImplementation(ok('v2'));

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    h.controller.flush({ keepalive: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.save).toHaveBeenCalledTimes(1);
    expect(h.save.mock.calls[0][1].keepalive).toBe(true);

    h.controller.destroy();
    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.save).toHaveBeenCalledTimes(1);
  });

  test('saveCount 不因失败漂移：失败轮不计入命名版本节奏', async () => {
    const h = createHarness({
      policy: { debounceMs: 100, namedVersionEvery: 2, retries: 0 },
      initialRevision: 'v1',
      initialSnapshot: snapshotOf({ v: 1 }),
    });
    h.setSnapshot(snapshotOf({ v: 2 }));
    h.save.mockRejectedValueOnce(new Error('down')).mockImplementation(ok('v2'));

    h.setSnapshot(snapshotOf({ v: 2 }));
    h.controller.scheduleChange();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(5000); // 重试耗尽（retries=0 → 1 次）→ error
    expect(h.controller.getState().status).toBe('error');

    h.setSnapshot(snapshotOf({ v: 3 }));
    h.controller.scheduleChange(); // 变更从 error 态重新进入队列
    await vi.advanceTimersByTimeAsync(100);
    expect(h.controller.getState().status).toBe('saved');
    expect(h.save.mock.calls[1][0].versionName).toBeUndefined(); // 仍是第 1 次成功
  });
});
