import { describe, expect, test } from 'vitest';

import {
  applyCryptoMode,
  deriveCryptoMode,
  normalizeAlgorithm,
  normalizeEncoding,
  parseCrypto,
  toCryptoValue,
} from '../crypto-protocol';

const exprOf = (value: unknown[]) => ({ id: 'n1', value }) as never;

describe('normalizeAlgorithm / normalizeEncoding', () => {
  test('合法值大小写归一', () => {
    expect(normalizeAlgorithm(' MD5 ')).toBe('md5');
    expect(normalizeEncoding('Base64URL')).toBe('base64url');
  });

  test('非法值回退默认', () => {
    expect(normalizeAlgorithm('')).toBe('sha256');
    expect(normalizeAlgorithm('sm3')).toBe('sha256');
    expect(normalizeEncoding('rot13')).toBe('hex');
  });
});

describe('parseCrypto / toCryptoValue 规范形（具名 kwargs + literal 信封）', () => {
  const lit = (value: string) => ({ mode: 'literal', value });

  test('写器：尾空省键（可选语义由具名承载，无位置占位）', () => {
    const base = { inputExpr: 'x', algorithm: 'sha256' as const, secretExpr: '', encoding: 'hex' as const };
    expect(toCryptoValue({ ...base, upperExpr: '' })).toEqual({
      $call: 'crypto',
      kwargs: { input: 'x', algorithm: lit('sha256'), encoding: lit('hex') },
    });
    expect(
      (toCryptoValue({ ...base, secretExpr: 'env.KEY', encoding: 'base64url', upperExpr: '' }) as any).kwargs,
    ).toEqual({
      input: 'x',
      algorithm: lit('sha256'),
      secret: 'env.KEY',
      encoding: lit('base64url'),
    });
    expect((toCryptoValue({ ...base, secretExpr: '', encoding: 'hex', upperExpr: 'true' }) as any).kwargs).toEqual({
      input: 'x',
      algorithm: lit('sha256'),
      encoding: lit('hex'),
      upper: 'true',
    });
  });

  test('写器：algorithm/encoding 恒 literal 信封（引号仪式退役）', () => {
    const value = toCryptoValue({
      inputExpr: '$.text',
      algorithm: 'sha256',
      secretExpr: '',
      encoding: 'hex',
      upperExpr: '',
    });
    expect((value as any).kwargs.algorithm).toEqual({ mode: 'literal', value: 'sha256' });
    expect((value as any).kwargs.encoding).toEqual({ mode: 'literal', value: 'hex' });
  });

  test('parse→serialize 幂等（具名域稳定）+ legacy 解析后序列化归一具名形', () => {
    const named = {
      $call: 'crypto',
      kwargs: { input: 'input.raw', algorithm: lit('sha1'), secret: '"k"', encoding: lit('base64'), upper: 'true' },
    };
    // 具名域幂等
    expect(toCryptoValue(parseCrypto({ value: named } as never))).toEqual(named);
    // legacy 位置数组解析 → 序列化归一具名形（首次编辑迁移语义）
    const legacy = exprOf(['crypto', 'input.raw', '"sha1"', '"k"', '"base64"', 'true']);
    expect(toCryptoValue(parseCrypto(legacy))).toEqual(named);
  });

  test('空表达式安全解析', () => {
    expect(toCryptoValue(parseCrypto(undefined))).toEqual({
      $call: 'crypto',
      kwargs: { input: '', algorithm: lit('sha256'), encoding: lit('hex') },
    });
  });
});

describe('deriveCryptoMode / applyCryptoMode', () => {
  test('密钥非空推导 HMAC，空推导普通摘要', () => {
    expect(deriveCryptoMode('env.KEY')).toBe('hmac');
    expect(deriveCryptoMode('  ')).toBe('plain');
    expect(deriveCryptoMode('')).toBe('plain');
  });

  test('切回普通摘要强制清空密钥槽位', () => {
    const hmacFields = {
      inputExpr: 'x',
      algorithm: 'sha256' as const,
      secretExpr: 'env.KEY',
      encoding: 'hex' as const,
      upperExpr: '',
    };
    expect(applyCryptoMode(hmacFields, 'plain').secretExpr).toBe('');
    expect(applyCryptoMode(hmacFields, 'hmac').secretExpr).toBe('env.KEY');
  });

  test('模式归一后序列化与旧图兼容', () => {
    const fields = parseCrypto(exprOf(['crypto', 'x', '"md5"', '"k"', '"hex"']));
    expect(deriveCryptoMode(fields.secretExpr)).toBe('hmac');
    const cleared = applyCryptoMode(fields, 'plain');
    expect((toCryptoValue(cleared) as any).kwargs).toEqual({
      input: 'x',
      algorithm: { mode: 'literal', value: 'md5' },
      encoding: { mode: 'literal', value: 'hex' },
    });
  });
});

describe('parseCrypto / toCryptoValue 规范形（具名 kwargs + literal 信封）', () => {
  test('写器产出具名 kwargs（algorithm/encoding = literal 信封；空尾参省键）', () => {
    const value = toCryptoValue({
      inputExpr: '$.text',
      algorithm: 'sha256',
      secretExpr: '',
      encoding: 'hex',
      upperExpr: '',
    });
    expect(value).toEqual({
      $call: 'crypto',
      kwargs: {
        input: '$.text',
        algorithm: { mode: 'literal', value: 'sha256' },
        encoding: { mode: 'literal', value: 'hex' },
      },
    });
  });

  test('双读：具名形回填字段；非字符串参数值解信封', () => {
    const fields = parseCrypto({
      id: 'n1',
      key: 'k1',
      value: {
        $call: 'crypto',
        kwargs: {
          input: { mode: 'expression', value: '$.text' },
          algorithm: { mode: 'literal', value: 'md5' },
          upper: 'true',
        },
      },
    });
    expect(fields).toEqual({
      inputExpr: '$.text',
      algorithm: 'md5',
      secretExpr: '',
      encoding: 'hex',
      upperExpr: 'true',
    });
  });
});
