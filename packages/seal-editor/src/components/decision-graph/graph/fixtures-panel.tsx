import json5 from 'json5';
import React, { useMemo, useState } from 'react';

import { readRequestInputContract, writeRequestInputContract } from '../../../helpers/request-schema';
import { useT } from '../../../theming/i18n';
import { AutosizeTextArea } from '../../autosize-text-area';
import { Button, Input, Popover, Select, Tooltip, Typography } from '../../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import { buildContractFixtures, graphFingerprint, listInputNodes } from './fixtures-run';
import type { ContractFixture, ExampleRunReport } from './fixtures-runner';

type ExpectationDraft = NonNullable<ContractFixture['expect']>;

const expectationToText = (expect: ExpectationDraft): string => {
  if (expect.mode === 'expression') {
    return expect.source;
  }
  return JSON.stringify(expect.value ?? null, null, 2);
};

/** 期望编辑器（Popover 内容）：deep/path/expression 三模式；无效 JSON 不落笔 */
const ExpectationEditor: React.FC<{
  initial?: ExpectationDraft;
  pinned: boolean;
  onSave: (expect: ExpectationDraft) => void;
  onClear: () => void;
}> = ({ initial, pinned, onSave, onClear }) => {
  const t = useT();
  const [mode, setMode] = useState<'deep' | 'path' | 'expression'>(initial?.mode ?? 'deep');
  const [valueText, setValueText] = useState(() =>
    initial && initial.mode !== 'expression' ? expectationToText(initial) : 'null',
  );
  const [path, setPath] = useState(initial?.mode === 'path' ? initial.path : '');
  const [source, setSource] = useState(initial?.mode === 'expression' ? initial.source : '');
  const [error, setError] = useState<string | null>(null);

  const apply = () => {
    if (mode === 'expression') {
      if (!source.trim()) {
        setError(t('request.expectationInvalidSource'));
        return;
      }
      onSave({ mode: 'expression', source });
      return;
    }

    let value: unknown;
    try {
      value = json5.parse(valueText);
    } catch {
      setError(t('request.expectationInvalidJson'));
      return;
    }
    onSave(mode === 'path' ? { mode: 'path', path: path.trim(), value } : { mode: 'deep', value });
  };

  return (
    <div className='flex w-72 flex-col gap-2 p-1' data-testid='expectation-editor'>
      <div className='flex flex-col gap-1'>
        <Typography.Text className='text-[10px] opacity-70'>{t('request.expectationMode')}</Typography.Text>
        <Select
          size='small'
          value={mode}
          options={[
            { value: 'deep', label: t('request.expectationModeDeep') },
            { value: 'path', label: t('request.expectationModePath') },
            { value: 'expression', label: t('request.expectationModeExpression') },
          ]}
          onChange={(next) => {
            setMode(next as 'deep' | 'path' | 'expression');
            setError(null);
          }}
        />
      </div>
      {mode === 'path' && (
        <div className='flex flex-col gap-1'>
          <Typography.Text className='text-[10px] opacity-70'>{t('request.expectationPath')}</Typography.Text>
          <Input
            size='small'
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder='shippingFee'
          />
        </div>
      )}
      {mode !== 'expression' && (
        <div className='flex flex-col gap-1'>
          <Typography.Text className='text-[10px] opacity-70'>{t('request.expectationValue')}</Typography.Text>
          <AutosizeTextArea
            className='rounded-md border border-border px-2 py-1 font-mono text-xs'
            value={valueText}
            onChange={(event) => {
              setValueText(event.target.value);
              setError(null);
            }}
            maxRows={8}
            spellCheck={false}
          />
        </div>
      )}
      {mode === 'expression' && (
        <div className='flex flex-col gap-1'>
          <Typography.Text className='text-[10px] opacity-70'>{t('request.expectationSource')}</Typography.Text>
          <AutosizeTextArea
            className='rounded-md border border-border px-2 py-1 font-mono text-xs'
            value={source}
            onChange={(event) => {
              setSource(event.target.value);
              setError(null);
            }}
            placeholder='shippingFee >= 20 && shippingFee <= 60'
            maxRows={6}
            spellCheck={false}
          />
          <span className='text-[10px] opacity-60'>{t('request.expectationSourceHint')}</span>
        </div>
      )}
      {error && <span className='text-[10px] text-destructive'>{error}</span>}
      <div className='flex items-center justify-between'>
        {pinned ? (
          <Button type='link' size='small' className='!px-1 text-destructive!' onClick={onClear}>
            {t('request.expectationClear')}
          </Button>
        ) : (
          <span />
        )}
        <Button type='primary' size='small' onClick={apply}>
          {t('request.expectationApply')}
        </Button>
      </div>
    </div>
  );
};

