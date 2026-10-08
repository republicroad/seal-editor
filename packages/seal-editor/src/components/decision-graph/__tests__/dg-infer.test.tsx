// @vitest-environment jsdom
import { VariableType } from '@gorules/zen-engine-wasm';
import { describe, expect, it, vi } from 'vitest';

import { createGraphWalker } from '../../../helpers/traversal';
import { NodeTypeKind } from '../context/dg-store.context';
import { inferNodeTypes } from '../dg-infer';
// barrel 先行——traversal/规格链的循环初始化在部分求值序下会炸（probe 实证）
import '../index';

vi.mock('@gorules/zen-engine-wasm', () => {
  class VariableType {
    json: unknown;
    constructor(json: unknown) {
      this.json = json;
    }
    static fromJson(json: unknown) {
      return new VariableType(json);
    }
    static fromIncoming(types: VariableType[]) {
      return new VariableType({ Incoming: types.map((t) => t.json) });
    }
    equal(other?: VariableType) {
      return JSON.stringify(this.json) === JSON.stringify(other?.json);
    }
    clone() {
      return new VariableType(this.json);
    }
    hash() {
      return JSON.stringify(this.json);
    }
  }
  return { VariableType };
});

/**
 * inferNodeTypes 行为锁定（2026-10-08 祖传缺陷修复的回归守卫）：
 * walk 首 yield 恒为 inputNode，原循环内 `return` 退出整个 produce——
 * 推理对一切合法图空转，自定义节点 inferTypes 从未执行（上游 jdm 同缺陷）。
 * 修复为 `continue` 后，本组测试锁定三条：下游可达、content.kind 解析、缓存语义。
 */

const makeState = (customNodes: unknown[], withInput = true) =>
  ({
    decisionGraph: {
      nodes: [
        ...(withInput ? [{ id: 'in', type: 'inputNode', name: 'input', content: {} }] : []),
        { id: 'c1', type: 'customNode', name: 'r1', content: { kind: 'roster', config: { v: 2 } } },
      ],
      edges: withInput ? [{ id: 'e1', sourceId: 'in', targetId: 'c1' }] : [],
    },
    nodeTypes: {},
    customNodes,
  }) as never;

const makePrevState = () => ({ decisionGraph: { nodes: [], edges: [] }, nodeTypes: {}, customNodes: [] }) as never;

const rosterSpec = (overrides: Record<string, unknown> = {}) =>
  ({
    kind: 'roster',
    displayName: 'roster',
    generateNode: () => ({}) as never,
    renderNode: (() => null) as never,
    ...overrides,
  }) as never;

describe('inferNodeTypes（自定义节点 inferTypes 行为守卫——return→continue 缺陷修复）', () => {
  it('inputNode 被跳过后，下游 customNode 的 determineOutputType 真被调用且写出 InferredOutput', () => {
    const determineOutputType = vi.fn(() => ({ json: { String: null } }) as never);
    const needsUpdate = vi.fn(() => true);
    const state = makeState([rosterSpec({ inferTypes: { needsUpdate, determineOutputType } })]);

    const result = inferNodeTypes(state, makePrevState(), createGraphWalker());

    expect(determineOutputType).toHaveBeenCalledTimes(1);
    expect(determineOutputType.mock.calls[0][0].content).toEqual({ kind: 'roster', config: { v: 2 } });
    expect(needsUpdate).toHaveBeenCalled();
    expect(result.isModified).toBe(true);
    expect((result.nodeTypes as Record<string, never>)['c1']).toBeDefined();
  });

  it('customNode 按 content.kind 解析 spec（死路径修复锁定：kind ≠ node.type）', () => {
    // 文档模型 type 恒为 'customNode'——若解析回 `n.kind === node.type` 则永不命中
    const determineOutputType = vi.fn(() => ({ json: 'x' }) as never);
    const state = makeState([
      rosterSpec({ inferTypes: { needsUpdate: () => true, determineOutputType }, rank: 10 }),
      rosterSpec({ kind: 'decoy', displayName: 'decoy' }),
    ]);

    inferNodeTypes(state, makePrevState(), createGraphWalker());
    expect(determineOutputType).toHaveBeenCalledTimes(1);
  });

  it('needsUpdate=false 且 input 未变 → 跳过重推理（缓存语义）', () => {
    const determineOutputType = vi.fn(() => ({ json: 'out' }) as never);
    const existing = VariableType.fromJson('any') as never;
    const prevState = {
      decisionGraph: {
        nodes: makeState([], true).decisionGraph.nodes,
        edges: [{ id: 'e1', sourceId: 'in', targetId: 'c1' }],
      },
      nodeTypes: {
        c1: {
          [NodeTypeKind.InferredInput]: existing,
          [NodeTypeKind.Input]: existing,
          [NodeTypeKind.InferredOutput]: existing,
        },
      },
      customNodes: [],
    } as never;
    const state = {
      ...makeState([rosterSpec({ inferTypes: { needsUpdate: () => false, determineOutputType } })]),
      nodeTypes: {
        c1: {
          [NodeTypeKind.InferredInput]: existing,
          [NodeTypeKind.Input]: existing,
          [NodeTypeKind.InferredOutput]: existing,
        },
      },
    } as never;

    const result = inferNodeTypes(state, prevState, createGraphWalker());
    // InferredInput 因 incomers 侧缺席仍会刷新（isModified 可为 true），
    // 缓存语义锁的是：内容与输入均未变 → 不重跑 determineOutputType
    expect(determineOutputType).not.toHaveBeenCalled();
    expect(result.nodeTypes).toBeDefined();
  });

  it('无 inferTypes 声明的 customNode 安全跳过', () => {
    const state = makeState([rosterSpec()]);
    const result = inferNodeTypes(state, makePrevState(), createGraphWalker());
    expect(result.isModified).toBe(true); // InferredInput 仍推进
    expect((result.nodeTypes as Record<string, never>)['c1']?.InferredOutput).toBeUndefined();
  });
});
