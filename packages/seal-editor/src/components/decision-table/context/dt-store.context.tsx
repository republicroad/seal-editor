import type { Variable, VariableType } from '@gorules/zen-engine-wasm';
import equal from 'fast-deep-equal/es6/react';
import { produce } from 'immer';
import React, { useMemo } from 'react';
import { toast } from 'sonner';
import { P, match } from 'ts-pattern';
import type { StoreApi, UseBoundStore } from 'zustand';
import { create, useStore } from 'zustand';

import type { SchemaSelectProps } from '../../../helpers/components';
import { type GetNodeDataResult } from '../../../helpers/node-data';
import type { ColumnFieldType, OutputFieldType } from '../../../helpers/schema';
import { useMemoEquality } from '../../../helpers/use-memoized-selector';
import type { DictionaryMap } from '../../../theme';
import { createT } from '../../../theming/i18n';
import type { SimulationTrace, SimulationTraceDataTable } from '../../decision-graph';
import type { Diff, DiffMetadata } from '../../decision-graph/dg-types';
import type { TableCellProps } from '../table/table-default-cell';

export type TableExportOptions = {
  name: string;
};

export type TableCursor = {
  x: string;
  y: number;
};

export type { ColumnFieldType, OutputFieldType };

export type TableSchemaItem = {
  id: string;
  name: string;
  field?: string;
  defaultValue?: string;
  fieldType?: ColumnFieldType;
  outputFieldType?: OutputFieldType;
  _diff?: DiffMetadata;
};

export type HitPolicy = 'first' | 'collect';
export type ColumnType = 'inputs' | 'outputs';

export type DecisionTableType = {
  hitPolicy: HitPolicy | string;
  passThrough?: boolean;
  inputField?: string;
  outputPath?: string;
  executionMode?: 'single' | 'loop';
  inputs: TableSchemaItem[];
  outputs: TableSchemaItem[];
  rules: Record<string, string>[];
} & Diff;

const outputTypeDefault = (schemaItem: TableSchemaItem): string => {
  const type = schemaItem.outputFieldType?.type;
  if (!type) return '';
  return match(type)
    .with('string', () => '""')
    .with('string-array', () => '[]')
    .with('boolean', () => 'false')
    .with('number', () => '0')
    .with('date', () => `d('${new Date().toISOString().slice(0, 10)}')`)
    .otherwise(() => '');
};

const cleanupTableRule = (
  decisionTable: DecisionTableType,
  rule: Record<string, string>,
  defaultId?: string,
): Record<string, string> => {
  const outputIds = new Set(decisionTable.outputs.map((o) => o.id));
  const schemaItems = [...decisionTable.inputs, ...decisionTable.outputs];
  const newRule: Record<string, string> = {
    _id: rule._id || crypto.randomUUID(),
    _description: rule._description,
  };
  schemaItems.forEach((schemaItem) => {
    if (defaultId && newRule._id === defaultId) {
      const fallback = outputIds.has(schemaItem.id) ? outputTypeDefault(schemaItem) : '';
      return (newRule[schemaItem.id] = rule?.[schemaItem.id] || schemaItem?.defaultValue || fallback);
    }
    newRule[schemaItem.id] = rule?.[schemaItem.id] || '';
  });
  return newRule;
};

const cleanupTableRules = (decisionTable: DecisionTableType, defaultId?: string): Record<string, string>[] => {
  const rules = decisionTable?.rules || [];
  return rules.map((rule) => cleanupTableRule(decisionTable, rule, defaultId));
};

export const parseDecisionTable = (decisionTable?: DecisionTableType) => {
  const dt: DecisionTableType = {
    hitPolicy: decisionTable?.hitPolicy || 'first',
    inputs: decisionTable?.inputs || [],
    outputs: decisionTable?.outputs || [],
    rules: decisionTable?.rules || [],
    passThrough: decisionTable?.passThrough ?? false,
    inputField: decisionTable?.inputField,
    outputPath: decisionTable?.outputPath,
    executionMode: decisionTable?.executionMode ?? 'single',
  };

  if (decisionTable?._diff) {
    dt._diff = decisionTable._diff;
  }

  if (dt.inputs?.length === 0) {
    dt.inputs = [
      {
        id: crypto.randomUUID(),
        name: 'Input',
      },
    ];
  }

  if (dt.outputs?.length === 0) {
    dt.outputs = [
      {
        id: crypto.randomUUID(),
        field: 'output',
        name: 'Output',
      },
    ];
  }

  dt.rules = dt.rules.map((r) =>
    match(r)
      .with({ _id: P.string.minLength(1) }, () => r)
      .otherwise((r) => ({ ...r, _id: crypto.randomUUID() })),
  );

  return dt;
};

