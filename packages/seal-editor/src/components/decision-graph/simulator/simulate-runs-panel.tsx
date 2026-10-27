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
import { PinIcon, PinOffIcon } from 'lucide-react';
import React, { Suspense, lazy, useState } from 'react';

import { useT } from '../../../theming/i18n';
import { Button } from '../../primitives';
import { useDecisionGraphActions } from '../context/dg-store.context';
import type { SimulateRunEntry } from '../context/dg-store.context';
import type { Simulation } from './simulation.types';

/** code-block 渲染的 run 详情留在动态 chunk（shiki 随行），fallback = 裸 pre。 */
const SimulateRunDetail = lazy(() => import('./simulate-run-detail').then((m) => ({ default: m.SimulateRunDetail })));
/** 运行对比详情（路径 diff + 输出对照）同走懒加载（editor/shiki 树不进主包）。 */
const SimulateRunCompare = lazy(() =>
  import('./simulate-run-compare').then((m) => ({ default: m.SimulateRunCompare })),
);

/**
 * Run 历史时间线（批 3 + 批 16 持久化 + 批 A1 展示升级 + code-block 渲染 + 运行对比）：
 * 新运行在头部，outcome 徽章 + 耗时；点行展开该次的输出/错误 JSON
 * （高亮 + 折叠 + copy，chunk 就绪前以裸 pre 兜底）；行内 pin 切换——
 * 置顶条目豁免环形淘汰且载荷持久化保留，未置顶条目刷新后仅剩元数据行
 * （payloadEvicted 提示，重跑可回看）。
 * 运行对比（六铁律「运行可对比」）：行悬停出 A/B 标记（基准/对比，载荷在库才可选），
 * 双选后时间线顶部展开路径 diff + 输出对照。
 */
export const SimulateRunsPanel: React.FC<{
  runs: SimulateRunEntry[];
  emptyHint?: string;
}> = ({ runs, emptyHint }) => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [compareId, setCompareId] = useState<string | null>(null);

  const baseRun = runs.find((run) => run.id === baseId && run.snapshot);
  const compareRun = runs.find((run) => run.id === compareId && run.snapshot);
  const compareActive = Boolean(baseRun && compareRun);
  const compareLabel = (id: string | null) => {
    const run = runs.find((entry) => entry.id === id);
    return run ? new Date(run.ts).toLocaleTimeString('en-GB') : '—';
  };

  if (runs.length === 0) {
    return <div className='p-6 text-center text-xs opacity-50'>{emptyHint ?? t('dg.simulation.runsEmpty')}</div>;
  }

  return (
    <div className='flex min-h-0 flex-col'>
      {compareActive && baseRun && compareRun && (
        <div className='shrink-0 border-b border-border/60 p-3'>
          <div className='mb-2 flex items-center gap-2'>
            <span className='text-xs font-medium'>
              {t('dg.simulation.compareTitle')} · {compareLabel(baseRun.id)} → {compareLabel(compareRun.id)}
            </span>
            <Button
              type='link'
              size='small'
              className='!px-1'
              onClick={() => {
                setBaseId(null);
                setCompareId(null);
              }}
            >
              {t('dg.simulation.compareClear')}
            </Button>
          </div>
          <Suspense fallback={<div className='rounded-md bg-muted/60 p-2 text-[10px] opacity-70'>…</div>}>
            <SimulateRunCompare
              base={baseRun.snapshot as Simulation}
              compare={compareRun.snapshot as Simulation}
              baseLabel={compareLabel(baseRun.id)}
              compareLabel={compareLabel(compareRun.id)}
            />
          </Suspense>
        </div>
      )}
      <Timeline className='min-h-0 flex-1 p-3'>
        {runs.map((run, index) => {
          const expanded = expandedId === run.id;
          const evicted = !run.snapshot;
          const isBase = baseId === run.id;
          const isCompare = compareId === run.id;
          const detail = evicted
            ? null
            : run.ok
              ? run.snapshot?.result?.result
              : (run.snapshot?.error ?? 'unknown error');
          return (
            <TimelineItem key={run.id} step={runs.length - index}>
              <TimelineSeparator />
              <TimelineIndicator
                className={`flex items-center justify-center text-[8px] font-bold ${
                  isBase
                    ? 'border-destructive bg-[var(--destructive)] text-white'
                    : isCompare
                      ? 'border-success bg-[var(--color-success)] text-white'
                      : run.ok
                        ? 'bg-[var(--color-success)] text-white'
                        : 'bg-[var(--destructive)] text-white'
                }`}
              >
                {isBase ? 'A' : isCompare ? 'B' : undefined}
              </TimelineIndicator>
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
                    <span className='ml-auto flex shrink-0 items-center gap-1'>
                      <button
                        type='button'
                        data-testid={`simulate-run-mark-base${isBase ? '-active' : ''}`}
                        title={t('dg.simulation.compareBase')}
                        className={`rounded-sm px-1 text-[10px] font-medium transition-opacity ${
                          isBase
                            ? 'bg-destructive/15 text-destructive opacity-100'
                            : 'opacity-0 group-hover/row:opacity-60 hover:!opacity-100'
                        } ${evicted ? 'pointer-events-none opacity-0!' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setBaseId(isBase ? null : run.id);
                        }}
                      >
                        A
                      </button>
                      <button
                        type='button'
                        data-testid={`simulate-run-mark-compare${isCompare ? '-active' : ''}`}
                        title={t('dg.simulation.compareAgainst')}
                        className={`rounded-sm px-1 text-[10px] font-medium transition-opacity ${
                          isCompare
                            ? 'bg-success/15 text-success opacity-100'
                            : 'opacity-0 group-hover/row:opacity-60 hover:!opacity-100'
                        } ${evicted ? 'pointer-events-none opacity-0!' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setCompareId(isCompare ? null : run.id);
                        }}
                      >
                        B
                      </button>
                      <button
                        type='button'
                        data-testid='simulate-run-pin'
                        aria-label={run.pinned ? t('dg.simulation.unpin') : t('dg.simulation.pin')}
                        className={`shrink-0 transition-opacity ${
                          run.pinned ? 'opacity-80' : 'opacity-0 group-hover/row:opacity-60 hover:!opacity-100'
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          graphActions.setSimulateRunPinned(run.id, !run.pinned);
                        }}
                      >
                        {run.pinned ? <PinIcon className='size-3' /> : <PinOffIcon className='size-3' />}
                      </button>
                    </span>
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
                    <Suspense
                      fallback={
                        <pre
                          data-testid='simulate-run-detail'
                          className='max-h-64 overflow-auto rounded-md bg-muted/60 p-2 pr-8 font-mono text-[10px] leading-relaxed'
                        >
                          {json5.stringify(detail, undefined, 2)}
                        </pre>
                      }
                    >
                      <SimulateRunDetail detail={detail} />
                    </Suspense>
                  )}
                </TimelineContent>
              )}
            </TimelineItem>
          );
        })}
      </Timeline>
    </div>
  );
};