/** Run all 结果矩阵（ADR-013 §3）：行序 = 用例序，「调试」= 选中 + 打开 simulator 抽屉 */
const RunMatrix: React.FC<{
  report: ExampleRunReport;
  fixtures: ContractFixture[];
  onDebug: (index: number) => void;
  onPinExpectation: (index: number) => void;
  onSetExpectation: (index: number, expect: ExpectationDraft | undefined) => void;
}> = ({ report, fixtures, onDebug, onPinExpectation, onSetExpectation }) => {
  const t = useT();
  const [diffIndex, setDiffIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const totalMs = useMemo(() => report.results.reduce((sum, r) => sum + (r.durationMs ?? 0), 0), [report]);

  return (
    <div className='min-h-0 flex-1 overflow-y-auto'>
      {report.results.map((result, index) => {
        const expect = fixtures[index]?.expect;
        const expectPinned = Boolean(expect);
        const smokePassed = result.outcome === 'passed' && !expectPinned;
        const assertionFailed = result.outcome === 'assertion-failed';
        const diffOpen = diffIndex === index;

        return (
          <React.Fragment key={`${result.name}-${index}`}>
            <div
              className='flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs last:border-b-0'
              data-outcome={result.outcome}
            >
              <span
                className={`w-20 shrink-0 font-medium ${
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
              {assertionFailed && expect && (
                <Button
                  type='link'
                  size='small'
                  className='!px-1'
                  onClick={() => setDiffIndex(diffOpen ? null : index)}
                >
                  {diffOpen ? t('request.hideDiff') : t('request.showDiff')}
                </Button>
              )}
              <Popover
                open={editingIndex === index}
                onOpenChange={(open) => setEditingIndex(open ? index : null)}
                content={
                  <ExpectationEditor
                    initial={expect}
                    pinned={expectPinned}
                    onSave={(next) => {
                      onSetExpectation(index, next);
                      setEditingIndex(null);
                    }}
                    onClear={() => {
                      onSetExpectation(index, undefined);
                      setEditingIndex(null);
                    }}
                  />
                }
              >
                <Button type='link' size='small' className='!px-1'>
                  {t('request.editExpectation')}
                </Button>
              </Popover>
              {smokePassed && result.actual !== undefined && (
                <Tooltip title={t('request.pinAsExpectationHint')}>
                  <Button type='link' size='small' className='!px-1' onClick={() => onPinExpectation(index)}>
                    {t('request.pinAsExpectation')}
                  </Button>
                </Tooltip>
              )}
              <Button type='link' size='small' className='!px-1' onClick={() => onDebug(index)}>
                {t('request.debugInSimulator')}
              </Button>
            </div>
            {/* B1 差异展开：期望（契约锚）vs 实际（本次运行）——外部状态 UDF 的值漂移在此显形 */}
            {diffOpen && assertionFailed && expect && expect.mode !== 'expression' && (
              <div
                className='flex flex-col gap-1 border-b border-border/60 bg-muted/40 px-3 py-2'
                data-testid='expectation-diff'
              >
                <pre className='max-h-40 overflow-auto rounded-md bg-destructive/10 p-2 font-mono text-[10px] leading-relaxed'>
                  {`− ${t('request.diffExpected')}${expect.mode === 'path' ? ` @${expect.path}` : ''}\n${expectationToText(expect)}`}
                </pre>
                <pre className='max-h-40 overflow-auto rounded-md bg-success/10 p-2 font-mono text-[10px] leading-relaxed'>
                  {`+ ${t('request.diffActual')}\n${JSON.stringify(result.actual ?? null, null, 2)}`}
                </pre>
              </div>
            )}
            {diffOpen && assertionFailed && expect?.mode === 'expression' && (
              <div
                className='border-b border-border/60 bg-muted/40 px-3 py-2 text-[10px]'
                data-testid='expectation-diff'
              >
                <span className='opacity-70'>{t('request.expectationSource')}: </span>
                <code className='font-mono'>{expect.source}</code>
                <span className='ml-2 opacity-70'>→ {t('request.expectationExpressionFalse')}</span>
              </div>
            )}
          </React.Fragment>
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
  // 深链/调试装载状态过期检查器：图在本次运行后已编辑 → 报告复现的是运行时点状态
  const staleRun = useMemo(() => {
    if (fixturesRun?.status !== 'done' || !fixturesRun.graphFingerprint) {
      return false;
    }
    return graphFingerprint(decisionGraph) !== fixturesRun.graphFingerprint;
  }, [fixturesRun, decisionGraph]);

  // 期望写路径（单漏斗）：pin（deep=本次 actual 快捷）与编辑器三模式共用
  const setExpectationAt = (index: number, expect: ExpectationDraft | undefined) => {
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
          if (!expect) {
            const { expectation: _expectation, ...rest } = example;
            return rest;
          }
          return { ...example, expectation: expect };
        }),
      });
      return draft;
    });
  };

  const pinExpectation = (index: number) => {
    const result = fixturesRun?.status === 'done' ? fixturesRun.report?.results[index] : undefined;
    const fixture = fixtures[index];
    if (!result || !fixture || fixture.name !== result.name) {
      return;
    }

    setExpectationAt(index, { mode: 'deep', value: result.actual ?? null });
  };

  const debugFixture = (index: number) => {
    if (!inputNode) {
      return;
    }

    // 传选择不传状态：装载该示例到 simulator + 打开抽屉（完整 trace 在模拟器再跑获得）
    const fixtureList = buildContractFixtures(decisionGraph, inputNode.id);
    const fixture = fixtureList?.[index];
    if (!fixture) {
      return;
    }

    graphActions.setSimulatorRequest(JSON.stringify(fixture.input, null, 2));
    graphActions.setSimulatorExampleBinding({ nodeId: inputNode.id, exampleId: fixture.id, sourceName: fixture.name });
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

      {staleRun && fixturesRun?.status === 'done' && (
        <div
          className='mx-3 mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400'
          data-testid='fixtures-stale-run'
        >
          {t('request.fixturesStaleRun')}
        </div>
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
          onSetExpectation={setExpectationAt}
        />
      )}
    </div>
  );
};
