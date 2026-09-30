import React from 'react';

import { Button } from '../ui/button';

export type ValidationSeverity = 'error' | 'warning' | 'info';

/** 集中验证条目（治理窗批次 4）：nodeId 有值 = 面板可点击跳转对应节点 */
export type ValidationEntry = {
  nodeId?: string;
  severity: ValidationSeverity;
  message: string;
  /** 校验器自定义码（如 MISSING_INPUT / INVALID_EXPRESSION） */
  code?: string;
};

const SEVERITY_ORDER: Record<ValidationSeverity, number> = { error: 0, warning: 1, info: 2 };

const SEVERITY_LABEL: Record<ValidationSeverity, string> = { error: '错误', warning: '警告', info: '提示' };

const SEVERITY_CLASS: Record<ValidationSeverity, string> = {
  error: 'text-destructive',
  warning: 'text-[var(--seal-color-warning)]',
  info: 'text-[var(--muted-foreground)]',
};

/**
 * 集中验证面板（治理窗批次 4，docs/design/development-roadmap.md §0.5 批次一）：
 * 全图校验错误集中列表，点击跳转对应节点（经 graphRef.goToNode，宿主接线）。
 * 无状态：entries 由宿主校验通道供给（内核无内置图校验器——demo-server
 * /v1/validate 或宿主自备校验器，防抖随图刷新由宿主编排）。
 */
export const ValidationPanel: React.FC<{
  entries: ValidationEntry[];
  /** 校验通道进行中（防抖/请求未归）——列表上方细提示 */
  running?: boolean;
  /** 传入则 nodeId 命中的行可点击跳转 */
  onJump?: (nodeId: string) => void;
  className?: string;
}> = ({ entries, running, onJump, className }) => {
  const sorted = [...entries].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const errors = entries.filter((e) => e.severity === 'error').length;
  const warnings = entries.filter((e) => e.severity === 'warning').length;

  return (
    <div className={`flex flex-col gap-1.5 p-3 text-xs ${className ?? ''}`}>
      <div className='flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]'>
        {entries.length === 0 ? (
          <span data-testid='validation-pass'>✓ 校验通过，未发现问题</span>
        ) : (
          <span data-testid='validation-count'>
            {errors > 0 && `${errors} 错误`}
            {errors > 0 && warnings > 0 && ' · '}
            {warnings > 0 && `${warnings} 警告`}
            {errors === 0 && warnings === 0 && `${entries.length} 提示`}
          </span>
        )}
        {running && <span>校验中…</span>}
      </div>
      {sorted.map((entry, i) => (
        <div
          key={`${entry.nodeId ?? 'global'}-${i}`}
          className='flex items-start justify-between gap-2 rounded-md border border-[var(--border)] p-2'
          data-severity={entry.severity}
        >
          <div className='flex min-w-0 flex-col gap-0.5'>
            <div className='flex items-center gap-1.5'>
              <span className={`font-medium ${SEVERITY_CLASS[entry.severity]}`}>{SEVERITY_LABEL[entry.severity]}</span>
              {entry.code && <code className='text-[10px] text-[var(--muted-foreground)]'>{entry.code}</code>}
            </div>
            <p className='break-words text-[11px]'>{entry.message}</p>
          </div>
          {onJump && entry.nodeId && (
            <Button variant='outline' size='sm' className='shrink-0' onClick={() => onJump(entry.nodeId!)}>
              跳转
            </Button>
          )}
        </div>
      ))}
    </div>
  );
};
