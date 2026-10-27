import React, { useMemo } from 'react';

import { readRequestInputContract, writeRequestInputContract } from '../../../helpers/request-schema';
import { useT } from '../../../theming/i18n';
import { Button, Tooltip, Typography } from '../../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import { buildContractFixtures, listInputNodes } from './fixtures-run';
import type { ContractFixture, ExampleRunReport } from './fixtures-runner';

/** Run all 结果矩阵（ADR-013 §3）：行序 = 用例序，「调试」= 选中 + 打开 simulator 抽屉 */
const RunMatrix: React.FC<{
  report: ExampleRunReport;
  fixtures: ContractFixture[];
  onDebug: (index: number) => void;
  onPinExpectation: (index: number) => void;
  onClearExpectation: (index: number) => void;
}> = ({ report, fixtures, onDebug, onPinExpectation, onClearExpectation }) => {
  const t = useT();
  const totalMs = useMemo(() => report.results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0), [report]);

  return (
    <div className='min-h-0 flex-1 overflow-y-auto'>
      {report.results.map((result, index) => {
        const expectPinned = Boolean(fixtures[index]?.expect);
        const smokePassed = result.outcome === 'passed' && !expectPinned;

        return (
          <div
            key={`${result.name}-${index}`}
            className='flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-b-0'
            data-outcome={result.outcome}
          >
            <span
              className={`w-16 shrink-0 font-medium ${
                result.outcome === 'passed'
                  ? expectPinned
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-[var(--muted-foreground)]'
                  : result.outcome === 'assertion-failed'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-destructive'
              }`}
            >
              {result.outcome === 'passed'
                ? expectPinned
                  ? t('request.outcomePassed')
                  : t('request.outcomeSmokePassed')
                : result.outcome === 'assertion-failed'
                  ? t('request.outcomeAssertionFailed')
                  : t('request.outcomeExecutionError')}
            </span>
            <Typography.Text className='min-w-0 flex-1 truncate'>{result.name}</Typography.Text>
            {expectPinned && (
              <span className='shrink-0 rounded-sm bg-primary/10 px-1 text-[10px] text-primary'>
                {t('request.expectationPinned')}
              </span>
            )}
            {result.durationMs !== undefined && <span className='shrink-0 opacity-60'>{result.durationMs}ms</span>}
            {result.error && (
              <Tooltip title={result.error}>
                <span className='max-w-[240px] shrink-0 truncate text-destructive'>{result.error}</span>
              </Tooltip>
            )}
            {smokePassed && result.actual !== undefined && (
              <Tooltip title={t('request.pinAsExpectationHint')}>
                <Button type='link' size='small' className='!px-1' onClick={() => onPinExpectation(index)}>
                  {t('request.pinAsExpectation')}
                </Button>
              </Tooltip>
            )}
            {expectPinned && (
              <Button type='link' size='small' className='!px-1' onClick={() => onClearExpectation(index)}>
                {t('request.clearExpectation')}
              </Button>
            )}
            <Button type='link' size='small' className='!px-1' onClick={() => onDebug(index)}>
              {t('request.debugInSimulator')}
            </Button>
          </div>
        );
      })}
      <div
        className='sticky bottom-0 flex items-center gap-2 border-t border-border bg-[var(--seal-color-bg-container)] px-3 py-1.5 text-xs opacity-70'
        data-testid='fixtures-summary'
      >
        <span>
          {t('request.fixturesSummary', {
            total: report.passed + report.failed,
            passed: report.passed,
            failed: report.failed,
            ms: totalMs,
          })}
        </span>
      </div>
    </div>
  );
};

/**
 * Fixtures 面板（分屏范式 §1.2）：Run all 的图级执行面，与 simulator 对称。
 * 域约束：规则图至多一个 inputNode——面板直接作用于它，无绑定概念。
 * 执行经 fixturesRunner 槽位（宿主注入 = simulateHandler 适配），kernel 零引擎依赖。
 */
