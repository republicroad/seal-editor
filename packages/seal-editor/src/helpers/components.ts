import type { DecisionTableStoreType } from '../components/decision-table/context/dt-store.context';

export type SchemaSelectProps = {
  field: string;
  name?: string;
  items?: SchemaSelectProps[];
};
export const recursiveSelect = (selector: string[], fields: SchemaSelectProps[]): SchemaSelectProps | undefined => {
  const key = selector?.[0];
  if (!key) return;
  const field = fields.find((field) => field.field === key);
  if (field?.items) {
    return recursiveSelect(selector.slice(1), field.items);
  }
  return field;
};

export const getPath = (key: string, items: SchemaSelectProps[]): string[] | undefined => {
  if (!key || !items) return;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.field === key) {
      return [item.field];
    }

    if (item.items) {
      const path = getPath(key, item.items);
      if (!path) continue;
      return [item.field, ...path];
    }
  }
};

export const columnIdSelector = (x: string) => (state: DecisionTableStoreType['state']) =>
  [
    ...state.decisionTable.inputs.map((i: any) => ({
      ...i,
      colType: 'input',
    })),
    ...state.decisionTable.outputs.map((i: any) => ({
      ...i,
      colType: 'output',
    })),
  ].find((c) => c.id === x);

/**
 * 输入契约 VariableType → flat 点路径清单（dt 字段绑定浏览选择器的字段源；
 * 与 CM6 补全同源）。仅遍历 Object 分支（数组子结构不产生独立绑定路径）。
 */
export const variableTypeToPaths = (variableType?: { toJson: () => unknown } | null): string[] => {
  const paths: string[] = [];
  const walk = (node: unknown, prefix: string): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    const record = node as Record<string, unknown>;
    const object = record.Object;
    if (object === null || typeof object !== 'object') {
      return;
    }
    for (const [key, child] of Object.entries(object as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      paths.push(path);
      walk(child, path);
    }
  };
  walk(variableType?.toJson(), '');
  return paths;
};
