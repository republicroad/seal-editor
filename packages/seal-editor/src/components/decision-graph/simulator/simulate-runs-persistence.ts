import type { SimulateRunEntry } from '../context/dg-store.context';

/**
 * Run 历史持久化序列（批 16 混合方案，业界「元数据常驻、载荷分级」）：
 * - 元数据（时间/结果/耗时/错误摘要）一律持久化——体积小、历史上下文常在；
 * - 载荷（snapshot：IO+trace）仅 **pin 的条目**保留——大体积显式豁免；
 * - 未 pin 的条目反序列化后 `payloadEvicted: true`，行内提示「重跑可回看」。
 */
export type StoredSimulateRun = Omit<SimulateRunEntry, 'snapshot'> & {
  snapshot?: SimulateRunEntry['snapshot'];
};

export const serializeRuns = (entries: SimulateRunEntry[]): string =>
  JSON.stringify(
    entries.map((entry) => {
      const { snapshot: _snapshot, ...meta } = entry;
      return entry.pinned ? entry : { ...meta, snapshot: undefined };
    }),
  );

export const parseRuns = (raw: string): StoredSimulateRun[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredSimulateRun[]) : [];
  } catch {
    return [];
  }
};

export const loadRuns = (key: string): StoredSimulateRun[] => {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  return raw ? parseRuns(raw) : [];
};

export const saveRuns = (key: string, entries: SimulateRunEntry[]): void => {
  try {
    localStorage.setItem(key, serializeRuns(entries));
  } catch {
    // 配额满/隐私模式：持久化失败静默——内存历史不受影响
  }
};
