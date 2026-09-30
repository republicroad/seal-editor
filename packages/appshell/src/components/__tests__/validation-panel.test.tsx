// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { type ValidationEntry, ValidationPanel } from '../governance/validation-panel';

afterEach(cleanup);

const entry = (over: Partial<ValidationEntry>): ValidationEntry => ({
  severity: 'error',
  message: '示例问题',
  ...over,
});

describe('ValidationPanel（治理窗批次 4：集中验证面板）', () => {
  test('空 entries = 校验通过态', () => {
    render(<ValidationPanel entries={[]} />);
    expect(screen.getByTestId('validation-pass')).toBeDefined();
  });

  test('计数行 + 严重级排序（错误在警告/提示前）', () => {
    const { container } = render(
      <ValidationPanel
        entries={[
          entry({ severity: 'info', message: '提示条目' }),
          entry({ severity: 'error', message: '错误条目' }),
          entry({ severity: 'warning', message: '警告条目' }),
        ]}
      />,
    );

    expect(screen.getByTestId('validation-count').textContent).toBe('1 错误 · 1 警告');
    const rows = Array.from(container.querySelectorAll('[data-severity]'));
    expect(rows.map((r) => r.getAttribute('data-severity'))).toEqual(['error', 'warning', 'info']);
  });

  test('code 展示；onJump + nodeId 命中行渲染跳转按钮并回调', () => {
    const onJump = vi.fn();
    render(
      <ValidationPanel
        entries={[entry({ nodeId: 'dt-1', code: 'INVALID_EXPRESSION', message: '表达式无法解析' })]}
        onJump={onJump}
      />,
    );

    expect(screen.getByText('INVALID_EXPRESSION')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '跳转' }));
    expect(onJump).toHaveBeenCalledWith('dt-1');
  });

  test('无 onJump 时 nodeId 行不渲染跳转按钮', () => {
    render(<ValidationPanel entries={[entry({ nodeId: 'dt-1' })]} />);
    expect(screen.queryByRole('button', { name: '跳转' })).toBeNull();
  });

  test('running 提示', () => {
    render(<ValidationPanel entries={[]} running />);
    expect(screen.getByText('校验中…')).toBeDefined();
  });
});
