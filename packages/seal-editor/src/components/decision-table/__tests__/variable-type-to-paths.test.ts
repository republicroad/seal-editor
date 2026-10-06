import { describe, expect, it } from 'vitest';

import { variableTypeToPaths } from '../../../helpers/components';

// 鸭子类型喂 toJson() 形状（等价 VariableType.toJson() 输出；测试免 wasm 装载）
const fakeVT = (json: unknown) => ({ toJson: () => json });

describe('variableTypeToPaths（dt 字段绑定浏览选择器的字段源）', () => {
  it('Object 树展平为点路径（父先于子）', () => {
    const vt = fakeVT({
      Object: {
        customer: { Object: { tier: { String: null } } },
        id: { Integer: null },
      },
    });
    expect(variableTypeToPaths(vt)).toEqual(['customer', 'customer.tier', 'id']);
  });

  it('非对象根得空清单；空入参安全', () => {
    expect(variableTypeToPaths(fakeVT({ String: null }))).toEqual([]);
    expect(variableTypeToPaths(undefined)).toEqual([]);
    expect(variableTypeToPaths(null)).toEqual([]);
  });
});
