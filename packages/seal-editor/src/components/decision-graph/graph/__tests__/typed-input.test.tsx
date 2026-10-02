// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TypedInput } from '../typed-input';
import type { TypedValue } from '../typed-input';

// Base UI Select 依赖 jsdom 未实现的 PointerEvent API（primitives.test.tsx 同款）
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const openDropdown = async (user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) => {
  await user.click(trigger);
};

/** 等选项挂载再点（Base UI 菜单异步挂载；取最后匹配 = 最新打开的菜单） */
const pickOption = async (user: ReturnType<typeof userEvent.setup>, label: string) => {
  const option = await waitFor(() => {
    const found = [...document.querySelectorAll('[role="option"]')].filter((o) => o.textContent === label);
    if (found.length === 0) throw new Error(`option not mounted: ${label}`);
    return found.at(-1)!;
  });
  await user.click(option);
};

/** 受控回写 harness：onChange 直接回灌 value，模拟 InstanceEditor 的真实受控用法 */
const Harness: React.FC<{
  parameterType: string;
  initialValue: TypedValue;
  fieldPaths?: string[];
  onChange?: (value: TypedValue) => void;
}> = ({ parameterType, initialValue, fieldPaths, onChange }) => {
  const [value, setValue] = useState<TypedValue>(initialValue);
  return (
    <TypedInput
      parameterType={parameterType}
      value={value}
      fieldPaths={fieldPaths}
      onChange={(next) => {
        onChange?.(next);
        setValue(next);
      }}
    />
  );
};

const modeTrigger = () => [...document.querySelectorAll('[data-slot="select-trigger"]')].at(-1) as HTMLElement;

describe('TypedInput（typed-input 规格走查收口）', () => {
  it('string 字面量编辑回传裸值', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness parameterType='string' initialValue={{ mode: 'literal', value: 'GOLD' }} onChange={onChange} />);

    const input = screen.getByDisplayValue('GOLD') as HTMLInputElement;
    await user.clear(input);
    await user.type(input, 'PLAT');

    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual({ mode: 'literal', value: 'PLAT' });
  });

  it('number 字面量经 InputNumber 回传数值', async () => {
    const onChange = vi.fn();
    render(<TypedInput parameterType='number' value={{ mode: 'literal', value: 3 }} onChange={onChange} />);

    const input = document.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '42' } });

    expect(onChange).toHaveBeenLastCalledWith({ mode: 'literal', value: 42 });
  });

  it('boolean 字面量渲染 Switch', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TypedInput parameterType='boolean' value={{ mode: 'literal', value: false }} onChange={onChange} />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'literal', value: true });
  });

  it('模式切换：非字面量起步为空（不做内容自动推断），切回恢复备忘值', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness parameterType='string' initialValue={{ mode: 'literal', value: 'GOLD' }} onChange={onChange} />);

    // literal → expression：无备忘，空串起步
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Expression');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'expression', value: '' });

    // 表达式里输入内容
    const exprInput = screen.getByPlaceholderText('${...} / $.path') as HTMLInputElement;
    await user.type(exprInput, '$.customer.tier');

    // expression → literal：字面量恢复备忘 GOLD
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Value');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'literal', value: 'GOLD' });

    // literal → expression：表达式备忘 $.customer.tier 恢复（切回不丢值，规格 §2.3）
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Expression');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'expression', value: '$.customer.tier' });
  });

  it('fieldPaths 为空时引用模式隐藏，非空时可选', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <TypedInput parameterType='string' value={{ mode: 'literal', value: 'x' }} onChange={onChange} />,
    );

    await openDropdown(user, modeTrigger());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2);
    await user.keyboard('{Escape}');

    rerender(
      <TypedInput
        parameterType='string'
        value={{ mode: 'literal', value: 'x' }}
        fieldPaths={['customer', 'customer.tier']}
        onChange={onChange}
      />,
    );

    await openDropdown(user, modeTrigger());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
    await pickOption(user, 'Reference');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'reference', value: undefined });
  });

  it('引用模式存储可执行形态 $.path（下拉展示裸路径）', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    // 挂载即引用模式：避开模式菜单的陈旧 portal 干扰
    render(
      <TypedInput
        parameterType='string'
        value={{ mode: 'reference', value: undefined }}
        fieldPaths={['customer', 'customer.tier']}
        onChange={onChange}
      />,
    );

    const refTrigger = [...document.querySelectorAll('[data-slot="select-trigger"]')][0] as HTMLElement;
    await openDropdown(user, refTrigger);
    expect([...document.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual([
      'customer',
      'customer.tier',
    ]);
    await pickOption(user, 'customer.tier');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'reference', value: '$.customer.tier' });
  });

  it('coerceToTypedValue：裸值推断 literal，信封原样通过', async () => {
    const { coerceToTypedValue } = await import('../typed-input');
    expect(coerceToTypedValue('GOLD')).toEqual({ mode: 'literal', value: 'GOLD' });
    const envelope = { mode: 'expression', value: '$.a' };
    expect(coerceToTypedValue(envelope)).toBe(envelope);
    // 数组不是信封（窄识别）
    expect(coerceToTypedValue(['fn'])).toEqual({ mode: 'literal', value: ['fn'] });
  });
});
