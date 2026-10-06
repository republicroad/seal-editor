// @vitest-environment jsdom
import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { DecisionNode } from '../decision-node';

/** 执行结果徽标：success 徽标（Motion Icon 接线）与 error 徽标对称渲染 */
describe('DecisionNode 执行结果徽标', () => {
  const base = {
    name: 'n1',
    icon: <span data-testid='node-icon' />,
    type: 'input',
  };

  it('status=success 渲染绿色动效徽标（与 error 徽标对称）', () => {
    const { container } = render(<DecisionNode {...base} status='success' />);
    const badge = container.querySelector('div[class*="bg-[var(--color-success)]"]');
    expect(badge).not.toBeNull();
    expect(badge!.querySelector('svg')).not.toBeNull();
    // 悬停微动效类（group-hover/dn 缩放）
    expect(badge!.className).toContain('group-hover/dn:scale-110');
  });

  it('status=error 渲染红色徽标（既有行为不回退）', () => {
    const { container } = render(<DecisionNode {...base} status='error' />);
    const badge = container.querySelector('div[class*="bg-[var(--destructive)]"]');
    expect(badge).not.toBeNull();
    expect(badge!.querySelector('svg')).not.toBeNull();
  });

  it('无 status 不出徽标', () => {
    const { container } = render(<DecisionNode {...base} />);
    expect(container.querySelector('div[class*="bg-[var(--color-success)]"]')).toBeNull();
    expect(container.querySelector('div[class*="bg-[var(--destructive)]"]')).toBeNull();
  });
});
