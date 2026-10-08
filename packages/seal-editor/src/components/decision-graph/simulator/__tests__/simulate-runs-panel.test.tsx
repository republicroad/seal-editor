// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import type { SimulateRunEntry } from '../../context/dg-store.context';
import { SimulateRunsPanel } from '../simulate-runs-panel';
import { serializeRuns } from '../simulate-runs-persistence';

const entry = (id: string, ok: boolean, performance = '1.2ms'): SimulateRunEntry => ({
  id,
  ts: '2026-10-06T08:30:00.000Z',
  ok,
  performance: ok ? performance : undefined,
  error: ok ? undefined : 'E_RUN: engine blew up',
  snapshot: (ok
    ? { result: { performance, result: { discount: 0.85 }, snapshot: {}, trace: {} } }
    : { error: { title: 'engine blew up', code: 'E_RUN', data: {} } }) as never,
});

describe('SimulateRunsPanel（批 3 Run 历史时间线）', () => {
  it('空态渲染引导文案', () => {
    render(<SimulateRunsPanel runs={[]} />);
    expect(screen.getByText('No runs yet — run a simulation to build history')).toBeTruthy();
  });

  it('每笔渲染时间 + outcome 徽章 + 耗时；ERR 行带错误摘要', () => {
    render(<SimulateRunsPanel runs={[entry('a', true), entry('b', false)]} />);
    const rows = screen.getAllByTestId('simulate-run-row');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByText('OK')).toHaveLength(1);
    expect(screen.getByText('ERR')).toBeTruthy();
    expect(screen.getByText('E_RUN: engine blew up')).toBeTruthy();
    expect(screen.getByText('1.2ms')).toBeTruthy();
    // 时间戳 HH:mm:ss（en-GB）
    expect(rows[0].textContent).toMatch(/\d{2}:\d{2}:\d{2}/);
  });

  it('点行展开该次输出 JSON；再点收起', () => {
    render(<SimulateRunsPanel runs={[entry('a', true)]} />);
    expect(screen.queryByTestId('simulate-run-detail')).toBeNull();

    fireEvent.click(screen.getByTestId('simulate-run-row'));
    const detail = screen.getByTestId('simulate-run-detail');
    expect(detail.textContent).toContain('0.85');

    fireEvent.click(screen.getByTestId('simulate-run-row'));
    expect(screen.queryByTestId('simulate-run-detail')).toBeNull();
  });

  it('展开详情由 code-block 渲染（懒 chunk 就绪后：折叠 + copy 按钮出现）', async () => {
    render(<SimulateRunsPanel runs={[entry('a', true)]} />);
    fireEvent.click(screen.getByTestId('simulate-run-row'));
    // fallback pre 同步可见（内容不缺席）
    expect(screen.getByTestId('simulate-run-detail').textContent).toContain('0.85');
    // 懒 chunk 解析后 code-block 接管：copy 按钮挂载
    expect(await screen.findByLabelText('Copy JSON', undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByTestId('simulate-run-detail').textContent).toContain('0.85');
  });
});

describe('Run 历史持久化序列（批 16 混合方案）', () => {
  it('serialize：pin 条目带载荷，未 pin 剥除 snapshot 只剩元数据', () => {
    const entries: SimulateRunEntry[] = [{ ...entry('a', true), pinned: true }, entry('b', false)];
    const parsed = JSON.parse(serializeRuns(entries));
    expect(parsed[0].snapshot).toBeDefined();
    expect(parsed[0].pinned).toBe(true);
    expect(parsed[1].snapshot).toBeUndefined();
    expect(parsed[1].id).toBe('b');
  });
});
