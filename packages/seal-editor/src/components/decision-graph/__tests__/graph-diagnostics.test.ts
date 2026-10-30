import { describe, expect, it } from 'vitest';

import { computeBuiltinDiagnostics } from '../graph-diagnostics';

const node = (id: string, type: string, content?: unknown) => ({ id, type, content });
const edge = (targetId: string) => ({ targetId });

describe('computeBuiltinDiagnostics（P0-2 内置缺省校验器）', () => {
  it('悬空输入：内建处理节点零输入连线 → MISSING_INPUT error（inputNode 豁免，outputNode 同查）', () => {
    const entries = computeBuiltinDiagnostics({
      nodes: [node('in', 'inputNode'), node('dt', 'decisionTableNode'), node('out', 'outputNode')],
      edges: [],
    });
    expect(entries.filter((e) => e.code === 'MISSING_INPUT').map((e) => e.nodeId)).toEqual(['dt', 'out']);
    const dt = entries.find((e) => e.nodeId === 'dt');
    expect(dt?.severity).toBe('error');
    expect(entries.find((e) => e.nodeId === 'in')).toBeUndefined();
  });

  it('有输入连线不报；customNode 自定义端口拓扑豁免', () => {
    const entries = computeBuiltinDiagnostics({
      nodes: [node('in', 'inputNode'), node('dt', 'decisionTableNode'), node('cx', 'customNode')],
      edges: [edge('dt'), edge('cx')],
    });
    expect(entries.find((e) => e.code === 'MISSING_INPUT')).toBeUndefined();
  });

  it('表达式节点：无行/全空行 → EMPTY_EXPRESSION error；有内容行不报', () => {
    const entries = computeBuiltinDiagnostics({
      nodes: [
        node('e0', 'expressionNode', { expressions: [] }),
        node('e1', 'expressionNode', { expressions: [{ key: 'a', expression: '   ' }] }),
        node('e2', 'expressionNode', { expressions: [{ key: 'a', expression: '1 + 1' }] }),
      ],
      edges: [edge('e0'), edge('e1'), edge('e2')],
    });
    expect(entries.filter((e) => e.code === 'EMPTY_EXPRESSION').map((e) => e.nodeId)).toEqual(['e0', 'e1']);
    for (const hit of entries.filter((e) => e.code === 'EMPTY_EXPRESSION')) {
      expect(hit.severity).toBe('error');
    }
    expect(entries.find((e) => e.nodeId === 'e2')).toBeUndefined();
  });

  it('表达式节点：legacy 单字符串 content.expression 兼容识别', () => {
    const entries = computeBuiltinDiagnostics({
      nodes: [node('e1', 'expressionNode', { expression: 'a > 1' })],
      edges: [edge('e1')],
    });
    expect(entries.find((e) => e.nodeId === 'e1')).toBeUndefined();
  });

  it('决策表零规则 → EMPTY_RULES warning（草稿常态降半级）', () => {
    const entries = computeBuiltinDiagnostics({
      nodes: [node('t1', 'decisionTableNode', { rules: [] }), node('t2', 'decisionTableNode', { rules: [{}] })],
      edges: [edge('t1'), edge('t2')],
    });
    const empty = entries.find((e) => e.nodeId === 't1');
    expect(empty?.code).toBe('EMPTY_RULES');
    expect(empty?.severity).toBe('warning');
    expect(entries.find((e) => e.nodeId === 't2')).toBeUndefined();
  });

  it('空图零条目', () => {
    expect(computeBuiltinDiagnostics({ nodes: [], edges: [] })).toEqual([]);
  });
});
