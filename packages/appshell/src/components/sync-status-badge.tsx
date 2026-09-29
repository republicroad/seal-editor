import React from 'react';

import type { AutoPersistState } from '../shell/auto-persist';
import { Button } from './ui/button';

export type SyncStatusBadgeProps = {
  /** useAutoPersist 的状态面——D 模式下只有同步态，无 dirty 概念 */
  state: AutoPersistState;
  /** error 态的重试入口（controller.flush） */
  onRetry?: () => void;
  className?: string;
};

const formatTime = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
};

/**
 * 模式 D 同步状态徽标（docs/design/appshell-auto-persist.md §2.2）：Saving…/Saved/Conflict。
 * 纯 props 组件；SkinnedDecisionGraph 在 autoPersist 接线且宿主未提供 right 槽时自动注入。
 * conflict 的三选 UX 归宿主（契约：save-persistence-contract.md §3）——徽标仅示警。
 */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ state, onRetry, className }) => {
  const base = 'inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap';
  switch (state.status) {
    case 'saving':
      return (
        <span className={`${base} ${className ?? ''}`} role='status' data-sync-status='saving'>
          Saving…
        </span>
      );
    case 'saved':
      return (
        <span className={`${base} ${className ?? ''}`} role='status' data-sync-status='saved' title={state.lastSavedAt}>
          Saved {state.lastSavedAt ? formatTime(state.lastSavedAt) : ''}
        </span>
      );
    case 'conflict':
      return (
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium text-[var(--seal-color-warning)] whitespace-nowrap ${className ?? ''}`}
          role='alert'
          data-sync-status='conflict'
        >
          Conflict
        </span>
      );
    case 'error':
      return (
        <span className={`inline-flex items-center gap-1 ${className ?? ''}`} role='alert' data-sync-status='error'>
          <span className='text-xs font-medium text-destructive whitespace-nowrap'>
            Sync failed{state.lastError ? ` (${state.lastError.code})` : ''}
          </span>
          {onRetry && (
            <Button variant='ghost' size='sm' className='h-auto px-1 py-0 text-xs' onClick={onRetry}>
              Retry
            </Button>
          )}
        </span>
      );
    case 'pending':
    case 'idle':
    default:
      // 防抖窗口内的待存变更与初始态保持静默（业界惯例：不打扰连续编辑）
      return null;
  }
};
