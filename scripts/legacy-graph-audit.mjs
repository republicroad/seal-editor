#!/usr/bin/env node
/**
 * legacy-graph-audit — 决策图遗留形态检测与迁移（零依赖，Node/Bun 皆可运行）。
 *
 * 出处：自 verdict 仓 scripts/legacy-graph-audit.mjs 整体移植（2026-10-02），
 * 规格文档同目录 legacy-graph-audit.md（verdict 侧同款）；检测/迁移语义镜像
 * 本仓 kernel findDollarFormRows / migrateDollarFormArgs / legacyValueToNamedCall
 * 与 zen-udf normalizeNamedCall（规格文档 §5 维护注记：任一侧语义演进须同步）。
 *
 * 背景：自定义函数节点表达式值已完成规范形收紧（{$call, kwargs} 具名字典 +
 * 可选 {mode,value} 信封）。存量图可能携带四类遗留形态：
 *
 *   LEGACY_BARE        value = 裸函数名字符串               → {$call: name, kwargs: {}}
 *   LEGACY_SEMICOLON   value 含 ';;'（位置参数串）           → {$call: first, kwargs: {$positional: rest}}
 *   LEGACY_POSITIONAL  value = 位置数组                      → {$call, kwargs: {$positional: 元素}}
 *   LEGACY_DOLLAR      kwargs 值 = '$.' 开头裸路径           → 剥前缀为裸路径
 *                      （standalone 求值域 $ 根不绑定，恒 null）
 *
 * 注意：位置数组 → 具名 kwargs 的声明序映射需要函数 schema；本工具无 schema
 * 时一律落 $positional 保留键（zen-udf normalizeNamedCall 同款语义），引擎侧
 * 可再归一。已在规范的值不动（幂等）。
 *
 * 用法：
 *   node scripts/legacy-graph-audit.mjs scan <输入...>    # 检测报告；发现即 exit 1（可作导入门禁）
 *   node scripts/legacy-graph-audit.mjs fix  <json 文件...> # 迁移改写（原文件备份 .bak）
 *   node scripts/legacy-graph-audit.mjs sql  <dump>        # 从 pg_dump 生成遗留行的 UPDATE 迁移 SQL（stdout）
 *
 * 输入：.json 图文件 / 目录（递归取 .json）/ .dump（PGDMP custom 格式，
 * zlib 启发式恢复 decision_model_version 行——免 pg 工具链）。
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// ---------- 遗留形态识别与迁移 ----------

const LEGACY_KINDS = {
  LEGACY_BARE: '裸函数名字符串',
  LEGACY_SEMICOLON: ';; 位置参数串',
  LEGACY_POSITIONAL: '位置数组',
  LEGACY_DOLLAR: 'kwargs $-路径（恒 null 陷阱）',
};

/** 拆一个表达式 value 的遗留形态；返回 kind 或 null（已规范/信封/空） */
function classifyValue(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return 'LEGACY_POSITIONAL';
  if (typeof value === 'object') {
    if (typeof value.$call === 'string') {
      // 具名调用：扫 kwargs 的 $-路径值（standalone 求值恒 null）
      const kwargs = value.kwargs;
      if (kwargs && typeof kwargs === 'object' && !Array.isArray(kwargs)) {
        for (const v of Object.values(kwargs)) {
          if (typeof v === 'string' && v.trim().startsWith('$')) return 'LEGACY_DOLLAR';
        }
      }
    }
    return null; // 信封或其它对象：不判遗留
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    if (trimmed.includes(';;')) return 'LEGACY_SEMICOLON';
    return 'LEGACY_BARE';
  }
  return null;
}

