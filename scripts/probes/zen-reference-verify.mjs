import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { CORPUS_FILES as corpusFiles, kindOf, parseCorpusFile as parseCorpusFileIn } from '../zen-corpus.mjs';

/**
 * zen-reference 升级核查探针——docs/zen-reference.md §7 清单第 ①② 步的机械固化。
 *
 * 阶段 ① docs/graph 夹具全量断言：$ 语义哨兵（静默丢行 / $ 未绑定）+ 决策表
 *   hitPolicy（first|collect）/ $root 输入根 / $nodes 跨节点。
 * 阶段 ② zen-expression 回归语料抽验：默认确定性抽样（每 25 行取 1），
 *   `--full` 全量重放；`--corpus <dir>` 指定语料目录（默认取同级 jdm-editor 仓）。
 *
 * 比较/时区语义移植自 jdm-editor packages/zen-udf/src/expression-regression.runner.ts；
 * CSV 解析单源在 scripts/zen-corpus.mjs（探针与生成器共享）。引擎升级若上游
 * runner 语义变更，需对照同步。
 *
 * Usage: node scripts/probes/zen-reference-verify.mjs [--full] [--corpus <dir>]
 * Exit: 0 全绿（语料缺失降级为 SKIPPED 警告）；1 任一断言失败。
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const graphDir = path.join(root, 'docs', 'graph');
const defaultCorpus = path.join(root, '..', 'jdm-editor', 'packages', 'zen-udf', 'src', 'expression-regression');

const args = process.argv.slice(2);
const full = args.includes('--full');
const corpusArgIdx = args.indexOf('--corpus');
const corpusDir = corpusArgIdx >= 0 ? args[corpusArgIdx + 1] : defaultCorpus;

// 引擎解析：demo-server 直接依赖 @republicroad/zen-udf，其 pnpm 同级挂 @gorules/zen-engine
const kernelRequire = createRequire(path.join(root, 'packages', 'seal-editor', 'package.json'));
const demoRequire = createRequire(path.join(root, 'apps', 'demo-server', 'package.json'));
const JSON5 = kernelRequire('json5');
const zenUdfEntry = demoRequire.resolve('@republicroad/zen-udf');
const zenEngineModule = createRequire(zenUdfEntry)('@gorules/zen-engine');
const engine = new zenEngineModule.ZenEngine();

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`  ✗ ${msg}`);
};
const pass = (msg) => console.log(`  ✓ ${msg}`);

// ── 比较语义（移植自 jdm expression-regression.runner.ts；CSV 解析在 ../zen-corpus.mjs 单源共享）──────

const looseEqual = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') {
    return Object.is(a, b) || Math.abs(a - b) < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => looseEqual(item, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && looseEqual(a[k], b[k]));
  }
  return a === b;
};

const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;
const ISO_ZONED = /(?:Z|[+-]\d{2}:?\d{2})$/;
/** ISO 日期双通道比较：① 时刻相等 ② 墙钟相等（裸日期 zone 语义随环境） */
const compare = (actual, expected) => {
  if (looseEqual(actual, expected)) return true;
  const instantOf = (v) => {
    if (typeof v !== 'string' || !ISO_DATETIME.test(v) || !ISO_ZONED.test(v)) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  };
  const wall = (v) => (typeof v === 'string' && ISO_DATETIME.test(v) ? v.slice(0, 19).replace('T', ' ') : null);
  const ai = instantOf(actual);
  const ei = typeof expected === 'string' ? instantOf(expected) : null;
  if (ai !== null && ei !== null && ai === ei) return true;
  const aw = wall(actual);
  const ew = typeof expected === 'string' ? wall(expected) : null;
  return aw !== null && ew !== null && aw === ew;
};

/** 求值层时区探针（移植）：裸日期经字符串拼接渲染出带偏移的 ISO 串 */
const localZoneProbe = () => {
  try {
    const rendered = zenEngineModule.evaluateExpressionSync(`'x' + d('2023-10-15')`, {});
    return /([+-]\d{2}:\d{2}|Z)$/.exec(String(rendered))?.[1] ?? null;
  } catch {
    return null;
  }
};

/** 分歧台账（jdm expression-regression.divergences.json，单源于 jdm 仓）：
 * 仅当本机 zone 探针与校准戳一致时生效——命中行记 known-divergent 不计失败。
 * jdm 仓内台账在语料目录旁（src/），此处两处都探测。 */
const loadDivergences = () => {
  const candidates = [corpusDir, path.join(corpusDir, '..')];
  for (const dir of candidates) {
    const ledgerPath = path.join(dir, 'expression-regression.divergences.json');
    if (!existsSync(ledgerPath)) continue;
    try {
      const ledger = JSON.parse(readFileSync(ledgerPath, 'utf8'));
      const probe = localZoneProbe();
      return {
        map: new Map(Object.entries(ledger.divergences ?? {})),
        active: probe !== null && probe === ledger.calibratedZoneProbe,
        probe,
      };
    } catch {
      break;
    }
  }
  return { map: new Map(), active: false, probe: null };
};

