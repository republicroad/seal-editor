#!/usr/bin/env node
/**
 * 存量决策图遗留形态审计（ADR-015/016 OQ7 随档工具，零依赖）。
 *
 * 检测面：nodes[].content.config.expressions[].value 的四类遗留/规范形态
 * （ADR-015 §历史格式三层并存 + ADR-016 信封协议）：
 *
 *  - dollar-form   kwargs 值或位置数组元素为 `$.` 前缀字符串（含 expression/
 *                  reference 信封内 `$.` 前缀）——zen-udf 1.x 独立绑定恒 null，
 *                  --fix 自动剥前缀为裸路径（幂等；literal 信封不检测不改动）；
 *  - string-form   value 为早期字符串表达式（ADR-015 三层并存第一代，
 *                  `roster('acme', 1)` 形态）——无法机械转换，需手工迁移至
 *                  位置数组或具名字典；
 *  - expr-asts     节点 config 携带 expr_asts 派生结构（ADR-015：与位置数组
 *                  同构冗余，1.x 停写）——可安全删除；
 *  - typed envelope（literal/expression/reference 信封本体）= ADR-016 规范形，
 *                  不计遗留。
 *
 * 用法：
 *   node scripts/legacy-graph-audit.mjs graph.json            # 审计报告
 *   cat graph.json | node scripts/legacy-graph-audit.mjs      # stdin 同上
 *   node scripts/legacy-graph-audit.mjs graph.json --fix      # $-形态自动迁移（stdout）
 *   node scripts/legacy-graph-audit.mjs graph.json --json     # 审计结果 JSON（工具链集成）
 *
 * 退出码：0 = clean；1 = 有遗留发现（--fix 后 = 仍有不可自动迁移项）；2 = 用法/解析错误。
 *
 * 前身：scan-dollar-form.mjs（$-形态单面）——本脚本为其 consolidated 升格。
 */
import { readFileSync } from 'node:fs';

const TYPED_MODES = new Set(['literal', 'expression', 'reference']);

const isEnvelope = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 2 && keys.includes('mode') && keys.includes('value') && TYPED_MODES.has(String(value.mode));
};

const isDollarForm = (value) => {
  if (typeof value === 'string') return value.trim().startsWith('$.');
  if (isEnvelope(value)) {
    const mode = String(value.mode);
    return (mode === 'expression' || mode === 'reference') && typeof value.value === 'string'
      ? value.value.trim().startsWith('$.')
      : false;
  }
  return false;
};

const stripDollar = (value) => {
  if (typeof value === 'string' && value.trim().startsWith('$.')) return value.replace(/^\$\./, '');
  if (isEnvelope(value)) {
    const mode = String(value.mode);
    if (
      (mode === 'expression' || mode === 'reference') &&
      typeof value.value === 'string' &&
      value.value.trim().startsWith('$.')
    ) {
      return { ...value, value: value.value.replace(/^\$\./, '') };
    }
  }
  return value;
};

/** 单表达式审计：返回该 expression 的遗留发现（不含节点级 expr_asts）。 */
const auditExpression = (expr, nodeId) => {
  const findings = [];
  const key = expr?.key ?? '?';
  const value = expr?.value;

  if (typeof value === 'string') {
    findings.push({
      kind: 'string-form',
      node: nodeId,
      key,
      param: '(value)',
      value: value.slice(0, 80),
      autoFixable: false,
      note: '早期字符串表达式——手工迁移至位置数组或具名字典（ADR-015）',
    });
    return findings;
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value) && value.kwargs) {
    for (const [param, v] of Object.entries(value.kwargs)) {
      if (isDollarForm(v)) {
        findings.push({ kind: 'dollar-form', node: nodeId, key, param, value: v, autoFixable: true });
      }
    }
    return findings;
  }

  if (Array.isArray(value)) {
    value.slice(1).forEach((v, index) => {
      if (isDollarForm(v)) {
        findings.push({ kind: 'dollar-form', node: nodeId, key, param: `#${index + 1}`, value: v, autoFixable: true });
      }
    });
  }
  return findings;
};

