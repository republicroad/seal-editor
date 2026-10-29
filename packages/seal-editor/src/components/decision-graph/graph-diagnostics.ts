import { NodeKind } from './nodes/specifications/specification-types';

export type ValidationSeverity = 'error' | 'warning' | 'info';

/**
 * 校验条目（P0-2 diagnostics 面）：nodeId 有值 = 面板行可点击跳转对应节点。
 * 内置校验器产出的条目带 code（面板按 code 走 i18n 文案）；宿主自定义条目
 * 直接给 message（面板原样展示）。
 */
export type ValidationEntry = {
  nodeId?: string;
  severity: ValidationSeverity;
  message: string;
  /** 校验器自定义码（MISSING_INPUT / EMPTY_EXPRESSION / EMPTY_RULES…） */
  code?: string;
};

/** 带输入端口的内建节点类——零输入连线即悬空（customNode 自定义端口拓扑，豁免） */
const REQUIRES_INPUT: readonly string[] = [
  NodeKind.DecisionTable,
  NodeKind.Function,
  NodeKind.Expression,
  NodeKind.Switch,
  NodeKind.Output,
];

/**
 * 内置缺省校验器（P0-2）：悬空输入连线（error）/ 表达式节点空表达式（error）/
 * 决策表零规则（warning）。纯函数，无 i18n——面板按 code 本地化。
 * 表达式语法错不在内置面（内核无 zen 解析器）——宿主经 diagnostics prop 追加。
 */
export const computeBuiltinDiagnostics = (graph: {
  nodes?: Array<{ id: string; type?: string; content?: unknown }>;
  edges?: Array<{ targetId?: string }>;
}): ValidationEntry[] => {
  const entries: ValidationEntry[] = [];
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const connectedTargets = new Set(edges.map((e) => e.targetId).filter(Boolean));

  for (const node of nodes) {
    if (REQUIRES_INPUT.includes(node.type ?? '') && !connectedTargets.has(node.id)) {
      entries.push({
        nodeId: node.id,
        severity: 'error',
        code: 'MISSING_INPUT',
        message: 'Node has no input connection',
      });
    }
  }

  for (const node of nodes) {
    if (node.type === NodeKind.Expression) {
      const expression = (node.content as { expression?: string } | undefined)?.expression;
      if (!expression || expression.trim().length === 0) {
        entries.push({
          nodeId: node.id,
          severity: 'error',
          code: 'EMPTY_EXPRESSION',
          message: 'Expression is empty',
        });
      }
    }
    if (node.type === NodeKind.DecisionTable) {
      const rules = (node.content as { rules?: unknown[] } | undefined)?.rules;
      if (!rules || rules.length === 0) {
        entries.push({
          nodeId: node.id,
          severity: 'warning',
          code: 'EMPTY_RULES',
          message: 'Decision table has no rules',
        });
      }
    }
  }

  return entries;
};
