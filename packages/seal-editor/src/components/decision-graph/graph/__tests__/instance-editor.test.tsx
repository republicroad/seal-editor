// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FunctionInstance, InstanceDriftSummary } from '../instance-editor';
import { InstanceEditor } from '../instance-editor';

// Base UI Select 依赖 jsdom 未实现的 PointerEvent API（primitives.test.tsx 同款）
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

const SCOPE = {
  mode: 'scoped' as const,
  functions: [
    {
      name: 'fraud_score',
      description: 'Score a transaction for fraud risk.',
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          tier: { type: 'string' },
          vip: { type: 'boolean' },
        },
        required: ['amount'],
      },
    },
    { name: 'log_echo', parameters: { type: 'object', properties: {} } },
  ],
};

const INSTANCES: FunctionInstance[] = [
  { id: 'i1', key: 'score', call: { $call: 'fraud_score', kwargs: { amount: 100, tier: 'GOLD' } } },
  { id: 'i2', key: 'echo', call: { $call: 'log_echo', kwargs: {} } },
];

/** 受控回写 harness */
const Harness: React.FC<{
  initialValue: FunctionInstance[];
  fieldPaths?: string[];
  driftByInstance?: Record<string, InstanceDriftSummary>;
  duplicateKeys?: string[];
  onChange?: (next: FunctionInstance[]) => void;
}> = ({ initialValue, fieldPaths, driftByInstance, duplicateKeys, onChange }) => {
  const [instances, setInstances] = useState(initialValue);
  return (
    <InstanceEditor
      instances={instances}
      functionScope={SCOPE}
      fieldPaths={fieldPaths}
      driftByInstance={driftByInstance}
      duplicateKeys={duplicateKeys}
      onChange={(next) => {
        onChange?.(next);
        setInstances(next);
      }}
    />
  );
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

describe('InstanceEditor（主从编辑器深化）', () => {
  it('左栏渲染实例列表（函数名 + 输出键），选中项进右栏', async () => {
    const user = userEvent.setup();
    render(<InstanceEditor instances={INSTANCES} functionScope={SCOPE} onChange={vi.fn()} />);

    const items = screen.getAllByTestId('instance-list-item');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('fraud_score');
    expect(items[0].textContent).toContain('score');

    // 默认选中首个实例；右栏键输入回显
    expect((screen.getByTestId('instance-key-input') as HTMLInputElement).value).toBe('score');

    await user.click(items[1]);
    expect((screen.getByTestId('instance-key-input') as HTMLInputElement).value).toBe('echo');
  });

  it('输出键右栏可编辑并回传', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialValue={INSTANCES} onChange={onChange} />);

    const keyInput = screen.getByTestId('instance-key-input') as HTMLInputElement;
    await user.type(keyInput, '2');

    const last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last[0].key).toBe('score2');
    expect(last[0].call.$call).toBe('fraud_score');
  });

  it('添加实例回传追加项并预选；删除经悬停按钮', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialValue={INSTANCES} onChange={onChange} />);

    await user.click(screen.getAllByText(/Add instance/)[0]);
    let last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last).toHaveLength(3);
    expect(last[2].key).toBe('output_3');
    expect(last[2].call.$call).toBe('fraud_score');

    const removeButtons = screen.getAllByTestId('instance-remove');
    await user.click(removeButtons[2]);
    last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last).toHaveLength(2);
  });

  it('参数行：必填星 + 类型标 + 字面量存裸值', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialValue={INSTANCES} onChange={onChange} />);

    // amount（number，必填）参数行存在 InputNumber
    const numberInput = document.querySelector('input[type="number"]') as HTMLInputElement;
    expect(numberInput).toBeTruthy();
    expect((numberInput as HTMLInputElement).value).toBe('100');
    await user.type(numberInput, '5');

    const last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last[0].call.kwargs.amount).toBe(1005);
    // 字面量恒为裸值（引擎直读兼容）
    expect(last[0].call.kwargs.tier).toBe('GOLD');
    // 必填星标在 amount 行
    expect(screen.getByTitle('required')).toBeTruthy();
  });

  it('表达式模式写 TypedValue 信封（模式不丢）', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness initialValue={INSTANCES} onChange={onChange} />);

    // tier 行的字面量输入 → 切表达式（参数行即 .grid 容器）
    const tierInput = screen.getByDisplayValue('GOLD') as HTMLInputElement;
    const tierRow = tierInput.closest('.grid') as HTMLElement;
    const modeTrigger = tierRow.querySelector('[data-slot="select-trigger"]') as HTMLElement;
    await user.click(modeTrigger);
    await pickOption(user, 'Expression');

    let last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last[0].call.kwargs.tier).toEqual({ mode: 'expression', value: '' });

    // 输入表达式 → 信封带值
    const exprInput = screen.getByPlaceholderText('${...} / $.path') as HTMLInputElement;
    await user.type(exprInput, '$.tier');
    last = onChange.mock.calls.at(-1)?.[0] as FunctionInstance[];
    expect(last[0].call.kwargs.tier).toEqual({ mode: 'expression', value: '$.tier' });
  });

  it('fieldPaths 透传：引用模式可见（每参数行模式下拉 3 项）', async () => {
    const user = userEvent.setup();
    render(<Harness initialValue={INSTANCES} fieldPaths={['customer.tier']} />);

    const tierInput = screen.getByDisplayValue('GOLD') as HTMLInputElement;
    const modeTrigger = (tierInput.closest('.grid') as HTMLElement).querySelector(
      '[data-slot="select-trigger"]',
    ) as HTMLElement;
    await user.click(modeTrigger);
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(3);
  });

  it('漂移/重复点标 + 右栏重复警告', () => {
    render(
      <Harness
        initialValue={INSTANCES}
        driftByInstance={{ i1: { missing: 1, unrecognized: 0 } }}
        duplicateKeys={['score']}
      />,
    );

    expect(screen.queryAllByTestId('instance-drift-dot')).toHaveLength(0);
    expect(screen.getAllByTestId('instance-dup-dot')).toHaveLength(1);
    expect(screen.getByTestId('instance-key-dup').textContent).toContain('Duplicate output key');
    expect(screen.getByTestId('instance-drift-hint').textContent).toContain('missing 1');
  });

  it('无实例空态渲染引导文案', () => {
    render(<InstanceEditor instances={[]} functionScope={SCOPE} onChange={vi.fn()} />);
    expect(screen.getByText('No instances yet')).toBeTruthy();
    expect(screen.getByText('Select an instance on the left to edit')).toBeTruthy();
  });
});