export type DecisionTablePermission = 'edit:full' | 'edit:rules' | 'edit:values';
export type JdmUiMode = 'dev' | 'business';
/** @deprecated Use JdmUiMode instead */
export type DecisionTableMode = JdmUiMode;

/** 单元格历史一笔（undo/redo 栈的原子单位；rowId 寻址——行插删不使历史失位） */
export type CellHistoryEntry = {
  rowId: string;
  columnId: string;
  previousValue: string;
  value: string;
};

/** 编辑-5 形态：格子级历史栈深上限（防超大粘贴撑爆内存） */
export const CELL_HISTORY_LIMIT = 100;

export type DecisionTableStoreType = {
  state: {
    id?: string;
    name?: string;
    decisionTable: DecisionTableType;
    cursor: TableCursor | null;

    disabled: boolean;
    disableHitPolicy: boolean;

    minColWidth: number;
    colWidth: number;

    permission?: DecisionTablePermission;
    mode: JdmUiMode;
    dictionaries?: DictionaryMap;

    inputVariableType?: VariableType;
    derivedVariableTypes: Record<string, VariableType>;

    inputsSchema?: SchemaSelectProps[];
    outputsSchema?: SchemaSelectProps[];

    debugIndex: number;
    calculatedInputData?: Variable;

    debug?: {
      snapshot: DecisionTableType;
      trace: SimulationTrace<SimulationTraceDataTable>;
      inputData?: GetNodeDataResult;
    };

    /** 单元格 undo/redo 栈（一批一 entry 组；commitData/commitCells 写入时压栈） */
    cellUndoStack: CellHistoryEntry[][];
    cellRedoStack: CellHistoryEntry[][];
  };

  actions: {
    setDecisionTable: (val: DecisionTableType) => void;
    setCursor: (cursor: TableCursor | null) => void;
    commitData: (data: string, cursor: TableCursor) => void;
    /** 批量格子写入（剪贴板粘贴/清除/填充）：一次 produce + 一次 onChange */
    commitCells: (changes: Array<{ value: string; columnId: string; rowIndex: number }>) => void;
    /** 格子 undo：弹一批按 rowId 回写 previousValue（行插删后仍寻址正确） */
    undoCells: () => void;
    /** 格子 redo：回放上一批撤销的 value */
    redoCells: () => void;
    swapRows: (source: number, target: number) => void;
    addRowAbove: (target?: number) => void;
    addRowBelow: (target?: number) => void;
    removeRow: (target?: number) => void;
    removeRowWithUndo: (target?: number) => void;
    addColumn: (type: ColumnType, column: TableSchemaItem) => void;
    updateColumn: (type: ColumnType, id: string, column: TableSchemaItem) => void;
    removeColumn: (type: ColumnType, id: string) => void;
    reorderColumns: (type: ColumnType, columns: TableSchemaItem[]) => void;
    updateHitPolicy: (hitPolicy: HitPolicy) => void;
  };

  listeners: {
    onChange?: (val: DecisionTableType) => void;
    cellRenderer?: (props: TableCellProps) => React.ReactNode | null | undefined;
    onColumnResize?: () => void;
  };
};

type ExposedStore<T> = UseBoundStore<StoreApi<T>> & {
  setState: (partial: Partial<T>) => void;
};

// Empty-object default is safe: consumers only render inside
// DecisionTableProvider, which supplies the real stores on mount.
const DecisionTableStoreContext = React.createContext<{
  stateStore: ExposedStore<DecisionTableStoreType['state']>;
  listenerStore: ExposedStore<DecisionTableStoreType['listeners']>;
  actions: DecisionTableStoreType['actions'];
}>(
  // Double-cast is intentional: consumers only render inside
  // DecisionTableProvider, which supplies the real stores on mount.
  {} as unknown as {
    stateStore: ExposedStore<DecisionTableStoreType['state']>;
    listenerStore: ExposedStore<DecisionTableStoreType['listeners']>;
    actions: DecisionTableStoreType['actions'];
  },
);

export type DecisionTableContextProps = {
  //
};

