/**
 * `$` 语义误用静态提示——zen-reference §1.5 总表（docs/design/zen-dollar-binding-matrix.md
 * 证据档）的编辑器面落地。纯词法分析：不求值、不做 AST，只识别可机械修复的形态，宁漏勿误报。
 *
 * 语义依据（2026-10-10 原生引擎六轮实证）：
 * - 表达式节点行：`$` = 行输出累积域；`$.<输入字段>` 是无效引用 → 该行被引擎**静默丢弃**；
 * - 裸名永远解析输入字段（行键同名不遮蔽裸名，但行输出覆盖输出同名键——同名三义）；
 * - 决策表全表达式单元（无 field 列）：`$` 完全未绑定，`$.field` 恒不命中，应写 `$root.` 或裸名。
 */

export type DollarHintKind = 'input-ref-via-dollar' | 'key-shadows-input';

export type ExpressionDollarHint = {
  kind: DollarHintKind;
  /** 涉及的输入字段名 */
  name: string;
  /** 命中位置（value 内的字符偏移，CM lint 定位用） */
  start: number;
  end: number;
  /** 命中的 `$.<path>` 原文（空白归一） */
  ref?: string;
  /** 修复建议：剥 `$.` 前缀的裸名路径 */
  suggestion?: string;
};

/** `$.a.b[0]` 形态的路径记号：首段标识符 + 可选后续导航（点/方括号） */
const DOLLAR_PATH_RE = /\$\.\s*([A-Za-z_$][\w$]*)((?:\s*\.\s*[A-Za-z_$][\w$]*|\s*\[[^\]]*\])*)/g;

/** `$.<ident>` 导航存在性（决策表单元哨兵用，含前导空白容忍） */
export const DOLLAR_NAV_RE = /\$\.\s*[A-Za-z_$][\w$]*/;

const normalizeWs = (text: string): string => text.replace(/\s+/g, '');

/**
 * C1：表达式行值里 `$.<name>` 引用输入字段（且非任何行键）→ 引擎静默丢行。
 * 修复建议 = 剥 `$.` 前缀的裸名路径。rowKeys 传全部行键（先行行的顺序敏感留给
 * 引擎，提示宁宽勿漏）；同名去重按首段名。
 */
export const analyzeExpressionValue = (
  value: string | null | undefined,
  options: { rowKeys: string[]; inputFieldNames: string[] },
): ExpressionDollarHint[] => {
  const hints: ExpressionDollarHint[] = [];
  if (!value) return hints;
  const seen = new Set<string>();
  for (const match of value.matchAll(DOLLAR_PATH_RE)) {
    const name = match[1]!;
    const rest = normalizeWs(match[2] ?? '');
    if (options.rowKeys.includes(name) || !options.inputFieldNames.includes(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    hints.push({
      kind: 'input-ref-via-dollar',
      name,
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
      ref: normalizeWs(match[0]),
      suggestion: `${name}${rest}`,
    });
  }
  return hints;
};

/**
 * C3：行键与顶层输入字段同名 → 裸名仍读输入、输出被行覆盖（同名三义 hazard）。
 * 只提示不阻断——同名写法本身合法。
 */
export const rowKeyShadowsInput = (key: string | null | undefined, inputFieldNames: string[]): boolean => {
  const trimmed = (key ?? '').trim();
  return trimmed.length > 0 && inputFieldNames.includes(trimmed);
};

/** C2 单元级判定：全表达式单元含 `$.` 导航（field 列 + unary 的 `$`=列值合法，不受此限）。 */
export const cellHasDollarNavigation = (cellValue: string | null | undefined): boolean =>
  typeof cellValue === 'string' && cellValue.trim().length > 0 && DOLLAR_NAV_RE.test(cellValue);

export type TableCellDollarNavHit = {
  ruleIndex: number;
  columnId: string;
  /** 单元原文截样（≤80 字符） */
  sample: string;
};

type FlatTableLike = {
  inputs?: { id?: string; field?: string | null }[];
  outputs?: { id?: string; field?: string | null }[];
  rules?: Record<string, unknown>[];
};

/**
 * C2 表级扫描：无 field 列（全表达式形态）的输入/输出单元里的 `$.` 导航清单。
 * field 列 + unary 单元不在扫描范围（该形态 `$`=列值，`$.` 是列值导航，合法）。
 */
export const findTableCellDollarNavigation = (
  decisionTable: FlatTableLike | null | undefined,
): TableCellDollarNavHit[] => {
  if (!decisionTable) return [];
  const navColumnIds = [...(decisionTable.inputs ?? []), ...(decisionTable.outputs ?? [])]
    .filter((column) => column?.id && !column.field)
    .map((column) => column.id!);
  if (navColumnIds.length === 0) return [];
  const hits: TableCellDollarNavHit[] = [];
  (decisionTable.rules ?? []).forEach((rule, ruleIndex) => {
    for (const columnId of navColumnIds) {
      const cell = rule?.[columnId];
      if (cellHasDollarNavigation(typeof cell === 'string' ? cell : undefined)) {
        hits.push({ ruleIndex, columnId, sample: String(cell).trim().slice(0, 80) });
      }
    }
  });
  return hits;
};
