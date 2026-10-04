import type { CustomNodeExpression } from './custom-node-types';
import { parseOperatorArgs, unquote } from './http-request-protocol';

export const CRYPTO_UDF = 'crypto';

export const CRYPTO_ALGORITHMS = ['md5', 'sha1', 'sha256', 'sha512'] as const;
export type CryptoAlgorithm = (typeof CRYPTO_ALGORITHMS)[number];

export const CRYPTO_ENCODINGS = ['hex', 'base64', 'base64url'] as const;
export type CryptoEncoding = (typeof CRYPTO_ENCODINGS)[number];

export interface CryptoFields {
  inputExpr: string;
  algorithm: CryptoAlgorithm;
  secretExpr: string;
  encoding: CryptoEncoding;
  upperExpr: string;
}

export type CryptoMode = 'plain' | 'hmac';

/** 密钥槽位非空即 HMAC(旧图兼容的隐式约定) */
export const deriveCryptoMode = (secretExpr: string): CryptoMode => (secretExpr.trim() !== '' ? 'hmac' : 'plain');

/** 显式模式归一：普通摘要强制清空密钥槽位，HMAC 保留原表达式 */
export const applyCryptoMode = (fields: CryptoFields, mode: CryptoMode): CryptoFields => ({
  ...fields,
  secretExpr: mode === 'plain' ? '' : fields.secretExpr,
});

export const normalizeAlgorithm = (value: string): CryptoAlgorithm => {
  const lowered = value.trim().toLowerCase();
  return (CRYPTO_ALGORITHMS as readonly string[]).includes(lowered) ? (lowered as CryptoAlgorithm) : 'sha256';
};

export const normalizeEncoding = (value: string): CryptoEncoding => {
  const lowered = value.trim().toLowerCase();
  return (CRYPTO_ENCODINGS as readonly string[]).includes(lowered) ? (lowered as CryptoEncoding) : 'hex';
};

/** upper 槽位仅接受布尔字面量 true(其余一律视为未勾选) */
export const isUpperChecked = (expr: string): boolean => expr.trim() === 'true';

export const parseCrypto = (expr?: CustomNodeExpression): CryptoFields => {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
  // 具名形（规范形写路径，ADR-015/016）：kwargs 直读——信封解一层取表达式串，
  // 缺省尾参回退默认（可选语义由具名天然承载）
  if (expr && typeof expr.value === 'object' && !Array.isArray(expr.value) && isRecord(expr.value.kwargs)) {
    const kwargs = expr.value.kwargs as Record<string, unknown>;
    const readExpr = (key: string): string => {
      const v = kwargs[key];
      if (v === null || v === undefined) return '';
      if (typeof v === 'object' && !Array.isArray(v) && 'value' in v) {
        return String((v as Record<string, unknown>).value);
      }
      return String(v);
    };
    return {
      inputExpr: readExpr('input'),
      algorithm: normalizeAlgorithm(readExpr('algorithm')),
      secretExpr: readExpr('secret'),
      encoding: normalizeEncoding(readExpr('encoding')),
      upperExpr: readExpr('upper'),
    };
  }

  // 旧形态：位置数组 / ;; 串（存量图永久兼容）
  const args =
    expr && (typeof expr.value !== 'object' || Array.isArray(expr.value)) ? parseOperatorArgs(expr.value) : [];
  return {
    inputExpr: args[1] ?? '',
    algorithm: normalizeAlgorithm(unquote(args[2] ?? '')),
    secretExpr: args[3] ?? '',
    encoding: normalizeEncoding(unquote(args[4] ?? '')),
    upperExpr: args[5] ?? '',
  };
};

/**
 * 规范形写器（ADR-015/016）：具名 kwargs + literal 信封（algorithm/encoding
 * 引号仪式退役）。可选尾参（secret/encoding/upper）空则省键；
 * upper 由 UI 布尔开关产出 'true'/'' 表达式串。
 */
export const toCryptoValue = (fields: CryptoFields): CustomNodeExpression['value'] => {
  const kwargs: Record<string, string | { mode: 'literal'; value: string }> = {
    input: fields.inputExpr,
    algorithm: { mode: 'literal', value: fields.algorithm },
  };
  if (fields.secretExpr.trim()) kwargs.secret = fields.secretExpr;
  if (fields.encoding.trim()) kwargs.encoding = { mode: 'literal', value: fields.encoding };
  if (fields.upperExpr.trim()) kwargs.upper = fields.upperExpr;
  return { $call: CRYPTO_UDF, kwargs };
};
