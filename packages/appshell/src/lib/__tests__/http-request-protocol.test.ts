import { describe, expect, test } from 'vitest';

import {
  EMPTY_AUTH,
  normalizeMethod,
  parseAuthState,
  parseHttpRequest,
  parseObjectLiteralRows,
  parseOperatorArgs,
  quote,
  serializeAuthExpr,
  serializeObjectLiteralRows,
  toHttpRequestValue,
  unquote,
} from '../http-request-protocol';

describe('quote/unquote', () => {
  test('round-trip', () => {
    expect(unquote(quote('hello world'))).toBe('hello world');
    expect(unquote(quote(''))).toBe('');
  });

  test('unquote 非双引号原样返回(trim)', () => {
    expect(unquote('  plain  ')).toBe('plain');
    expect(unquote("'single'")).toBe("'single'");
  });
});

describe('parseOperatorArgs', () => {
  test('数组输入仅 trim', () => {
    expect(parseOperatorArgs([' a ', 'b'])).toEqual(['a', 'b']);
  });

  test('旧 ;; 字符串按引号感知切分', () => {
    expect(parseOperatorArgs('a;;"x;;y";;c')).toEqual(['a', '"x;;y"', 'c']);
    expect(parseOperatorArgs("url;;'GET'")).toEqual(['url', "'GET'"]);
  });
});

describe('normalizeMethod', () => {
  test('合法方法大小写与空白归一', () => {
    expect(normalizeMethod(' get ')).toBe('GET');
    expect(normalizeMethod('"post"')).toBe('GET');
    expect(normalizeMethod('PATCH')).toBe('PATCH');
  });

  test('非法回退 GET', () => {
    expect(normalizeMethod('')).toBe('GET');
    expect(normalizeMethod('TRACE')).toBe('GET');
  });
});

describe('parseHttpRequest / toHttpRequestValue 具名 kwargs', () => {
  test('双读：具名形回填全部字段', () => {
    const fields = parseHttpRequest({
      id: 'n1',
      key: 'k1',
      value: {
        $call: 'http_request',
        kwargs: {
          url: 'urlExpr',
          method: { mode: 'literal', value: 'POST' },
          headers: '{ a: 1 }',
          body: '$.payload',
          params: '{ p: 1 }',
          timeout: '5000',
          retry: '2',
          auth: '{ type: "basic" }',
        },
      },
    });
    expect(fields.urlExpr).toBe('urlExpr');
    expect(fields.method).toBe('POST');
    expect(fields.headersExpr).toBe('{ a: 1 }');
    expect(fields.paramsExpr).toBe('{ p: 1 }');
    expect(fields.timeoutExpr).toBe('5000');
    expect(fields.retryExpr).toBe('2');
    expect(fields.authExpr).toBe('{ type: "basic" }');
  });

  test('可选尾参缺省回退空串', () => {
    const fields = parseHttpRequest({
      id: 'n1',
      key: 'k1',
      value: { $call: 'http_request', kwargs: { url: 'u', method: { mode: 'literal', value: 'GET' } } },
    });
    expect(fields.method).toBe('GET');
    expect(fields.paramsExpr).toBe('');
    expect(fields.authExpr).toBe('');
  });

  test('写器：尾空省键（可选语义由具名承载，无位置占位）；method = literal 信封', () => {
    const base = { urlExpr: 'u', method: 'GET' as const, headersExpr: '', bodyExpr: '' };
    expect(toHttpRequestValue({ ...base, paramsExpr: '', timeoutExpr: '', retryExpr: '', authExpr: '' })).toEqual({
      $call: 'http_request',
      kwargs: { url: 'u', method: { mode: 'literal', value: 'GET' }, headers: '', body: '' },
    });
    expect(
      (toHttpRequestValue({ ...base, paramsExpr: '', timeoutExpr: '5000', retryExpr: '', authExpr: '' }) as any).kwargs,
    ).toEqual({
      url: 'u',
      method: { mode: 'literal', value: 'GET' },
      headers: '',
      body: '',
      timeout: '5000',
    });
    expect(
      (
        toHttpRequestValue({
          ...base,
          paramsExpr: '{ q: 1 }',
          timeoutExpr: '',
          retryExpr: '1',
          authExpr: '{ type: "bearer", token: t }',
        }) as any
      ).kwargs,
    ).toEqual({
      url: 'u',
      method: { mode: 'literal', value: 'GET' },
      headers: '',
      body: '',
      params: '{ q: 1 }',
      retry: '1',
      auth: '{ type: "bearer", token: t }',
    });
  });

  test('parse→serialize 幂等（具名域稳定）', () => {
    const named = {
      $call: 'http_request',
      kwargs: {
        url: 'u',
        method: { mode: 'literal', value: 'DELETE' },
        headers: '{ h: 1 }',
        body: 'body',
        params: '{ p: 2 }',
        timeout: '1000',
      },
    };
    expect(toHttpRequestValue(parseHttpRequest({ value: named } as never))).toEqual(named);
  });
});