/** 全图审计：$-形态（可自动迁移）+ string-form（手工）+ expr_asts（可删） */
const collect = (graph) => {
  const findings = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  for (const node of nodes) {
    const nodeId = node?.id ?? node?.name ?? '?';
    const config = node?.content?.config;
    if (config && typeof config === 'object' && Array.isArray(config.expr_asts)) {
      findings.push({
        kind: 'expr-asts',
        node: nodeId,
        key: '(config)',
        param: '(node)',
        value: `${config.expr_asts.length} 条派生结构`,
        autoFixable: false,
        note: 'ADR-015：与位置数组同构冗余，1.x 停写——可安全删除',
      });
    }
    const expressions = config?.expressions;
    if (!Array.isArray(expressions)) continue;
    for (const expr of expressions) {
      findings.push(...auditExpression(expr, nodeId));
    }
  }
  return findings;
};

/** --fix 迁移：仅 $-形态剥前缀（幂等；string-form/expr_asts 不动）。 */
const migrate = (graph) => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) => {
      const config = node?.content?.config;
      const cleanedConfig = config?.expr_asts ? { ...config, expr_asts: undefined } : config;
      const expressions = cleanedConfig?.expressions;
      if (!Array.isArray(expressions)) {
        return cleanedConfig === config ? node : { ...node, content: { ...node.content, config: cleanedConfig } };
      }
      return {
        ...node,
        content: {
          ...node.content,
          config: {
            ...cleanedConfig,
            expressions: expressions.map((expr) => {
              const value = expr?.value;
              if (value !== null && typeof value === 'object' && !Array.isArray(value) && value.kwargs) {
                return {
                  ...expr,
                  value: {
                    ...value,
                    kwargs: Object.fromEntries(Object.entries(value.kwargs).map(([k, v]) => [k, stripDollar(v)])),
                  },
                };
              }
              if (Array.isArray(value)) {
                return { ...expr, value: value.map((v, i) => (i === 0 ? v : stripDollar(v))) };
              }
              return expr;
            }),
          },
        },
      };
    }),
  };
};

const args = process.argv.slice(2);
const fix = args.includes('--fix');
const jsonOut = args.includes('--json');
const file = args.find((arg) => !arg.startsWith('--'));

let raw = '';
if (file) {
  raw = readFileSync(file, 'utf8');
} else if (!process.stdin.isTTY) {
  raw = await new Promise((resolve, reject) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
} else {
  console.error('usage: node scripts/legacy-graph-audit.mjs <graph.json> [--fix] [--json]');
  process.exit(2);
}

let graph;
try {
  graph = JSON.parse(raw);
} catch (error) {
  console.error(`[audit] invalid JSON: ${error.message}`);
  process.exit(2);
}

const findings = collect(graph);

if (jsonOut) {
  process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2));
  process.exit(findings.length > 0 ? 1 : 0);
}

if (findings.length === 0) {
  console.error('[audit] clean — 无遗留形态发现');
  process.exit(0);
}

const byKind = {};
for (const f of findings) {
  byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  const preview = typeof f.value === 'string' ? f.value : JSON.stringify(f.value);
  console.error(
    `[audit] ${f.kind} node=${f.node} key=${f.key} param=${f.param}: ${preview.slice(0, 80)}${f.note ? `\n         ↳ ${f.note}` : ''}`,
  );
}
console.error(
  `[audit] ${findings.length} 处遗留发现（${Object.entries(byKind)
    .map(([k, n]) => `${k}=${n}`)
    .join(', ')}）` + (fix ? '' : '——$-形态可 --fix 自动迁移；string-form/expr-asts 需手工'),
);

if (fix) {
  process.stdout.write(JSON.stringify(migrate(graph), null, 2));
  console.error('[audit] --fix 已输出改写后 JSON（stdout）');
}
process.exit(1);