// ── 阶段 ①：docs/graph 夹具 ───────────────────────────────────────────

const FIXTURES = [
  {
    file: 'expression-node-dollar-ref.json',
    input: { a: 1, b: 2 },
    expect: { a: 1, b: 2, c: 3, d: 4, g: 3 },
    pins: '$=行输出域（$.c=3）；$.<输入字段> 静默丢行（e 缺席）；裸名直引',
  },
  {
    file: 'expression-dollar-root-nodes.json',
    input: { a: 1 },
    expect: { a: 1, c: 3, r1: 1, r2: 6 },
    pins: '$root=节点输入根；$nodes.<名>.<字段> 跨节点引用',
  },
  {
    file: 'decision-table-dollar-policy.json',
    input: { a: 1 },
    expect: [{ r: 'c1' }, { r: 'c2' }],
    pins: 'hitPolicy first|collect；全表达式单元 $ 未绑定（哨兵）而 $root=输入根；$nodes 引先行表输出',
  },
];

const runFixtureStage = async () => {
  console.log('[zen-reference] 阶段 ①：docs/graph 夹具');
  for (const fx of FIXTURES) {
    const file = path.join(graphDir, fx.file);
    if (!existsSync(file)) {
      fail(`${fx.file} 夹具文件缺失`);
      continue;
    }
    try {
      const decision = engine.createDecision(JSON.parse(readFileSync(file, 'utf8')));
      const result = await decision.evaluate(fx.input);
      if (looseEqual(result.result, fx.expect)) {
        pass(`${fx.file} — ${fx.pins}`);
      } else {
        fail(`${fx.file}（${fx.pins}）got=${JSON.stringify(result.result)} want=${JSON.stringify(fx.expect)}`);
      }
    } catch (error) {
      fail(`${fx.file} 抛错: ${error.message.slice(0, 160)}`);
    }
  }
};

// ── 阶段 ②：回归语料抽验 ──────────────────────────────────────────────

const STRIDE = 25;
const runCorpusStage = async () => {
  console.log(`[zen-reference] 阶段 ②：回归语料${full ? '全量' : `抽验（每 ${STRIDE} 行取 1，--full 全量）`}`);
  if (!existsSync(corpusDir)) {
    console.warn(`  ⚠ SKIPPED：语料目录不存在 ${corpusDir}（--corpus 指定或检出同级 jdm-editor 仓后重跑）`);
    return;
  }
  const divergences = loadDivergences();
  if (divergences.active) {
    console.log(`  分歧台账生效（zone ${divergences.probe} 与校准戳一致）：命中行记 known-divergent`);
  }
  for (const file of corpusFiles) {
    const filePath = path.join(corpusDir, file);
    if (!existsSync(filePath)) {
      console.warn(`  ⚠ SKIPPED：${file} 不存在`);
      continue;
    }
    const { rows, skipped } = parseCorpusFileIn(corpusDir, file);
    const sampled = full ? rows : rows.filter((_, i) => i % STRIDE === 0);
    let ok = 0;
    let knownDivergent = 0;
    for (const row of sampled) {
      if (divergences.active && divergences.map.has(row.expression)) {
        knownDivergent++;
        continue;
      }
      try {
        const input = row.input ? JSON5.parse(row.input) : {};
        const actual =
          kindOf(file) === 'unary'
            ? zenEngineModule.evaluateUnaryExpressionSync(row.expression, input)
            : zenEngineModule.evaluateExpressionSync(row.expression, input);
        if (compare(actual, JSON5.parse(row.output))) {
          ok++;
        } else {
          fail(`${file}:${row.line} 「${row.expression}」 got=${JSON.stringify(actual)} want=${row.output}`);
        }
      } catch (error) {
        fail(`${file}:${row.line} 「${row.expression}」 threw: ${error.message.slice(0, 120)}`);
      }
    }
    const divergentNote = knownDivergent > 0 ? `，known-divergent ${knownDivergent}` : '';
    console.log(
      `  ${file}: ${ok}/${sampled.length - knownDivergent} pass（语料 ${rows.length} 行，跳过 ${skipped}${divergentNote}）`,
    );
  }
};

// ── 主流程 ────────────────────────────────────────────────────────────

const engineVersion = createRequire(zenUdfEntry)('@gorules/zen-engine/package.json').version;
let wasmVersion = 'n/a';
try {
  wasmVersion = kernelRequire('@gorules/zen-engine-wasm/package.json').version;
} catch {
  /* wasm 包不可用时不阻塞 */
}
console.log(`[zen-reference] 引擎口径：原生 @gorules/zen-engine ${engineVersion} · 运行面 wasm ${wasmVersion}`);

await runFixtureStage();
await runCorpusStage();

if (failures > 0) {
  console.error(`[zen-reference] ✗ ${failures} 项失败——若为引擎升级，对照 docs/zen-reference.md §6/§7 处置`);
  process.exit(1);
}
console.log('[zen-reference] ✓ 全绿');
