import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * zen-expression 回归语料解析（单一事实源）——语义移植自 jdm-editor
 * packages/zen-udf/src/expression-regression.runner.ts；zen-reference-verify
 * 探针与 gen-zen-function-reference 生成器共用，勿在两处各抄一份。
 */

export const CORPUS_FILES = ['standard.csv', 'date.csv', 'unary.csv'];
export const kindOf = (file) => (file === 'unary.csv' ? 'unary' : 'standard');

/** RFC 风格 ';' 分割：双引号包裹字段（"" 转义），非引号字段内引号按字面量 */
export const splitCsvLine = (raw) => {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' && current.length === 0) {
      inQuotes = true;
      continue;
    }
    if (ch === ';') {
      fields.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
};

/** 语料文本 → 断言行（首行 header 跳过；`#` 分节注释跳过；非 3 字段行静默跳过） */
export const parseCorpusText = (text) => {
  const rows = [];
  let skipped = 0;
  text.split(/\r?\n/).forEach((raw, index) => {
    if (index === 0 && raw.startsWith('expression (string)')) return;
    const fields = splitCsvLine(raw);
    if (fields.length !== 3) {
      skipped++;
      return;
    }
    const [expression = '', input = '', output = ''] = fields;
    if (expression.trim().startsWith('#')) return;
    rows.push({
      line: index + 1,
      expression: expression.trim(),
      input: input.trim(),
      output: output.trim(),
    });
  });
  return { rows, skipped };
};

export const parseCorpusFile = (corpusDir, file) => parseCorpusText(readFileSync(join(corpusDir, file), 'utf8'));
