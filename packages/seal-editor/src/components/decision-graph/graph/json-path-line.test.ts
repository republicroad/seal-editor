import { describe, expect, it } from 'vitest';

import { findJsonPathRange } from './json-path-line';

const pretty = JSON.stringify(
  {
    customer: { country: 'US', tier: 'GOLD' },
    cart: { weight: 50 },
  },
  null,
  2,
);

describe('findJsonPathRange', () => {
  it('定位叶子标量值区间（不含尾逗号）', () => {
    const range = findJsonPathRange(pretty, 'customer.country');
    expect(range).toEqual({
      line: 3,
      startColumn: pretty.split('\n')[2].indexOf('"US"') + 1,
      endColumn: pretty.split('\n')[2].indexOf('"US"') + 1 + '"US"'.length,
      wholeLine: false,
    });
  });

  it('定位顶层叶子', () => {
    const range = findJsonPathRange('{\n  "count": 3\n}', 'count');
    expect(range).toEqual({ line: 2, startColumn: 12, endColumn: 13, wholeLine: false });
  });

  it('对象值整行高亮兜底（wholeLine）', () => {
    const range = findJsonPathRange(pretty, 'customer');
    expect(range?.line).toBe(2);
    expect(range?.wholeLine).toBe(true);
  });

  it('数组值同样整行兜底', () => {
    const range = findJsonPathRange('{\n  "tags": [\n    "a"\n  ]\n}', 'tags');
    expect(range?.wholeLine).toBe(true);
  });

  it('深层嵌套与兄弟键不串扰', () => {
    const range = findJsonPathRange(pretty, 'cart.weight');
    expect(range?.line).toBe(7);
    expect(pretty.split('\n')[6]).toContain('50');
  });

  it('缺失路径返回 null', () => {
    expect(findJsonPathRange(pretty, 'customer.missing')).toBeNull();
    expect(findJsonPathRange(pretty, 'nope')).toBeNull();
  });

  it('空路径返回 null', () => {
    expect(findJsonPathRange(pretty, '')).toBeNull();
    expect(findJsonPathRange(pretty, '..')).toBeNull();
  });

  it('null 值与 false 值也定位', () => {
    const text = JSON.stringify({ flags: { dark: false, extra: null } }, null, 2);
    expect(findJsonPathRange(text, 'flags.dark')?.line).toBe(3);
    expect(findJsonPathRange(text, 'flags.extra')?.line).toBe(4);
  });
});
