import { describe, expect, it } from 'vitest';

import type { CustomNodeNamespace } from '../../lib/custom-node-types';
import { resolveShellCustomFunctions } from '../shell-custom-functions';

const schema = [
  {
    name: 'risk',
    title: 'risk',
    tools: [
      {
        name: 'roster',
        title: 'roster',
        type: 'function',
        namespace: 'risk',
        kind: 'roster',
        returns: null,
        parameters: { type: 'object', properties: {} },
      },
    ],
  },
] as unknown as CustomNodeNamespace[];

describe('resolveShellCustomFunctions（兜底 tab 函数作用域缺省派生）', () => {
  it('宿主显式 prop 优先（宿主优先原则）', () => {
    const prop = [{ name: 'host-ns', tools: [] }];
    expect(resolveShellCustomFunctions(prop, schema)).toBe(prop);
  });

  it('prop 缺省时取 shell schema（EditorShellProvider 零接线）', () => {
    expect(resolveShellCustomFunctions(undefined, schema)).toBe(schema);
  });

  it('schema 为 null/空数组（未 ready）时不接线，行为与裸 kernel 一致', () => {
    expect(resolveShellCustomFunctions(undefined, null)).toBeUndefined();
    expect(resolveShellCustomFunctions(undefined, [])).toBeUndefined();
    expect(resolveShellCustomFunctions(undefined, undefined)).toBeUndefined();
  });

  it('宿主显式空数组同样视为显式接线（尊重宿主意志）', () => {
    expect(resolveShellCustomFunctions([], schema)).toEqual([]);
  });
});