/** 迁移一个表达式 value（就地规范形；返回新值或原值） */
function migrateValue(value) {
  const kind = classifyValue(value);
  if (kind === null) return value;

  if (kind === 'LEGACY_BARE') {
    return { $call: value.trim(), kwargs: {} };
  }
  if (kind === 'LEGACY_SEMICOLON') {
    // 引号感知切分（与 kernel smartSplit 同语义：;; 不得出现在引号内）
    const parts = [];
    let current = '';
    let inQuote = false;
    let quote = '';
    for (let i = 0; i < value.length; i++) {
      const ch = value[i];
      if (ch === '"' || ch === "'") {
        if (inQuote && ch === quote) inQuote = false;
        else if (!inQuote) {
          inQuote = true;
          quote = ch;
        }
        current += ch;
        continue;
      }
      if (ch === ';' && value[i + 1] === ';' && !inQuote) {
        parts.push(current.trim());
        current = '';
        i += 1;
        continue;
      }
      current += ch;
    }
    parts.push(current.trim());
    const [name, ...args] = parts;
    return { $call: name, kwargs: { $positional: args } };
  }
  if (kind === 'LEGACY_POSITIONAL') {
    // 位置形态 = [函数名, ...实参]：首元素即 $call
    const [name, ...rest] = value;
    return { $call: name ?? '', kwargs: { $positional: rest } };
  }
  if (kind === 'LEGACY_DOLLAR') {
    const kwargs = {};
    for (const [k, v] of Object.entries(value.kwargs ?? {})) {
      kwargs[k] = typeof v === 'string' && v.trim().startsWith('$') ? v.trim().replace(/^\$\./, '') : v;
    }
    return { ...value, kwargs };
  }
  return value;
}

// ---------- 图遍历：收集/迁移 customNode expressions ----------

/** 深走图对象，收集 customNode 表达式值的 {kind, path, node} 引用 */
function collectFindings(node, findings, pathPrefix = '') {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => collectFindings(item, findings, `${pathPrefix}[${i}]`));
    return;
  }
  if (node.type === 'customNode' && node.content?.config?.expressions) {
    node.content.config.expressions.forEach((expr, i) => {
      const kind = classifyValue(expr?.value);
      if (kind) {
        findings.push({
          kind,
          path: `${pathPrefix}${pathPrefix ? '.' : ''}expressions[${i}]${expr?.key ? `(${expr.key})` : ''}`,
          nodeType: node.type,
          value: expr.value,
        });
      }
    });
  }
  for (const [key, value] of Object.entries(node)) {
    collectFindings(value, findings, pathPrefix ? `${pathPrefix}.${key}` : key);
  }
}

/** 就地迁移所有 customNode 表达式；返回迁移计数 */
function migrateGraphInPlace(node) {
  let migrated = 0;
  const walk = (obj) => {
    if (obj === null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) {
      obj.forEach(walk);
      return;
    }
    if (obj.type === 'customNode' && obj.content?.config?.expressions) {
      for (const expr of obj.content.config.expressions) {
        const before = JSON.stringify(expr?.value);
        const after = migrateValue(expr?.value);
        if (JSON.stringify(after) !== before) {
          expr.value = after;
          migrated += 1;
        }
      }
    }
    for (const value of Object.values(obj)) walk(value);
  };
  walk(node);
  return migrated;
}

// ---------- 输入收集 ----------

function collectJsonFiles(inputs, out = []) {
  for (const input of inputs) {
    const stat = fs.statSync(input);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(input)) {
        if (entry.endsWith('.json')) out.push(path.join(input, entry));
      }
    } else if (input.endsWith('.json')) {
      out.push(input);
    }
  }
  return out;
}

/** PGDMP custom 格式：逐偏移膨胀 zlib 块，回收含图 JSON 的文本 */
function recoverDumpTexts(dumpPath) {
  const buf = fs.readFileSync(dumpPath);
  const texts = [];
  for (let o = 0; o < buf.length - 2; o++) {
    if (buf[o] !== 0x78) continue;
    const low = buf[o + 1];
    if (!(low === 0x01 || low === 0x9c || low === 0xda || low === 0x5e || low === 0xbb)) continue;
    try {
      const out = zlib.inflateSync(buf.subarray(o));
      if (out.length > 40) {
        const text = out.toString('utf8');
        if (text.includes('"nodes"') || text.includes('"$call"')) texts.push(text);
        o += Math.min(out.length, 1024);
      }
    } catch {
      // 非流边界
    }
  }
  return texts;
}

