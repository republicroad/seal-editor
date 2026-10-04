#!/usr/bin/env node
/**
 * $-形态 kwargs 扫描/迁移工具（ADR-016 OQ7 随档动作③配套，零依赖）。
 *
 * 背景：zen-udf 1.x kwargs 求值域不接通 dollar 作用域（jdm
 * packages/zen-udf/docs/dollar-scope-decision.md 立法）——值为 `$.` 前缀
 * 形态的实参恒 null。本工具供旧图导入前「先扫后导」：
 *
 *   node scripts/scan-dollar-form.mjs graph.json          # 扫描报告（发现即 exit 1）
 *   cat graph.json | node scripts/scan-dollar-form.mjs    # stdin 同上
 *   node scripts/scan-dollar-form.mjs graph.json --fix > migrated.json
 *
 * 检测语义与 kernel custom-function-schema 的 findDollarFormRows 同源：
 * 裸 `$.` 字符串 / expression·reference 信封内 `$.` 前缀——literal 信封
 * 原样绑定不检测（ADR-016 歧义根治语义）。--fix 迁移 = 剥 `$.` 前缀为
 * 裸路径（幂等；literal 信封不动）。
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

const collect = (graph) => {
  const findings = [];
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  for (const node of nodes) {
    const expressions = node?.content?.config?.expressions;
    if (!Array.isArray(expressions)) continue;
    for (const expr of expressions) {
      const value = expr?.value;
      const kwargs = value !== null && typeof value === 'object' && !Array.isArray(value) ? value.kwargs : undefined;
      if (kwargs !== null && typeof kwargs === 'object') {
        for (const [param, v] of Object.entries(kwargs)) {
          if (isDollarForm(v)) {
            findings.push({ node: node.id ?? node.name ?? '?', key: expr.key ?? '?', param, value: v });
          }
        }
      }
      if (Array.isArray(value)) {
        value.slice(1).forEach((v, index) => {
          if (isDollarForm(v)) {
            findings.push({
              node: node.id ?? node.name ?? '?',
              key: expr.key ?? '?',
              param: `#${index + 1}`,
              value: v,
            });
          }
        });
      }
    }
  }
  return findings;
};

const migrate = (graph) => {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    ...graph,
    nodes: nodes.map((node) => {
      const expressions = node?.content?.config?.expressions;
      if (!Array.isArray(expressions)) return node;
      return {
        ...node,
        content: {
          ...node.content,
          config: {
            ...node.content.config,
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
  console.error('usage: node scripts/scan-dollar-form.mjs <graph.json> [--fix]');
  process.exit(2);
}

let graph;
try {
  graph = JSON.parse(raw);
} catch (error) {
  console.error(`[scan] invalid JSON: ${error.message}`);
  process.exit(2);
}

const findings = collect(graph);

if (findings.length === 0) {
  console.error('[scan] clean — 无 $-形态 kwargs');
  process.exit(0);
}

for (const finding of findings) {
  const preview = typeof finding.value === 'string' ? finding.value : JSON.stringify(finding.value);
  console.error(`[scan] node=${finding.node} key=${finding.key} param=${finding.param}: ${preview.slice(0, 80)}`);
}
console.error(`[scan] ${findings.length} 处 $-形态 kwargs——导入前请迁移（--fix 输出改写后 JSON）`);

if (fix) {
  process.stdout.write(JSON.stringify(migrate(graph), null, 2));
  console.error('[scan] --fix 已输出改写后 JSON（stdout）');
}
process.exit(1);
