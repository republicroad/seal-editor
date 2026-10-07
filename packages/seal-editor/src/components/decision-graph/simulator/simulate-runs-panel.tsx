import { Badge } from '#reui/badge';
import {
  Timeline,
  TimelineContent,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '#reui/timeline';
import json5 from 'json5';
import { CopyIcon, PinIcon, PinOffIcon } from 'lucide-react';
import React, { useState } from 'react';

import { useT } from '../../../theming/i18n';
import { useDecisionGraphActions } from '../context/dg-store.context';
import type { SimulateRunEntry } from '../context/dg-store.context';

/**
 * Run 历史时间线（批 3 + 批 16 持久化 + 批 A1 展示升级）：
 * 新运行在头部，outcome 徽章 + 耗时；点行展开该次的输出/错误 JSON
 * （copy 按钮 + snapshot 回看，不重跑）；行内 pin 切换——
 * 置顶条目豁免环形淘汰且载荷持久化保留，未置顶条目刷新后仅剩元数据行
 * （payloadEvicted 提示，重跑可回看）。
 */
export const SimulateRunsPanel: React.FC<{
  runs: SimulateRunEntry[];
  emptyHint?: string;
}> = ({ runs, emptyHint }) => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyDetail = (run: SimulateRunEntry) => {
    const evicted = !run.snapshot;
    const detail = evicted ? null : run.ok ? run.snapshot?.result?.result : (run.snapshot?.error ?? 'unknown error');
    const text = json5.stringify(detail, undefined, 2);
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedId(run.id);
      setTimeout(() => setCopiedId((cur) => (cur === run.id ? null : cur)), 1500);
    });
  };

  if (runs.length === 0) {
    return <div className='p-6 text-center text-xs opacity-50'>{emptyHint ?? t('dg.simulation.runsEmpty')}</div>;
  }

  return (
    <Timeline className='p-3'>
      {runs.map((run, index) => {
        const expanded = expandedId === run.id;
        const evicted = !run.snapshot;
        const detail = evicted
          ? null
          : run.ok
            ? run.snapshot?.result?.result
            : (run.snapshot?.error ?? 'unknown error');
        return (
          <TimelineItem key={run.id} step={runs.length - index}>
            <TimelineSeparator />
            <TimelineIndicator
              className={run.ok ? 'bg-[var(--color-success)] text-white' : 'bg-[var(--destructive)] text-white'}
            />
            <TimelineHeader>
              <TimelineTitle className='text-xs font-normal'>
                <button
                  type='button'
                  data-testid='simulate-run-row'
                  className='group/row flex w-full items-center gap-2 text-left'
                  onClick={() => setExpandedId(expanded ? null : run.id)}
                >
                  <span className='font-mono opacity-70'>{new Date(run.ts).toLocaleTimeString('en-GB')}</span>
                  <Badge
                    size='xs'
                    variant={run.ok ? 'outline' : 'destructive'}
                    className={run.ok ? 'border-success/40 text-success' : undefined}
                  >
                    {run.ok ? 'OK' : 'ERR'}
                  </Badge>
                  {run.performance && <span className='font-mono text-[10px] opacity-60'>{run.performance}</span>}
                  {run.error && <span className='truncate text-[10px] text-destructive'>{run.error}</span>}
                  <button
                    type='button'
                    data-testid='simulate-run-pin'
                    aria-label={run.pinned ? t('dg.simulation.unpin') : t('dg.simulation.pin')}
                    className={`ml-auto shrink-0 transition-opacity ${
                      run.pinned ? 'opacity-80' : 'opacity-0 group-hover/row:opacity-60 hover:!opacity-100'
                    }`}
                    onClick={(event) => {
                      event.stopPropagation();
                      graphActions.setSimulateRunPinned(run.id, !run.pinned);
                    }}
                  >
                    {run.pinned ? <PinIcon className='size-3' /> : <PinOffIcon className='size-3' />}
                  </button>
                </button>
              </TimelineTitle>
            </TimelineHeader>
            {expanded && (
              <TimelineContent className='mt-1'>
                {evicted && (
                  <div className='rounded-md bg-muted/60 p-2 text-[10px] opacity-70'>
                    {t('dg.simulation.payloadEvicted')}
                  </div>
                )}
                {!evicted && (
                  <div className='relative'>
                    <pre
                      data-testid='simulate-run-detail'
                      className='max-h-64 overflow-auto rounded-md bg-muted/60 p-2 pr-8 font-mono text-[10px] leading-relaxed'
                    >
                      {json5.stringify(detail, undefined, 2)}
                    </pre>
                    <button
                      type='button'
                      data-testid='simulate-run-copy'
                      aria-label={t('dg.simulation.copy')}
                      className='absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-60 transition-colors hover:bg-background hover:text-foreground hover:opacity-100'
                      onClick={() => copyDetail(run)}
                    >
                      {copiedId === run.id ? (
                        <span className='text-[10px] text-success'>✓</span>
                      ) : (
                        <CopyIcon className='size-3' />
                      )}
                    </button>
                  </div>
                )}
              </TimelineContent>
            )}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
};