describe('parseObjectLiteralRows / serializeObjectLiteralRows', () => {
  test('裸键、带引号键、嵌套值拆行', () => {
    const rows = parseObjectLiteralRows('{ "Content-Type": v, "X-A": "a, b", nested: { k: 1, j: 2 } }');
    expect(rows).toEqual([
      { key: 'Content-Type', valueExpr: 'v' },
      { key: 'X-A', valueExpr: '"a, b"' },
      { key: 'nested', valueExpr: '{ k: 1, j: 2 }' },
    ]);
  });

  test('裸键含非法字符整体解析失败', () => {
    expect(parseObjectLiteralRows('{ Content-Type: v }')).toBeNull();
  });

  test('空表达式为空数组；非对象字面量为 null', () => {
    expect(parseObjectLiteralRows('')).toEqual([]);
    expect(parseObjectLiteralRows('   ')).toEqual([]);
    expect(parseObjectLiteralRows('headers.someProp')).toBeNull();
    expect(parseObjectLiteralRows('[1, 2]')).toBeNull();
  });

  test('serialize 跳过全空行；全空为空串', () => {
    expect(
      serializeObjectLiteralRows([
        { key: '', valueExpr: '' },
        { key: 'k', valueExpr: 'v' },
      ]),
    ).toBe('{ k: v }');
    expect(serializeObjectLiteralRows([])).toBe('');
  });

  test('非标识符键序列化加引号，往返一致', () => {
    const rows = [{ key: 'X-Custom Key', valueExpr: 'v' }];
    const serialized = serializeObjectLiteralRows(rows);
    expect(serialized).toBe('{ "X-Custom Key": v }');
    expect(parseObjectLiteralRows(serialized)).toEqual(rows);
  });
});

describe('parseAuthState / serializeAuthExpr', () => {
  test('空表达式为 none 默认态', () => {
    expect(parseAuthState('')).toEqual(EMPTY_AUTH);
  });

  test('basic 完整往返', () => {
    const state = { mode: 'basic' as const, username: 'user', passwordExpr: 'env.PASS', tokenExpr: '' };
    const serialized = serializeAuthExpr(state);
    expect(serialized).toContain('type: "basic"');
    expect(parseAuthState(serialized)).toEqual(state);
  });

  test('basic 无凭据最小形态可解析', () => {
    expect(parseAuthState('{ type: "basic" }')).toEqual({
      mode: 'basic',
      username: '',
      passwordExpr: '',
      tokenExpr: '',
    });
  });

  test('bearer token 表达式原样保留', () => {
    const state = { mode: 'bearer' as const, username: '', passwordExpr: '', tokenExpr: 'headers.token' };
    const serialized = serializeAuthExpr(state);
    expect(serialized).toBe('{ type: "bearer", token: headers.token }');
    expect(parseAuthState(serialized)).toEqual(state);
  });

  test('未知模式或非对象字面量为 null', () => {
    expect(parseAuthState("{ type: 'digest' }")).toBeNull();
    expect(parseAuthState('someAuthConfig')).toBeNull();
  });

  test('单引号 type 值无法解析为 null（unquote 只处理双引号）', () => {
    expect(parseAuthState("{ type: 'basic' }")).toBeNull();
  });

  test('none 序列化为空串', () => {
    expect(serializeAuthExpr(EMPTY_AUTH)).toBe('');
  });
});

describe('parseHttpRequest / toHttpRequestValue 规范形（具名 kwargs + literal 信封）', () => {
  test('写器产出具名 kwargs（method = literal 信封；空尾参省键）', () => {
    const value = toHttpRequestValue({
      urlExpr: '$.endpoint',
      method: 'POST',
      headersExpr: '{ "X": "1" }',
      bodyExpr: '$.body',
      paramsExpr: '',
      timeoutExpr: '',
      retryExpr: '',
      authExpr: '',
    });
    expect(value).toEqual({
      $call: 'http_request',
      kwargs: {
        url: '$.endpoint',
        method: { mode: 'literal', value: 'POST' },
        headers: '{ "X": "1" }',
        body: '$.body',
      },
    });
  });

  test('双读：具名形回填字段；非字符串参数值解信封', () => {
    const fields = parseHttpRequest({
      id: 'n1',
      key: 'k1',
      value: {
        $call: 'http_request',
        kwargs: {
          url: { mode: 'expression', value: '$.endpoint' },
          method: { mode: 'literal', value: 'GET' },
          timeout: '3000',
        },
      },
    });
    expect(fields).toEqual({
      urlExpr: '$.endpoint',
      method: 'GET',
      headersExpr: '',
      bodyExpr: '',
      paramsExpr: '',
      timeoutExpr: '3000',
      retryExpr: '',
      authExpr: '',
    });
  });
});
