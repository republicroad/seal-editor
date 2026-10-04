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

describe('TypedInput（二分呈现：值 / 表达式，存储三态不变）', () => {
  it('string 字面量编辑回传裸值', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
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
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<TypedInput parameterType='boolean' value={{ mode: 'literal', value: false }} onChange={onChange} />);

    await user.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'literal', value: true });
  });

  it('二分切换备忘：值 ↔ 表达式各留旧值，切回恢复', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness parameterType='string' initialValue={{ mode: 'literal', value: 'GOLD' }} onChange={onChange} />);

    // literal → expression：无备忘，空串起步
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Expression');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'expression', value: '' });

    const exprInput = screen.getByPlaceholderText('q.tier / 表达式') as HTMLInputElement;
    await user.type(exprInput, 'customer.tier');

    // expression → literal：字面量恢复备忘 GOLD
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Value');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'literal', value: 'GOLD' });

    // literal → expression：表达式备忘恢复（切回不丢值）
    await openDropdown(user, modeTrigger());
    await pickOption(user, 'Expression');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'expression', value: 'customer.tier' });
  });

  it('模式下拉恒两项（reference 不再作为顶层选项）', async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <TypedInput
        parameterType='string'
        value={{ mode: 'literal', value: 'x' }}
        fieldPaths={['customer.tier']}
        onChange={vi.fn()}
      />,
    );

    await openDropdown(user, modeTrigger());
    const labels = [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(labels).toEqual(['Value', 'Expression']);
  });

  it('字段选择器：fieldPaths 空时隐藏，非空时可见且点选写 reference', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const { rerender } = render(
      <TypedInput parameterType='string' value={{ mode: 'expression', value: '' }} onChange={onChange} />,
    );
    expect(screen.queryByTestId('typed-input-field-picker')).toBeNull();

    rerender(
      <TypedInput
        parameterType='string'
        value={{ mode: 'expression', value: '' }}
        fieldPaths={['customer', 'customer.tier']}
        onChange={onChange}
      />,
    );
    const pickerTrigger = () =>
      screen.getByTestId('typed-input-field-picker').querySelector('[data-slot="select-trigger"]') as HTMLElement;
    await user.click(pickerTrigger());
    await pickOption(user, 'customer.tier');

    // 空编辑框点选 → 整值绑定写 reference（保字段改名迁移精度）
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'reference', value: 'customer.tier' });
  });

  it('非空表达式点选字段 → 拼接写 expression（组合无整值语义）', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <Harness
        parameterType='string'
        initialValue={{ mode: 'expression', value: '$.a + ' }}
        fieldPaths={['b']}
        onChange={onChange}
      />,
    );

    const pickerTrigger = () =>
      screen.getByTestId('typed-input-field-picker').querySelector('[data-slot="select-trigger"]') as HTMLElement;
    await user.click(pickerTrigger());
    await pickOption(user, 'b');
    expect(onChange).toHaveBeenLastCalledWith({ mode: 'expression', value: '$.a + b' });
  });

  it('reference 信封重开折叠进表达式编辑器（值回显）', () => {
    render(
      <TypedInput
        parameterType='string'
        value={{ mode: 'reference', value: 'customer.tier' }}
        fieldPaths={['customer.tier']}
        onChange={vi.fn()}
      />,
    );
    expect((screen.getByPlaceholderText('q.tier / 表达式') as HTMLInputElement).value).toBe('customer.tier');
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
