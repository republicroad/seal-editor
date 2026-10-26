/**
 * 在 pretty-printed JSON 文本中定位字段路径所在行与值区间（供 Monaco 滚动定位 + 装饰高亮）。
 *
 * 逐行扫描跟踪键栈（2 空格缩进约定，与 JSON.stringify(., null, 2) 及格式化动作一致）；
 * 用户手改的 JSON5 形态找不到时返回 null（调用方静默跳过，不滚动不高亮）。
 */
export type JsonPathRange = {
  /** 1-based（Monaco 行号语义） */
  line: number;
  /** 1-based，含（Monaco 列语义）：值 token 起始 */
  startColumn: number;
  /** 1-based，排他：值 token 结束（尾逗号不计） */
  endColumn: number;
  /** 值为对象/数组开括号时无从 tokenize，整行高亮兜底 */
  wholeLine: boolean;
};

export const findJsonPathRange = (text: string, path: string): JsonPathRange | null => {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const stack: string[] = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    const indent = Math.round(raw.match(/^[ \t]*/)![0].length / 2);
    const content = raw.trim();
    if (!content) {
      continue;
    }
    if (content.startsWith('}') || content.startsWith(']')) {
      stack.length = Math.max(0, indent - 1);
      continue;
    }
    const keyMatch = content.match(/^"((?:[^"\\]|\\.)*)"\s*:\s*/);
    if (!keyMatch) {
      continue;
    }
    stack.length = Math.max(0, indent - 1);
    stack.push(keyMatch[1]);
    if (stack.length === segments.length && segments.every((segment, i) => stack[i] === segment)) {
      const valueStart = indent * 2 + keyMatch[0].length;
      const valueText = content.slice(keyMatch[0].length).replace(/,\s*$/, '');
      return {
        line: index + 1,
        startColumn: valueStart + 1,
        endColumn: valueStart + valueText.length + 1,
        wholeLine: valueText.length === 0 || /^[{[]/.test(valueText),
      };
    }
  }
  return null;
};
