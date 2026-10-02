/**
 * Typed Input 信封展开（typed-input 规格 §2.1 存储协议的执行边界半边）：
 * 编辑器写入的非字面量参数值带 {mode, value} 信封（字面量恒为裸值），
 * 引擎只认裸值/表达式串——模型进门时统一展开，零 zen-udf 改动
 * （custom-node-editor-spec §5 推荐起步方式）。
 */

const TYPED_MODES = new Set(['literal', 'expression', 'reference']);

/** 窄识别：自有键恰为 {mode, value} 且 mode 合法才视作信封（降低误伤普通数据的概率） */
const isTypedValueEnvelope = (value: unknown): value is { mode: string; value: unknown } => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value as Record<string, unknown>);
  if (keys.length !== 2 || !keys.includes('mode') || !keys.includes('value')) return false;
  return TYPED_MODES.has(String((value as Record<string, unknown>).mode));
};

const expand = (node: unknown): unknown => {
  // 信封整体替换，不深入（typed-input 规格 §5：嵌套 TypedValue 明确不做）
  if (isTypedValueEnvelope(node)) {
    return node.value;
  }
  if (Array.isArray(node)) {
    return node.map(expand);
  }
  if (node !== null && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      out[key] = expand(value);
    }
    return out;
  }
  return node;
};

/**
 * 深度展开模型中的 TypedValue 信封（纯函数，返回新结构）。
 * 信封可能出现在 customNode config.expressions 的 kwargs / 位置 args 任意层，
 * 通用深走比按节点类型窄走更稳（pack 自有结构不设限——config = z.any() 公理）。
 */
export const expandTypedValues = <T>(model: T): T => expand(model) as T;
