import React, { useMemo } from 'react';
import { P, match } from 'ts-pattern';
import type { z } from 'zod';

import { resolveFunctionScope } from '../../../helpers/custom-function-schema';
import { computeFunctionArgsDrift, fillMissingFunctionArgs } from '../../../helpers/custom-function-schema';
import type { GetNodeDataResult } from '../../../helpers/node-data';
import { getNodeData } from '../../../helpers/node-data';
import { useNodeType } from '../../../helpers/node-type';
import type { customNodeSchema } from '../../../helpers/schema';
import { get, toOperatorExprArray } from '../../../helpers/utility';
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

  const persistExpressions = (val: any) => {
    graphActions.updateNode(id, (draft) => {
      draft.content.config.expressions = val;

      draft.content.config.expr_asts = (val ?? []).map((expr: any) => ({
        id: expr?.id,
        key: expr?.key,
        value: expr?.value ? toOperatorExprArray(expr.value) : [''],
      }));

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
          value={content?.config?.expressions}
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
