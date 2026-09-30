import React from 'react';

import type { AutoPersistEvent } from '../../shell/auto-persist';
import { Badge } from '../ui/badge';

/**
 * 设计时变更日志（治理窗批次 4）：谁/何时/发生了什么的设计期审计面。
 *
 * 数据流（存储归宿主的分工裁定）：auto-persist onEvent + migrateGraph 报告 +
 * CONFLICT 裁决 → 宿主聚合成 ChangeLogEntry（可持久化到 GraphRecord.extensions
 * 或宿主自有存储）→ 本面板纯展示。
 */

export type ChangeLogKind = 'save' | 'conflict' | 'conflict-resolved' | 'migration' | 'restore' | 'error';

export type ChangeLogEntry = {
  /** ISO 时间戳 */
  at: string;
  kind: ChangeLogKind;
  message: string;
  /** 附属明细（revision / micros / 迁移说明等） */
  detail?: string;
};

const KIND_LABEL: Record<ChangeLogKind, string> = {
  'save': '保存',
  'conflict': '冲突',
  'conflict-resolved': '冲突裁决',
  'migration': '迁移',
  'restore': '恢复',
  'error': '错误',
};

const KIND_CLASS: Record<ChangeLogKind, string> = {
  'save': '',
  'conflict': 'text-[var(--seal-color-warning)]',
  'conflict-resolved': 'text-[var(--seal-color-warning)]',
  'migration': 'text-[var(--seal-color-info)]',
  'restore': 'text-[var(--seal-color-info)]',
  'error': 'text-destructive',
};

/** auto-persist 事件 → 变更日志条目（retry 高频且低价值，不记录） */
export const changeLogEntryFromPersistEvent = (
  event: AutoPersistEvent,
  at = new Date().toISOString(),
): ChangeLogEntry | null => {
  switch (event.type) {
    case 'saved':
      return {
        at,
        kind: 'save',
        message: `已保存（r ${event.revision}）`,
        detail: event.versionName ?? `${event.micros}µs`,
      };
    case 'conflict':
      return {
        at,
        kind: 'conflict',
        message: '保存冲突：head 已被其他编辑者推进',
        detail: event.localBaseRevision ? `base ${event.localBaseRevision}` : undefined,
      };
    case 'error':
      return { at, kind: 'error', message: event.message, detail: event.code };
    default:
      return null;
  }
};

export const ChangeLogPanel: React.FC<{
  entries: ChangeLogEntry[];
  /** 最新在上（缺省按 at 降序稳定排序） */
  className?: string;
}> = ({ entries, className }) => {
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return (
    <div className={`flex flex-col gap-1.5 p-3 text-xs ${className ?? ''}`}>
      {sorted.length === 0 && (
        <p className='text-[11px] text-[var(--muted-foreground)]' data-testid='change-log-empty'>
          暂无变更记录
        </p>
      )}
      {sorted.map((entry, i) => (
        <div
          key={`${entry.at}-${i}`}
          className='flex items-start justify-between gap-2 rounded-md border border-[var(--border)] p-2'
          data-kind={entry.kind}
        >
          <div className='flex min-w-0 flex-col gap-0.5'>
            <div className='flex items-center gap-1.5'>
              <Badge variant='secondary' className={`text-[9px] ${KIND_CLASS[entry.kind]}`}>
                {KIND_LABEL[entry.kind]}
              </Badge>
              <span className='truncate'>{entry.message}</span>
            </div>
            {entry.detail && <span className='text-[10px] text-[var(--muted-foreground)]'>{entry.detail}</span>}
          </div>
          <time className='shrink-0 text-[10px] text-[var(--muted-foreground)]'>
            {new Date(entry.at).toLocaleTimeString()}
          </time>
        </div>
      ))}
    </div>
  );
};
