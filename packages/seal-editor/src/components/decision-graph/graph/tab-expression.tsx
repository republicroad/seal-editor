import React, { useMemo, useRef } from 'react';
import { P, match } from 'ts-pattern';
import type { z } from 'zod';

import type { GetNodeDataResult } from '../../../helpers/node-data';
import { getNodeData } from '../../../helpers/node-data';
import { useNodeType } from '../../../helpers/node-type';
import type { expressionNodeSchema } from '../../../helpers/schema';
import { get } from '../../../helpers/utility';
import { isWasmAvailable } from '../../../helpers/wasm';
import { Expression } from '../../expression';
import type { ExpressionPermission } from '../../expression/context/expression-store.context';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import { useTabSerializer } from '../context/serializer.context';
import type { NodeExpressionData } from '../nodes/specifications/expression.specification';
import type { SimulationTrace, SimulationTraceDataExpression } from '../simulator/simulation.types';

type ScrollPosition = { top: number; left: number };

export type TabExpressionProps = {
  id: string;
};

export const TabExpression: React.FC<TabExpressionProps> = ({ id }) => {
  const graphActions = useDecisionGraphActions();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const inputType = useNodeType(id);

  useTabSerializer<ScrollPosition>(id, 'scroll', {
    serialize: () => {
      const el = scrollContainerRef.current;
      if (!el) return { top: 0, left: 0 };
      return { top: el.scrollTop, left: el.scrollLeft };
    },
    restore: (position) => {
      if (!position) return;
      let attempts = 0;
      const apply = () => {
        const el = scrollContainerRef.current;
        if (!el || el.scrollHeight <= el.clientHeight) {
          if (attempts++ < 60) requestAnimationFrame(apply);
          return;
        }
        el.scrollTop = position.top;
        el.scrollLeft = position.left;
      };
      requestAnimationFrame(apply);
    },
  });

  const { disabled, content } = useDecisionGraphState(({ disabled, decisionGraph }) => ({
    disabled,
    content: (decisionGraph?.nodes ?? []).find((node) => node.id === id)?.content as NodeExpressionData,
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
            (result.snapshot?.nodes || []).find((n) => n.id === id)?.content as z.infer<
              typeof expressionNodeSchema
            >['content'],
        )
        .otherwise(() => null),
      viewConfig,
    }),
  );

  const debug = useMemo(() => {
    if (!nodeTrace || !inputData || !nodeSnapshot) {
      return undefined;
    }

    if (!isWasmAvailable()) {
      return { trace: nodeTrace, snapshot: nodeSnapshot };
    }

    const $data = Object.fromEntries(
      Object.entries(nodeTrace?.traceData ?? {}).map(([k, v]) => [k, safeJson(v.result)]),
    );
    const extendedInputData: GetNodeDataResult = {
      ...inputData,
      $: $data,
    };

    if (content?.inputField) {
      extendedInputData.data = get(extendedInputData.data, content.inputField, {});
    }

    return { trace: nodeTrace, inputData: extendedInputData, snapshot: nodeSnapshot };
  }, [nodeTrace, nodeSnapshot, inputData]);

  // 行值裸名解析的静态输入基面：inputField 映射 + loop 取数组项（与
  // specification.inferTypes.determineOutputType 同构）。供 `$` 误用提示
  // 与编辑器补全使用——不依赖仿真运行（SimulateDataSync 仅在仿真后有值）。
  const rowInputVariableType = useMemo(() => {
    if (!inputType) return undefined;
    let mapped = inputType;
    if (content?.inputField) {
      mapped = mapped.get(content.inputField);
    }
    if (content?.executionMode === 'loop') {
      mapped = mapped.arrayItem();
    }
    return mapped;
  }, [inputType, content?.inputField, content?.executionMode]);

  return (
    <div ref={scrollContainerRef} style={{ height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
      <Expression
        value={content?.expressions}
        disabled={disabled}
        inputVariableType={rowInputVariableType}
        permission={(viewConfig?.enabled ? viewConfig?.permissions?.[id] : 'edit:full') as ExpressionPermission}
        debug={debug}
        onChange={(val) => {
          graphActions.updateNode(id, (draft) => {
            draft.content.expressions = val;
            return draft;
          });
        }}
      />
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