/** 从恢复文本中提取 {modelId, revision, content} 行（decision_model_version COPY 形态） */
function recoverDumpRows(dumpPath) {
  const rows = [];
  for (const text of recoverDumpTexts(dumpPath)) {
    // COPY 行形态：modelId \t modelId(parent) \t revision \t {json} \t ...
    for (const line of text.split('\n')) {
      const jsonStart = line.indexOf('{"');
      if (jsonStart === -1) continue;
      const cols = line.slice(0, jsonStart).split('\t');
      if (cols.length < 3) continue;
      const jsonEnd = line.lastIndexOf('}');
      if (jsonEnd === -1) continue;
      try {
        const content = JSON.parse(line.slice(jsonStart, jsonEnd + 1));
        rows.push({ modelId: cols[0], revision: cols[2], content });
      } catch {
        // 截断行跳过
      }
    }
  }
  return rows;
}

// ---------- 主流程 ----------

function main() {
  const [command, ...inputs] = process.argv.slice(2);
  if (!command || inputs.length === 0) {
    console.error(
      [
        '用法:',
        '  legacy-graph-audit.mjs scan <输入...>     检测报告（发现遗留形态 exit 1，可作门禁）',
        '  legacy-graph-audit.mjs fix  <json 文件...> 迁移改写 JSON（.bak 备份原文件）',
        '  legacy-graph-audit.mjs sql  <dump>        从 pg_dump 生成遗留行 UPDATE SQL（stdout）',
        '',
        '输入: .json 图文件 / 目录 / .dump（PGDMP custom）',
      ].join('\n'),
    );
    process.exit(2);
  }

  if (command === 'sql') {
    const rows = recoverDumpRows(inputs[0]);
    const updates = [];
    for (const row of rows) {
      const findings = [];
      collectFindings(row.content, findings);
      if (findings.length === 0) continue;
      const migrated = structuredClone(row.content);
      const before = JSON.stringify(migrated);
      migrateGraphInPlace(migrated);
      if (JSON.stringify(migrated) === before) continue;
      const json = JSON.stringify(migrated).replaceAll("'", "''");
      updates.push(
        `UPDATE decision_model_version SET content = '${json}' WHERE model_id = '${row.modelId}' AND revision = ${Number(row.revision)};`,
      );
    }
    if (updates.length === 0) {
      console.log(`-- 无遗留形态行（共扫描 ${rows.length} 个版本）`);
    } else {
      console.log(`-- ${updates.length} 行含遗留形态，迁移 SQL 如下（执行前请备份并在测试库演练）`);
      console.log('-- 演练后核对语句：$positional 保留键可由 zen-udf normalizeNamedCall 按声明序二次归一');
      for (const sql of updates) console.log(sql + '\n');
    }
    return;
  }

  // scan / fix：文件输入
  const findings = [];
  const fileContents = [];
  for (const file of collectJsonFiles(command === 'fix' ? inputs : inputs)) {
    try {
      const content = JSON.parse(fs.readFileSync(file, 'utf8'));
      fileContents.push({ file, content });
      collectFindings(content, findings, file);
    } catch (e) {
      console.error(`[skip] ${file}: ${String(e).slice(0, 80)}`);
    }
  }

  if (command === 'fix') {
    let totalMigrated = 0;
    for (const { file, content } of fileContents) {
      const migrated = migrateGraphInPlace(content);
      if (migrated > 0) {
        fs.copyFileSync(file, file + '.bak');
        fs.writeFileSync(file, JSON.stringify(content, null, 2));
        console.log(`[fix] ${file}: ${migrated} 个表达式已迁移（原文件备份 .bak）`);
        totalMigrated += migrated;
      }
    }
    console.log(totalMigrated > 0 ? `[done] 共迁移 ${totalMigrated} 个表达式；重跑 scan 复核` : '[done] 无需迁移');
    return;
  }

  // scan 报告
  const byKind = {};
  for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1;
  console.log(`扫描 ${fileContents.length} 个图文件：${findings.length} 处遗留形态`);
  for (const [kind, count] of Object.entries(byKind)) {
    console.log(`  ${kind}（${LEGACY_KINDS[kind]}）: ${count}`);
    for (const f of findings.filter((x) => x.kind === kind)) {
      console.log(`    - ${f.path}`);
    }
  }
  if (findings.length > 0) {
    console.error('\n[audit] 发现遗留形态——迁移后重扫（fix 命令或人工复核）');
    process.exit(1);
  }
  console.log('[audit] 干净');
}

main();
