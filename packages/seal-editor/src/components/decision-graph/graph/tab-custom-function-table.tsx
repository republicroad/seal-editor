import React, { useMemo } from 'react';

import { resolveFunctionScope } from '../../../helpers/custom-function-schema';
import {
  buildInstanceViews,
  computeFunctionArgsDrift,
  editorValueToNamedCall,
  fillMissingFunctionArgs,
  findDuplicateKeys,
  summarizeInstanceDrift,
} from '../../../helpers/custom-function-schema';
import { useT } from '../../../theming/i18n';
import { Button, Tooltip, Typography } from '../../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import { type FunctionInstance, InstanceEditor } from './instance-editor';

export type TabCustomFunctionProps = {
  id: string;
  user?: string;
  customFunctions?: any;
};

export const CustomFunctionTable: React.FC<TabCustomFunctionProps> = ({ id, user, customFunctions }) => {
  const graphActions = useDecisionGraphActions();
  const { disabled, content } = useDecisionGraphState(({ disabled, decisionGraph }) => ({
    disabled,
    content: (decisionGraph?.nodes ?? []).find((node) => node.id === id)?.content,
  }));

  const functionScope = useMemo(
    () => resolveFunctionScope((content as { kind?: string } | undefined)?.kind, customFunctions),
    [content?.kind, customFunctions],
  );

  const t = useT();
  const expressions = (content?.config as { expressions?: any } | undefined)?.expressions;
  const argsDrift = useMemo(() => computeFunctionArgsDrift(expressions, functionScope), [expressions, functionScope]);
  const driftRowCount = argsDrift.length;
  const driftMissingCount = argsDrift.reduce((sum, entry) => sum + entry.missing.length, 0);
  const driftUnrecognizedCount = argsDrift.reduce((sum, entry) => sum + entry.unrecognized.length, 0);

  // ADR-015 增补 P1：实例概览数据（并行集合观 + 键重复 + 实例级漂移）
  const duplicateKeys = useMemo(() => findDuplicateKeys(expressions), [expressions]);
  const instanceViews = useMemo(() => buildInstanceViews(expressions, functionScope), [expressions, functionScope]);
  const driftByRowId = useMemo(() => summarizeInstanceDrift(argsDrift), [argsDrift]);

  // ADR-015 #3：写路径归一为规范形 {$call, kwargs}（编辑器位置数组经声明序
  // 映射；priorKwargs 并回保非位置额外键）；expr_asts 停写（引擎派生，零风险）
  const persistExpressions = (val: any) => {
    const previousById = new Map(((expressions ?? []) as any[]).map((expr: any) => [expr?.id, expr]));
    const canonical = (val ?? []).map((expr: any) => {
      const functionName = Array.isArray(expr?.value)
        ? expr.value[0]
        : typeof expr?.value?.$call === 'string'
          ? expr.value.$call
          : undefined;
      const funcDef = functionScope.functions.find((func: any) => func?.name === functionName);
      const prior = previousById.get(expr?.id)?.value;
      const priorKwargs = prior && typeof prior === 'object' && !Array.isArray(prior) ? (prior.kwargs ?? null) : null;
      const named = editorValueToNamedCall(expr?.value, funcDef, priorKwargs);
      return named ? { ...expr, value: named } : expr;
    });

    graphActions.updateNode(id, (draft) => {
      draft.content.config.expressions = canonical;

      draft.content.config.meta = {
        user: user ?? '',
        proj: user ?? '',
      };
      return draft;
    });
  };

  // ADR-015 增补 P2：expressions → FunctionInstance[]（InstanceEditor 读态）
  const instances: FunctionInstance[] = useMemo(
    () =>
      (expressions ?? []).map((expr: any) => ({
        id: expr?.id ?? '',
        key: expr?.key ?? '',
        call:
          expr?.value !== null && typeof expr?.value === 'object' && !Array.isArray(expr.value)
            ? expr.value
            : { $call: '', kwargs: {} },
        ...(expr?.dependsOn ? { dependsOn: expr.dependsOn } : {}),
      })),
    [expressions],
  );

  // InstanceEditor onChange → 规范形 expressions（写路径经键主权单漏斗）
  const handleInstancesChange = (newInstances: FunctionInstance[]) => {
    graphActions.updateNode(id, (draft) => {
      draft.content.config.expressions = newInstances.map((inst) => ({
        id: inst.id,
        key: inst.key,
        type: 'function',
        value: inst.call,
        ...(inst.dependsOn ? { dependsOn: inst.dependsOn } : {}),
      }));
      draft.content.config.meta = {
        user: user ?? '',
        proj: user ?? '',
      };
      return draft;
    });
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      {/* ADR-015 增补 P1：实例概览条——并行集合观 + 键重复 + 实例级漂移点标 */}
      {instanceViews.length > 0 && (
        <div data-testid='instance-overview' className='mx-3 mt-3 rounded-md border border-border bg-card px-3 py-2'>
          <div className='flex items-center justify-between gap-2'>
            <Typography.Text strong className='text-xs'>
              {t('cf.instanceOverview')}
            </Typography.Text>
            <Typography.Text className='text-[10px] opacity-60'>{t('cf.parallelHint')}</Typography.Text>
          </div>
          <div className='mt-1.5 flex flex-wrap gap-1.5'>
            {instanceViews.map((view) => {
              const drift = driftByRowId[view.id];
              const isDup = duplicateKeys.includes(view.key);
              return (
                <Tooltip
                  key={`${view.fn}-${view.key}-${view.id}`}
                  title={
                    isDup
                      ? t('cf.duplicateKeyError')
                      : drift
                        ? `${t('cf.argsDriftMissing')} ${drift.missing} · ${t('cf.argsDriftUnrecognized')} ${drift.unrecognized}`
                        : undefined
                  }
                >
                  <span
                    data-testid='instance-chip'
                    data-key={view.key}
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                      isDup
                        ? 'border-destructive/40 bg-destructive/10 text-destructive'
                        : drift
                          ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-border bg-muted/40'
                    }`}
                  >
                    <span className='font-medium'>{view.fn}</span>
                    {view.seq > 1 && <span className='opacity-50'>#{view.seq}</span>}
                    <span className='opacity-50'>→ {view.key}</span>
                    {isDup && <span aria-label={t('cf.duplicateKeyError')}>⚠</span>}
                    {drift && !isDup && <span className='inline-block size-1.5 rounded-full bg-amber-500' />}
                  </span>
                </Tooltip>
              );
            })}
          </div>
          {duplicateKeys.length > 0 && (
            <div className='mt-1.5 text-xs text-destructive'>
              {t('cf.duplicateKeyError')}: {duplicateKeys.join(', ')}
            </div>
          )}
        </div>
      )}
      {driftRowCount > 0 && (
        <div
          data-testid='args-drift-band'
          className='mx-3 mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs'
        >
          <span className='text-amber-700 dark:text-amber-400'>
            {t('cf.argsDriftTitle')} · {driftRowCount} {t('cf.argsDriftRows')} · {t('cf.argsDriftMissing')}{' '}
            {driftMissingCount} · {t('cf.argsDriftUnrecognized')} {driftUnrecognizedCount}
          </span>
          {driftMissingCount > 0 && (
            <Button
              size='small'
              type='link'
              className='!px-1'
              disabled={disabled}
              onClick={() => {
                const healed = fillMissingFunctionArgs(expressions, argsDrift, functionScope);
                if (healed) {
                  persistExpressions(healed);
                }
              }}
            >
              {t('cf.argsFillMissing')}
            </Button>
          )}
        </div>
      )}
      <div style={{ paddingTop: driftRowCount > 0 ? 8 : 0 }}>
        <InstanceEditor
          instances={instances}
          functionScope={functionScope}
          disabled={disabled}
          onChange={handleInstancesChange}
        />
      </div>
    </div>
  );
};
