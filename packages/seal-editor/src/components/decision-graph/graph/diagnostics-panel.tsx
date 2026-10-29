import { CloseOutlined } from '#icons';
import { Panel } from '@xyflow/react';
import React from 'react';

import { useT } from '../../../theming/i18n';
import { Button } from '../../primitives';
import {
  selectDiagnostics,
  useDecisionGraphActions,
  useDecisionGraphRaw,
  useDecisionGraphState,
} from '../context/dg-store.context';
import { type ValidationEntry, type ValidationSeverity, computeBuiltinDiagnostics } from '../graph-diagnostics';

const DIAGNOSTICS_DEBOUNCE_MS = 250;

/**
 * P0-2 内置校验器驱动：图变更 250ms 防抖重算（验收口径 ≤300ms）。
 * 无 UI——只维护 store 的 builtinDiagnostics 切片；宿主条目经 dg-empty
 * 的 diagnostics prop 直写 hostDiagnostics，合并视图由 selectDiagnostics 给出。
 */
export const DiagnosticsController: React.FC = () => {
  const decisionGraph = useDecisionGraphState(({ decisionGraph }) => decisionGraph);
  const { stateStore } = useDecisionGraphRaw();

  React.useEffect(() => {
    const timer = setTimeout(() => {
      stateStore.setState({ builtinDiagnostics: computeBuiltinDiagnostics(decisionGraph) });
    }, DIAGNOSTICS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [decisionGraph, stateStore]);

  return null;
};

const SEVERITY_DOT: Record<ValidationSeverity, string> = {
  error: 'bg-[var(--seal-color-error)]',
  warning: 'bg-[var(--seal-color-warning)]',
  info: 'bg-[var(--muted-foreground)]',
};

/**
 * P0-2 诊断面板：停靠画布右下（与右上 NodeInspector 同族样式），行点击
 * 选中 + 视口定位该节点（triggerNodeSelect only + goToNode，不切页签——
 * 画布内定位高亮是验收语义）。挂载开关在左侧工具条（错误计数徽标）。
 */
export const DiagnosticsPanel: React.FC = () => {
  const t = useT();
  const open = useDecisionGraphState((s) => s.diagnosticsOpen);
  const entries = useDecisionGraphState(selectDiagnostics);
  const nodeNames = useDecisionGraphState(({ decisionGraph }) =>
    (decisionGraph?.nodes ?? []).map((node) => ({ id: node.id, name: node.name })),
  );
  const { goToNode, setDiagnosticsOpen, triggerNodeSelect } = useDecisionGraphActions();

  const codeMessages: Record<string, string> = {
    MISSING_INPUT: t('dg.diagnostics.MISSING_INPUT'),
    EMPTY_EXPRESSION: t('dg.diagnostics.EMPTY_EXPRESSION'),
    EMPTY_RULES: t('dg.diagnostics.EMPTY_RULES'),
  };

  if (!open) {
    return null;
  }

  const nameById = new Map(nodeNames.map((node) => [node.id, node.name]));
  const errors = entries.filter((entry) => entry.severity === 'error').length;

  const jump = (nodeId: string) => {
    triggerNodeSelect(nodeId, 'only');
    goToNode(nodeId);
  };

  return (
    <Panel position='bottom-right' style={{ margin: 10, maxWidth: 380, width: 'max-content' }}>
      <div
        className='nodrag nopan flex max-h-[45vh] w-80 flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--seal-color-bg-container)] shadow-md'
        data-slot='diagnostics-panel'
        data-testid='diagnostics-panel'
      >
        <div className='flex items-center gap-2 border-b border-b-[var(--border)] p-2'>
          <span className='flex-1 text-xs font-medium'>{t('dg.diagnostics.title')}</span>
          {entries.length > 0 && (
            <span className='text-[10px] text-[var(--muted-foreground)]' data-testid='diagnostics-count'>
              {errors > 0
                ? `${errors} ${t('dg.diagnostics.errors')}`
                : `${entries.length} ${t('dg.diagnostics.entries')}`}
            </span>
          )}
          <Button
            type='text'
            size='small'
            className='h-6 w-6 p-0'
            aria-label={t('dg.diagnostics.close')}
            icon={<CloseOutlined style={{ fontSize: 10 }} />}
            onClick={() => setDiagnosticsOpen(false)}
          />
        </div>
        <div className='flex flex-col gap-1 overflow-y-auto p-2'>
          {entries.length === 0 ? (
            <span className='p-1 text-[11px] text-[var(--muted-foreground)]' data-testid='diagnostics-pass'>
              {t('dg.diagnostics.pass')}
            </span>
          ) : (
            entries.map((entry: ValidationEntry, i) => {
              const message = (entry.code && codeMessages[entry.code]) || entry.message;
              const nodeName = entry.nodeId ? nameById.get(entry.nodeId) : undefined;
              return (
                <button
                  key={`${entry.nodeId ?? 'global'}-${i}`}
                  type='button'
                  className='flex items-start gap-2 rounded-md border border-[var(--border)] p-2 text-left hover:bg-[var(--seal-color-bg-hover,rgba(0,0,0,0.04))]'
                  data-severity={entry.severity}
                  onClick={entry.nodeId ? () => jump(entry.nodeId!) : undefined}
                  disabled={!entry.nodeId}
                >
                  <span className={`mt-1 size-1.5 shrink-0 rounded-full ${SEVERITY_DOT[entry.severity]}`} />
                  <span className='flex min-w-0 flex-col gap-0.5'>
                    <span className='break-words text-[11px]'>{message}</span>
                    {nodeName && (
                      <span className='truncate text-[10px] text-[var(--muted-foreground)]'>{nodeName}</span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Panel>
  );
};