export const FixturesPanel: React.FC = () => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const { decisionGraph, panels, fixturesRunner, fixturesRun } = useDecisionGraphState(
    ({ decisionGraph, panels, fixturesRunner, fixturesRun }) => ({
      decisionGraph,
      panels,
      fixturesRunner,
      fixturesRun,
    }),
  );

  const inputNode = listInputNodes(decisionGraph)[0];
  const running = fixturesRun?.status === 'running';
  const hasExamples = Boolean(inputNode && buildContractFixtures(decisionGraph, inputNode.id));
  const fixtures = useMemo(
    () => (inputNode ? (buildContractFixtures(decisionGraph, inputNode.id) ?? []) : []),
    [decisionGraph, inputNode],
  );
  const expectationCount = fixtures.filter((fixture) => fixture.expect).length;

  // 捕获范式设期望：以当前 Run 的 actual 输出为 deep 期望写入契约（名字不齐=结果过期，拒绝落笔）
  const pinExpectation = (index: number) => {
    const result = fixturesRun?.status === 'done' ? fixturesRun.report?.results[index] : undefined;
    const fixture = fixtures[index];
    if (!inputNode || !result || !fixture || fixture.name !== result.name) {
      return;
    }

    graphActions.updateNode(inputNode.id, (draft) => {
      draft.content ??= {};
      const contentRecord = draft.content as Record<string, any>;
      const { contract: freshContract } = readRequestInputContract(contentRecord);
      writeRequestInputContract(contentRecord, {
        ...freshContract,
        examples: freshContract.examples.map((example, exampleIndex) =>
          exampleIndex === index
            ? { ...example, expectation: { mode: 'deep' as const, value: result.actual ?? null } }
            : example,
        ),
      });
      return draft;
    });
  };

  const clearExpectation = (index: number) => {
    if (!inputNode) {
      return;
    }

    graphActions.updateNode(inputNode.id, (draft) => {
      draft.content ??= {};
      const contentRecord = draft.content as Record<string, any>;
      const { contract: freshContract } = readRequestInputContract(contentRecord);
      writeRequestInputContract(contentRecord, {
        ...freshContract,
        examples: freshContract.examples.map((example, exampleIndex) => {
          if (exampleIndex !== index) {
            return example;
          }
          const { expectation: _expectation, ...rest } = example;
          return rest;
        }),
      });
      return draft;
    });
  };

  const debugFixture = (index: number) => {
    if (!inputNode) {
      return;
    }

    // 传选择不传状态：装载该示例到 simulator + 打开抽屉（完整 trace 在模拟器再跑获得）
    const fixtures = buildContractFixtures(decisionGraph, inputNode.id);
    const fixture = fixtures?.[index];
    if (!fixture) {
      return;
    }

    graphActions.setSimulatorRequest(JSON.stringify(fixture.input, null, 2));
    graphActions.setSimulatorExampleBinding({ nodeId: inputNode.id, sourceIndex: index, sourceName: fixture.name });
    const simulatorPanel = panels?.find((panel) => panel.id === 'simulator');
    if (simulatorPanel) {
      graphActions.setActivePanel(simulatorPanel.id);
    }
  };

  return (
    <div className='flex h-full flex-col overflow-hidden'>
      <div className='flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <Typography.Text strong className='truncate text-xs'>
            {inputNode?.name ?? t('request.fixturesNoInputNode')}
          </Typography.Text>
          {hasExamples && (
            <Tooltip title={t('request.expectationProgressHint')}>
              <span
                className='shrink-0 rounded-sm bg-primary/10 px-1 text-[10px] text-primary'
                data-testid='fixtures-expectation-count'
              >
                {t('request.expectationProgress', {
                  pinned: expectationCount,
                  total: fixtures.length,
                })}
              </span>
            </Tooltip>
          )}
          {fixturesRun?.status === 'done' && fixturesRun.report && (
            <Typography.Text className='text-xs opacity-70'>
              {t('request.runAllPassed')} {fixturesRun.report.passed} · {t('request.runAllFailedCount')}{' '}
              {fixturesRun.report.failed}
            </Typography.Text>
          )}
        </div>
        <Button
          type='primary'
          size='small'
          disabled={!fixturesRunner || running || !inputNode || !hasExamples}
          onClick={() => {
            void graphActions.runFixtures();
          }}
        >
          {running ? t('request.fixturesRunning') : t('request.runAll')}
        </Button>
      </div>

      {inputNode && !hasExamples && (
        <div className='p-3 text-xs text-[var(--muted-foreground)]'>{t('request.fixturesNoExamples')}</div>
      )}

      {fixturesRun?.status === 'error' && (
        <div className='mx-3 mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive'>
          {fixturesRun.error === 'no-examples'
            ? t('request.fixturesNoExamples')
            : fixturesRun.error === 'no-input-node'
              ? t('request.fixturesNoInputNode')
              : (fixturesRun.error ?? t('request.runAllFailed'))}
        </div>
      )}

      {fixturesRun?.status === 'done' && fixturesRun.report && (
        <RunMatrix
          report={fixturesRun.report}
          fixtures={fixtures}
          onDebug={debugFixture}
          onPinExpectation={pinExpectation}
          onClearExpectation={clearExpectation}
        />
      )}
    </div>
  );
};
