import React, { useEffect, useMemo, useRef, useState } from 'react';
import { P, match } from 'ts-pattern';

import { computeColumnHitStats } from '../../../helpers/dt-column-hit-stats';
import {
  type InstantEvalStatus,
  instantEvalStructureSignature,
  resolveInstantEvalStatus,
} from '../../../helpers/dt-instant-eval';
import { getNodeData } from '../../../helpers/node-data';
import { get } from '../../../helpers/utility';
import { isWasmAvailable } from '../../../helpers/wasm';
import type { DecisionTableType, TableScrollApi } from '../../decision-table';
import { DecisionTable } from '../../decision-table';
import type { DecisionTablePermission } from '../../decision-table/context/dt-store.context';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import { useTabSerializer } from '../context/serializer.context';
import type { NodeDecisionTableData } from '../nodes/specifications/decision-table.specification';
import type { SimulationTrace, SimulationTraceDataTable } from '../simulator/simulation.types';

type TableScrollSnapshot = { rowIndex: number; scrollLeft: number };

export type TabDecisionTableProps = {
  id: string;
};

export const TabDecisionTable: React.FC<TabDecisionTableProps> = ({ id }) => {
  const graphActions = useDecisionGraphActions();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const scrollApiRef = useRef<TableScrollApi | null>(null);

  useTabSerializer<TableScrollSnapshot>(id, 'scroll', {
    serialize: () => ({
      rowIndex: scrollApiRef.current?.getTopRowIndex() ?? 0,
      scrollLeft: scrollContainerRef.current?.scrollLeft ?? 0,
    }),
    restore: (snapshot) => {
      if (!snapshot) return;
      let attempts = 0;
      const apply = () => {
        const api = scrollApiRef.current;
        const el = scrollContainerRef.current;
        if (!api || !el || el.scrollHeight <= el.clientHeight) {
          if (attempts++ < 60) requestAnimationFrame(apply);
          return;
        }
        api.scrollToRowIndex(snapshot.rowIndex);
        el.scrollLeft = snapshot.scrollLeft;
      };
      requestAnimationFrame(apply);
    },
  });
  const { nodeName, nodeTrace, inputData, nodeSnapshot, viewConfig, dictionaries, mode } = useDecisionGraphState(
    ({ simulate, decisionGraph, viewConfig, dictionaries, mode }) => ({
      nodeName: decisionGraph.nodes.find((n) => n.id === id)?.name,
      nodeTrace: match(simulate)
        .with({ result: P.nonNullable }, ({ result }) => result.trace[id] as SimulationTrace<SimulationTraceDataTable>)
        .otherwise(() => null),
      inputData: match(simulate)
        .with({ result: P.nonNullable }, ({ result }) => getNodeData(id, { trace: result.trace, decisionGraph }))
        .otherwise(() => null),
      nodeSnapshot: match(simulate)
        .with(
          { result: P.nonNullable },
          ({ result }) => (result.snapshot?.nodes || []).find((n) => n.id === id)?.content as DecisionTableType,
        )
        .otherwise(() => null),
      viewConfig,
      dictionaries,
      mode,
    }),
  );

  const { disabled, content } = useDecisionGraphState(({ disabled, decisionGraph }) => ({
    disabled,
    content: (decisionGraph?.nodes ?? []).find((node) => node.id === id)?.content as NodeDecisionTableData,
  }));

  // A3 即时求值（规划档推荐案）：参数值变更防抖 400ms 复跑 simulator；
  // 结构变更挂起、大表降级——挂起/降级时徽章随既有结果静止显示。
  // lastRunSig 在每次 simulate 结果落定时刷新（此时结构与签名必然一致）。
  const simulate = useDecisionGraphState(({ simulate }) => simulate);
  const [instantEvalStatus, setInstantEvalStatus] = useState<InstantEvalStatus | undefined>(undefined);
  const lastRunSigRef = useRef<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSimulateRef = useRef(simulate);
  const contentRef = useRef(content);
  contentRef.current = content;

  // simulate 结果落定 → 刷新 lastRunSig、解除挂起/降级显示（新结果已携带新结构）
  useEffect(() => {
    if (simulate && simulate !== lastSimulateRef.current) {
      lastSimulateRef.current = simulate;
      lastRunSigRef.current = instantEvalStructureSignature(contentRef.current);
      setInstantEvalStatus((cur) => (cur === 'suspended' || cur === 'degraded' ? 'active' : cur));
    }
  }, [simulate]);

  useEffect(() => {
    if (!content) {
      return undefined;
    }
    const rowCount = content.rules?.length ?? 0;
    const nextSig = instantEvalStructureSignature({
      rows: content.rules,
      inputs: content.inputs,
      outputs: content.outputs,
    });
    const status = resolveInstantEvalStatus({
      rowCount,
      nextSig,
      lastRunSig: lastRunSigRef.current,
      hasSimulateResult: !!lastSimulateRef.current?.result,
    });
    setInstantEvalStatus(status);
    if (status !== 'active') {
      return undefined;
    }
    debounceRef.current = setTimeout(() => {
      graphActions.requestSimulation();
    }, 400);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, graphActions]);

  const debug = useMemo(() => {
    if (!nodeTrace || !inputData || !nodeSnapshot) {
      return undefined;
    }

    if (!isWasmAvailable()) {
      return { trace: nodeTrace, snapshot: nodeSnapshot };
    }

    const extendedInputData = { ...inputData };
    if (content?.inputField) {
      extendedInputData.data = get(extendedInputData.data, content.inputField, {});
    }

    return { trace: nodeTrace, inputData: extendedInputData, snapshot: nodeSnapshot };
  }, [nodeTrace, nodeSnapshot, inputData]);

  const fixturesRun = useDecisionGraphState(({ fixturesRun }) => fixturesRun);

  // D2：Run all 命中统计——本节点规则命中 → 条件列参与计数（fixturesRun 图级报告，跨页签存续）
  const runHitStats = useMemo(() => {
    if (fixturesRun?.status !== 'done' || !fixturesRun.report) {
      return undefined;
    }
    const ruleIds = fixturesRun.report.results.flatMap((r) =>
      (r.ruleHits ?? []).filter((h) => h.nodeId === id).map((h) => h.ruleId),
    );
    if (ruleIds.length === 0) {
      return undefined;
    }
    const nameOf = (columnId: string) => {
      const col = [...(content?.inputs ?? []), ...(content?.outputs ?? [])].find((c) => c.id === columnId);
      return col?.name ?? columnId;
    };
    return {
      entries: computeColumnHitStats(content, ruleIds).map((s) => ({
        name: nameOf(s.columnId),
        count: s.count,
      })),
      total: ruleIds.length,
    };
  }, [fixturesRun, content, id]);

  return (
    <DecisionTable
      id={id}
      name={nodeName}
      tableHeight={'100%'}
      value={content as DecisionTableType}
      scrollContainerRef={scrollContainerRef}
      scrollApiRef={scrollApiRef}
      disabled={disabled}
      permission={viewConfig?.enabled ? (viewConfig?.permissions?.[id] as DecisionTablePermission) : 'edit:full'}
      dictionaries={dictionaries}
      mode={mode}
      debug={debug}
      runHitStats={runHitStats}
      instantEvalStatus={instantEvalStatus}
      onChange={(val) => {
        graphActions.updateNode(id, (draft) => {
          Object.assign(draft.content, val);
          return draft;
        });
      }}
    />
  );
};
