/**
 * Typed Input expression 信封展开（typed-input 规格 §2.1 + ADR-016 OQ6 实证收敛）：
 * zen-udf 1.1.0 已原生识别 literal / reference 信封（实证 2026-10-04：
 * literal 原样绑定 ✓ / reference 按 $.path 解析 ✓ / expression 未拆包 ✗）——
 * 本展开器**仅处理 expression 信封**（拆成裸表达式串，≡ 裸值语义）；
 * literal / reference 信封**原样透传**给引擎原生绑定——早前全模式展开在
 * 1.1.0 下反而有害（会把引擎已正确绑定的字面量剥成裸值，重新踩
 * 「长得像表达式的字面量」歧义坑）。
 */
import { readFileSync } from 'node:fs';

const TYPED_MODES = new Set(['literal', 'expression', 'reference']);

/**
 * 运行时版本断言（ADR-016 评审补充发现 1）：Typed Input 信封语义要求引擎
 * ≥ 1.1.0（literal/reference 原生拆包）——低版本引擎拿到 literal 信封会静默
 * 求值出错。demo-server 启动时 fail fast；其他宿主执行存图前应做同款断言。
 */
export const assertZenUdfEnvelopeSupport = (installedVersion: string): void => {
  const [major, minor] = installedVersion.split('.').map(Number);
  if (!(major > 1 || (major === 1 && minor >= 1))) {
    throw new Error(
      `[typed-values] zen-udf >= 1.1.0 required for Typed Input envelope semantics; found ${installedVersion}`,
    );
  }
};

/** 读取本包安装的 zen-udf 版本（bun/node 的 node_modules 解析，src 相对上探一层） */
export const installedZenUdfVersion = (): string => {
  const url = new URL('../node_modules/@republicroad/zen-udf/package.json', import.meta.url);
  return String((JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version);
};

const expand = (node: unknown): unknown => {
  // 仅 expression 信封需要拆（引擎未实现）；literal/reference 引擎原生，透传
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    const record = node as Record<string, unknown>;
    const keys = Object.keys(record);
    if (
      keys.length === 2 &&
      keys.includes('mode') &&
      keys.includes('value') &&
      record.mode === 'expression' &&
      TYPED_MODES.has(String(record.mode))
    ) {
      return record.value;
    }
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
 * 深度展开模型中的 expression 信封（纯函数，返回新结构）。
 * 信封可能出现在 customNode config.expressions 的 kwargs / 位置 args 任意层，
 * 通用深走比按节点类型窄走更稳（pack 自有结构不设限——config = z.any() 公理）。
 * literal / reference 信封透传（zen-udf 1.1.0 原生绑定）。
 */
export const expandTypedValues = <T>(model: T): T => expand(model) as T;
