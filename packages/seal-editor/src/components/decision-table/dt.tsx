import React, { useEffect, useMemo, useRef, useState } from 'react';

import type { InstantEvalStatus } from '../../helpers/dt-instant-eval';
import { findTableCellDollarNavigation } from '../../helpers/zen-dollar-hints';
import { DictionaryProvider } from '../../theme';
import { useT } from '../../theming/i18n';
import { SafeBoundary } from '../safe-boundary';
import { DecisionTableDialogProvider } from './context/dt-dialog.context';
import type { DecisionTableContextProps } from './context/dt-store.context';
import { DecisionTableProvider, useDecisionTableState } from './context/dt-store.context';
import { DecisionTableDialogs } from './dialog/dt-dialogs';
import { DecisionTableCommandBar } from './dt-command-bar';
import type { DecisionTableEmptyType } from './dt-empty';
import { DecisionTableEmpty } from './dt-empty';
import type { TableScrollApi } from './table/table';
import { Table } from './table/table';

export type { TableScrollApi } from './table/table';

export type DecisionTableRunHitStat = { name: string; count: number };

export type DecisionTableProps = {
  id?: string;
  tableHeight: string | number;
  mountDialogsOnBody?: boolean;
  scrollContainerRef?: React.MutableRefObject<HTMLDivElement | null>;
  scrollApiRef?: React.MutableRefObject<TableScrollApi | null>;
  /** D2：Run all 后的条件列命中统计（图级 Run all 注入；standalone 传入亦可） */
  runHitStats?: { entries: { name: string; count: number }[]; total: number } | undefined;
  /** A1 死行检测：Run all 后从未被命中的行 id（图级 Run all 注入） */
  deadRowIds?: string[] | undefined;
  /** A3 即时求值状态面（图级 dt 页签注入；suspended/degraded 时显示提示条） */
  instantEvalStatus?: InstantEvalStatus;
} & DecisionTableContextProps &
  DecisionTableEmptyType;

export const DecisionTable: React.FC<DecisionTableProps> = ({
  id,
  tableHeight,
  mountDialogsOnBody = false,
  scrollContainerRef,
  scrollApiRef,
  runHitStats,
  deadRowIds,
  instantEvalStatus,
  ...props
}) => {
  const [_, setMounted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getContainer = () => ref.current as HTMLElement;

  return (
    <SafeBoundary>
      <div
        ref={ref}
        className='text-sm h-full flex min-h-px flex-col pr-1 [--table-color:var(--background)]'
        style={{ background: 'var(--card)' }}
      >
        {ref.current && (
          <DecisionTableProvider>
            <DecisionTableDialogProvider getContainer={mountDialogsOnBody ? undefined : getContainer}>
              <DecisionTableCommandBar />
              <RunHitStatsStrip runHitStats={runHitStats} deadRowIds={deadRowIds} />
              <InstantEvalStrip status={instantEvalStatus} />
              <DollarNavNotice />
              <DictionaryBridge>
                <Table
                  id={id}
                  maxHeight={tableHeight}
                  scrollContainerRef={scrollContainerRef}
                  scrollApiRef={scrollApiRef}
                  deadRowIds={deadRowIds}
                />
              </DictionaryBridge>
              <DecisionTableDialogs />
              <DecisionTableEmpty {...props} />
            </DecisionTableDialogProvider>
          </DecisionTableProvider>
        )}
      </div>
    </SafeBoundary>
  );
};

/** D2 统计条：Run all 后的条件列命中计数（entries 由 TabDecisionTable 从 fixturesRun 聚合）。
 *  A1 死行计数随条显示（deadRowIds 非空时追加「死行」段）。 */
const RunHitStatsStrip: React.FC<{
  runHitStats?: DecisionTableProps['runHitStats'];
  deadRowIds?: string[] | undefined;
}> = ({ runHitStats, deadRowIds }) => {
  const t = useT();
  if (!runHitStats || runHitStats.entries.length === 0) {
    return null;
  }
  const entries = runHitStats.entries.map((entry) => `${entry.name}: ${entry.count}/${runHitStats.total}`);
  const deadCount = deadRowIds?.length ?? 0;
  return (
    <div
      role='status'
      data-testid='run-hit-stats'
      className='flex items-center gap-2 border-b border-border bg-[var(--seal-color-info-bg)] px-3 py-1.5 text-xs text-[color:var(--seal-color-info-text)]'
    >
      <span className='shrink-0 font-medium'>{t('dt.runHitStats')}</span>
      <span className='truncate'>{entries.join(' · ')}</span>
      {deadCount > 0 && (
        <span
          data-testid='dead-row-count'
          className='ml-auto shrink-0 font-medium text-[color:var(--seal-color-warning-text)]'
          title={t('dt.deadRow')}
        >
          {t('dt.deadRows')}: {deadCount}
        </span>
      )}
    </div>
  );
};

/** A3 即时求值状态条：挂起/降级时解释徽章为何静止（active/idle 不占视觉） */
const InstantEvalStrip: React.FC<{ status?: InstantEvalStatus }> = ({ status }) => {
  const t = useT();
  if (!status || status === 'active') {
    return null;
  }
  return (
    <div
      role='status'
      data-testid='instant-eval-strip'
      className='flex items-center gap-2 border-b border-border bg-[var(--seal-color-warning-bg)] px-3 py-1.5 text-xs text-[color:var(--seal-color-warning-text)]'
    >
      <span className='truncate'>{t(`dt.instantEval.${status}`)}</span>
    </div>
  );
};

/** C2 提示条：全表达式列（无 field）单元含 `$.` 导航 → 引擎恒不命中（zen-reference §1.5）。 */
const DollarNavNotice: React.FC = () => {
  const t = useT();
  const decisionTable = useDecisionTableState(({ decisionTable }) => decisionTable);
  const hitCount = useMemo(() => findTableCellDollarNavigation(decisionTable).length, [decisionTable]);
  if (hitCount === 0) {
    return null;
  }
  return (
    <div
      role='status'
      className='px-3 py-1.5 text-xs leading-snug bg-[var(--seal-color-warning-bg)] text-[color:var(--seal-color-warning-text)]'
    >
      {t('dollar.tableNav', { count: hitCount })}
    </div>
  );
};

const DictionaryBridge: React.FC<React.PropsWithChildren> = ({ children }) => {
  const dictionaries = useDecisionTableState((s) => s.dictionaries) ?? {};
  return <DictionaryProvider value={dictionaries}>{children}</DictionaryProvider>;
};
