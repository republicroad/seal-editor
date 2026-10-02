import React, { useMemo } from 'react';
import { P, match } from 'ts-pattern';
import type { z } from 'zod';

import { resolveFunctionScope } from '../../../helpers/custom-function-schema';
import {
  computeFunctionArgsDrift,
  editorValueToNamedCall,
  fillMissingFunctionArgs,
  namedCallToEditorValue,
} from '../../../helpers/custom-function-schema';
import type { GetNodeDataResult } from '../../../helpers/node-data';
import { getNodeData } from '../../../helpers/node-data';
import { useNodeType } from '../../../helpers/node-type';
import type { customNodeSchema } from '../../../helpers/schema';
import { get } from '../../../helpers/utility';
import { isWasmAvailable } from '../../../helpers/wasm';
import { useT } from '../../../theming/i18n';
import { CustomFunction } from '../../custom-function-table';
import type { ExpressionPermission } from '../../custom-function-table/context/expression-store.context';
import { Button } from '../../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import type { SimulationTrace, SimulationTraceDataExpression } from '../simulator/simulation.types';

export type TabCustomFunctionProps = {
  id: string;
  user?: string;
  customFunctions?: any;
};

export const CustomFunctionTable: React.FC<TabCustomFunctionProps> = ({ id, user, customFunctions }) => {
  const graphActions = useDecisionGraphActions();
  const nodeType = useNodeType(id, { attachGlobals: false });
  const { disabled, content, globalType } = useDecisionGraphState(({ disabled, decisionGraph, globalType }) => ({
    disabled,
    content: (decisionGraph?.nodes ?? []).find((node) => node.id === id)?.content,
    globalType,
  }));

  const { nodeTrace, inputData, nodeSnapshot, viewConfig } = useDecisionGraphState(
    ({ simulate, decisionGraph, viewConfig }) => ({
      nodeTrace: match(simulate)
        .with(
          { result: P.nonNullable },
          ({ result }) => result.trace[id] as SimulationTrace<SimulationTraceDataExpression>,
        )
        .otherwise(() => null),
      inputData: match(simulate)
        .with({ result: P.nonNullable }, ({ result }) => getNodeData(id, { trace: result.trace, decisionGraph }))
        .otherwise(() => null),
      nodeSnapshot: match(simulate)
        .with(
          { result: P.nonNullable },
          ({ result }) =>
            result.snapshot?.nodes?.find((n) => n.id === id)?.content as z.infer<typeof customNodeSchema>['content'],
        )
        .otherwise(() => null),
      viewConfig,
    }),
  );

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

  // 编辑器视图：规范形行（{$call, kwargs}）→ 位置数组（CustomFunction 按位编辑；
  // 额外键在写路径从 priorKwargs 并回，圆往返保真）
  const editorExpressions = useMemo(
    () =>
      (expressions ?? []).map((expr: any) => {
        if (!expr || typeof expr.value !== 'object' || Array.isArray(expr.value)) {
          return expr;
        }

        const funcDef = functionScope.functions.find((func: any) => func?.name === expr.value.$call);
        const arrayForm = namedCallToEditorValue(expr.value, funcDef);
        return arrayForm ? { ...expr, value: arrayForm } : expr;
      }),
    [expressions, functionScope.functions],
  );

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

  const inputVariableType = useMemo(() => {
    if (!nodeType) {
      return undefined;
    }

    let scopedType = nodeType.clone();
    if (content?.config?.inputField) {
      scopedType = scopedType.calculateType(content.config.inputField);
    }

    if (content?.config?.executionMode === 'loop') {
      scopedType = scopedType.arrayItem();
    }

    Object.entries(globalType ?? {}).forEach(([key, value]) => scopedType.set(key, value));

    return scopedType;
  }, [nodeType, content?.config?.inputField, content?.config?.executionMode, globalType]);

  const debug = useMemo(() => {
    if (!nodeTrace || !inputData || !nodeSnapshot) {
      return undefined;
    }

    if (!isWasmAvailable()) {
      return { trace: nodeTrace, snapshot: nodeSnapshot.config };
    }

    const $data = Object.fromEntries(
      Object.entries(nodeTrace.traceData || {}).map(([k, v]) => [k, safeJson(v.result)]),
    );
    const extendedInputData: GetNodeDataResult = {
      ...inputData,
      $: $data,
    };

    if (content?.config?.inputField) {
      extendedInputData.data = get(extendedInputData.data, content.config.inputField, {});
    }

    return { trace: nodeTrace, inputData: extendedInputData, snapshot: nodeSnapshot.config };
  }, [nodeTrace, nodeSnapshot, inputData]);

  return (
    <div style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
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
        <CustomFunction
          value={editorExpressions}
          disabled={disabled}
          permission={(viewConfig?.enabled ? viewConfig?.permissions?.[id] : 'edit:full') as ExpressionPermission}
          customFunctions={customFunctions}
          functionScope={functionScope}
          debug={debug as any}
          inputVariableType={inputVariableType}
          onChange={(val: any) => {
            persistExpressions(val);
          }}
        />
      </div>
    </div>
  );
};

const safeJson = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};