export const DecisionTableProvider: React.FC<React.PropsWithChildren<DecisionTableContextProps>> = (props) => {
  const { children } = props;

  const stateStore = useMemo(
    () =>
      create<DecisionTableStoreType['state']>(() => ({
        id: undefined,
        name: undefined,
        decisionTable: parseDecisionTable(),
        cursor: null,
        cellUndoStack: [],
        cellRedoStack: [],

        disabled: false,
        disableHitPolicy: false,

        colWidth: 200,
        minColWidth: 150,

        inputsSchema: undefined,
        outputsSchema: undefined,

        mode: 'dev',
        derivedVariableTypes: {},
        inputVariableType: undefined,
        debugIndex: 0,
        debug: undefined,
      })),
    [],
  );

  const listenerStore = useMemo(
    () =>
      create<DecisionTableStoreType['listeners']>(() => ({
        onChange: undefined,
        cellRenderer: undefined,
      })),
    [],
  );

  const actions = useMemo<DecisionTableStoreType['actions']>(() => {
    /** 格子历史压栈：新写入清空 redo；栈深裁到 CELL_HISTORY_LIMIT */
    const pushCellHistory = (entries: CellHistoryEntry[]) => {
      const { cellUndoStack } = stateStore.getState();
      stateStore.setState({
        cellUndoStack: [...cellUndoStack, entries].slice(-CELL_HISTORY_LIMIT),
        cellRedoStack: [],
      });
    };

    return {
      setDecisionTable: (decisionTable) => stateStore.setState({ decisionTable }),
      setCursor: (cursor: TableCursor | null) => stateStore.setState({ cursor }),
      commitData: (value: string, cursor: TableCursor) => {
        const { decisionTable } = stateStore.getState();
        const rowId = decisionTable.rules[cursor.y]?._id;
        const previousValue = String(decisionTable.rules[cursor.y]?.[cursor.x] ?? '');

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          const { x, y } = cursor;
          draft.rules[y][x] = value;
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        if (rowId != null) {
          pushCellHistory([{ rowId, columnId: cursor.x, previousValue, value }]);
        }
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      commitCells: (changes) => {
        const { decisionTable } = stateStore.getState();
        const history: CellHistoryEntry[] = [];

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          for (const { value, columnId, rowIndex } of changes) {
            const row = draft.rules[rowIndex];
            if (row && columnId in row) {
              history.push({
                rowId: String(row._id),
                columnId,
                previousValue: String(row[columnId] ?? ''),
                value,
              });
              row[columnId] = value;
            }
          }
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        if (history.length > 0) {
          pushCellHistory(history);
        }
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      undoCells: () => {
        const { decisionTable, cellUndoStack, cellRedoStack } = stateStore.getState();
        const entries = cellUndoStack.at(-1);
        if (!entries?.length) {
          return;
        }

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          for (const entry of entries) {
            const rowIndex = draft.rules.findIndex((rule) => rule._id === entry.rowId);
            if (rowIndex >= 0 && entry.columnId in draft.rules[rowIndex]) {
              draft.rules[rowIndex][entry.columnId] = entry.previousValue;
            }
          }
          return draft;
        });

        stateStore.setState({
          decisionTable: updatedDecisionTable,
          cellUndoStack: cellUndoStack.slice(0, -1),
          cellRedoStack: [...cellRedoStack, entries],
        });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      redoCells: () => {
        const { decisionTable, cellUndoStack, cellRedoStack } = stateStore.getState();
        const entries = cellRedoStack.at(-1);
        if (!entries?.length) {
          return;
        }

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          for (const entry of entries) {
            const rowIndex = draft.rules.findIndex((rule) => rule._id === entry.rowId);
            if (rowIndex >= 0 && entry.columnId in draft.rules[rowIndex]) {
              draft.rules[rowIndex][entry.columnId] = entry.value;
            }
          }
          return draft;
        });

        stateStore.setState({
          decisionTable: updatedDecisionTable,
          cellUndoStack: [...cellUndoStack, entries],
          cellRedoStack: cellRedoStack.slice(0, -1),
        });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      swapRows: (source: number, target: number) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          const input = draft?.rules?.[source];
          draft.rules.splice(source, 1);
          draft.rules.splice(target, 0, input);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable, cursor: null });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      addRowAbove: (target?: number) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          if (target === undefined) {
            target = 0;
          }

          const _id = crypto.randomUUID();
          draft.rules.splice(target, 0, cleanupTableRule(draft, { _id }, _id));

          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);

        const { cursor } = stateStore.getState();
        if (cursor && cursor?.y === target) {
          stateStore.setState({ cursor: { x: cursor.x, y: cursor.y + 1 } });
        }
      },
      addRowBelow: (target?: number) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          if (target === undefined) {
            target = draft?.rules?.length;
          } else {
            target += 1;
          }

          const _id = crypto.randomUUID();
          draft.rules.splice(target, 0, cleanupTableRule(draft, { _id }, _id));
          return draft;
        });
        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);

        const { cursor } = stateStore.getState();
        if (cursor && cursor?.y === target) {
          stateStore.setState({ cursor: { x: cursor.x, y: cursor.y - 1 } });
        }
      },
      removeRow: (target?: number) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          if (target === undefined) {
            target = draft?.rules?.length || 0;
          }

          draft.rules.splice(target, 1);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      removeRowWithUndo: (target?: number) => {
        const { decisionTable } = stateStore.getState();
        const removedIndex = target ?? (decisionTable?.rules?.length || 0);
        const removedRule = decisionTable?.rules?.[removedIndex];

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          draft.rules.splice(removedIndex, 1);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });

        // 免确认 + Undo toast（业界免确认删除模式）：5 秒内可撤销
        const t = createT('en');
        toast.info(t('dt.toolbar.rowRemoved'), {
          action: {
            label: t('common.undo'),
            onClick: () => {
              const current = stateStore.getState().decisionTable;
              const restored = produce(current, (draft) => {
                if (removedRule) {
                  draft.rules.splice(Math.min(removedIndex, draft.rules.length), 0, removedRule);
                }
              });
              stateStore.setState({ decisionTable: restored });
              listenerStore.getState().onChange?.(restored);
            },
          },
        });

        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      addColumn: (type: ColumnType, column: TableSchemaItem) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          draft[type].push(column);
          draft.rules = cleanupTableRules(draft);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      updateColumn: (type: ColumnType, id: string, data: TableSchemaItem) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          draft[type] = draft[type].map((item) => {
            if (item.id === id) {
              return {
                ...item,
                name: data?.name,
                field: data?.field,
                defaultValue: data?.defaultValue,
                fieldType: data?.fieldType,
                outputFieldType: data?.outputFieldType,
              };
            }
            return item;
          });

          draft.rules = cleanupTableRules(draft);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      removeColumn: (type: ColumnType, id: string) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = parseDecisionTable(
          produce(decisionTable, (draft) => {
            draft[type] = (draft?.[type] || []).filter((item) => item?.id !== id);
            draft.rules = cleanupTableRules(draft);
            return draft;
          }),
        );

        stateStore.setState({ decisionTable: updatedDecisionTable, cursor: null });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      reorderColumns: (type: ColumnType, columns: TableSchemaItem[]) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          draft[type] = columns;
          draft.rules = cleanupTableRules(draft);
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
      updateHitPolicy: (hitPolicy: HitPolicy) => {
        const { decisionTable } = stateStore.getState();

        const updatedDecisionTable = produce(decisionTable, (draft) => {
          draft.hitPolicy = hitPolicy;
          return draft;
        });

        stateStore.setState({ decisionTable: updatedDecisionTable });
        listenerStore.getState().onChange?.(updatedDecisionTable);
      },
    };
  }, []);

  const value = useMemo(
    () => ({
      stateStore,
      listenerStore,
      actions,
    }),
    [stateStore, listenerStore, actions],
  );

  return <DecisionTableStoreContext.Provider value={value}>{children}</DecisionTableStoreContext.Provider>;
};

export function useDecisionTableState<T>(
  selector: (state: DecisionTableStoreType['state']) => T,
  equals: (a: any, b: any) => boolean = equal,
): T {
  return useStore(React.useContext(DecisionTableStoreContext).stateStore, useMemoEquality(selector, equals));
}

export function useDecisionTableListeners<T>(
  selector: (state: DecisionTableStoreType['listeners']) => T,
  equals: (a: any, b: any) => boolean = equal,
): T {
  return useStore(React.useContext(DecisionTableStoreContext).listenerStore, useMemoEquality(selector, equals));
}

export function useDecisionTableActions(): DecisionTableStoreType['actions'] {
  return React.useContext(DecisionTableStoreContext).actions;
}

export const useDecisionTableRaw = () => React.useContext(DecisionTableStoreContext);

export default DecisionTableProvider;
