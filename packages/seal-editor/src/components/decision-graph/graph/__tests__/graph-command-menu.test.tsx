// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useContext } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DecisionGraphProvider, DecisionGraphStoreContext } from '../../context/dg-store.context';
import { GraphCommandMenu } from '../graph-command-menu';

type ContextValue = React.ContextType<typeof DecisionGraphStoreContext>;

let ctx: ContextValue | null = null;

const Probe: React.FC = () => {
  ctx = useContext(DecisionGraphStoreContext);
  return null;
};

const SPECS = [
  { type: 'decisionTableNode', displayName: 'Decision table', shortDescription: 'Rules spreadsheet' },
  { type: 'expressionNode', displayName: 'Expression', shortDescription: 'Mapping utility' },
] as never[];

const renderMenu = (addNode: ReturnType<typeof vi.fn>) => {
  render(
    <DecisionGraphProvider>
      <Probe />
      <GraphCommandMenu addNode={addNode as never} specifications={SPECS} />
    </DecisionGraphProvider>,
  );
};

const seedGraph = () => {
  const { decisionGraph } = ctx!.stateStore.getState();
  ctx!.stateStore.setState({
    decisionGraph: {
      ...decisionGraph,
      nodes: [
        { id: 'n1', type: 'decisionTableNode', name: 'Pricing', position: { x: 0, y: 0 } },
        { id: 'in', type: 'inputNode', name: 'Request', position: { x: 0, y: 0 } },
      ] as never,
      edges: [] as never,
    } as never,
    panels: [
      { id: 'simulator', title: 'Simulator', renderPanel: () => null },
      { id: 'fixtures', title: 'Fixtures', renderPanel: () => null },
    ] as never,
  });
};

describe('GraphCommandMenu（⌘K 全局调色板）', () => {
  beforeEach(() => {
    ctx = null;
    // recent 上浮跨测试泄漏（执行路径写回 localStorage）——每例清键
    window.localStorage.removeItem('seal.dg.command.recent');
  });

  it('Ctrl/⌘+K 开合；输入控件内让位', async () => {
    const user = userEvent.setup();
    renderMenu(vi.fn());

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyK', ctrlKey: true, bubbles: true }));
    });
    expect(ctx!.stateStore.getState().commandMenuOpen).toBe(true);
    const input = await waitFor(() => screen.getByTestId('graph-command-input'));

    input.focus();
    await user.keyboard('{Control>}k');
    expect(ctx!.stateStore.getState().commandMenuOpen).toBe(true);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(ctx!.stateStore.getState().commandMenuOpen).toBe(false));
  });

  it('开态三组条目渲染 + 查询过滤', async () => {
    renderMenu(vi.fn());
    act(() => seedGraph());
    act(() => {
      ctx!.stateStore.setState({ commandMenuOpen: true });
    });

    // 弹层挂载异步（Base UI portal）

    await new Promise((r) => setTimeout(r, 300));
    await waitFor(() => expect(screen.getAllByTestId('graph-command-item').length).toBeGreaterThan(2));
    const labels = () => screen.getAllByTestId('graph-command-item').map((el) => el.textContent ?? '');
    expect(labels().some((text) => text.includes('Decision table'))).toBe(true);
    expect(labels().some((text) => text.includes('Simulator'))).toBe(true);
    expect(labels().some((text) => text.includes('Pricing'))).toBe(true);

    await userEvent.type(screen.getByTestId('graph-command-input'), 'pricing');
    await waitFor(() => {
      const visible = labels();
      expect(visible.some((text) => text.includes('Pricing'))).toBe(true);
      expect(visible.some((text) => text.includes('Simulator'))).toBe(false);
    });
  });

  it('选中添加节点条目调用 addNode 并关弹层', async () => {
    const addNode = vi.fn().mockResolvedValue(undefined);
    renderMenu(addNode);
    act(() => seedGraph());
    act(() => {
      ctx!.stateStore.setState({ commandMenuOpen: true });
    });
    await waitFor(() => expect(screen.getByTestId('graph-command-input')).toBeTruthy());

    await userEvent.type(screen.getByTestId('graph-command-input'), 'decision');
    await waitFor(() => {
      expect(
        screen
          .getAllByTestId('graph-command-item')
          .some((el) => el.textContent?.toLowerCase().includes('decision table')),
      ).toBe(true);
    });
    await userEvent.click(
      screen
        .getAllByTestId('graph-command-item')
        .find((el) => el.textContent?.toLowerCase().includes('decision table'))!,
    );

    await waitFor(() => expect(addNode).toHaveBeenCalled());
    await waitFor(() => expect(ctx!.stateStore.getState().commandMenuOpen).toBe(false));
  });

  it('↑↓ 移动高亮、Enter 提交高亮项（非首匹配）', async () => {
    const addNode = vi.fn().mockResolvedValue(undefined);
    renderMenu(addNode);
    act(() => seedGraph());
    act(() => {
      ctx!.stateStore.setState({ commandMenuOpen: true });
    });
    const input = await waitFor(() => screen.getByTestId('graph-command-input'));

    await waitFor(() => expect(screen.getAllByTestId('graph-command-item').length).toBeGreaterThan(1));
    // 缺省高亮首项
    expect(document.querySelector('[data-command-active]')).toBeTruthy();

    // 移到 Decision table（add 组）条目再 Enter——验证提交的是高亮项而非首匹配
    const items = () => screen.getAllByTestId('graph-command-item');
    const targetIndex = items().findIndex((el) => el.textContent?.includes('Decision table'));
    expect(targetIndex).toBeGreaterThan(0);
    for (let i = 0; i < targetIndex; i++) {
      await userEvent.type(input, '{ArrowDown}');
    }
    await waitFor(() => expect(document.querySelector('[data-command-active]')).toBe(items()[targetIndex]));

    await userEvent.type(input, '{Enter}');
    await waitFor(() => expect(addNode).toHaveBeenCalled());
    await waitFor(() => expect(ctx!.stateStore.getState().commandMenuOpen).toBe(false));
  });

  it('recent 命令空 query 上浮、执行后写回 localStorage', async () => {
    window.localStorage.setItem('seal.dg.command.recent', JSON.stringify(['panel:simulator']));
    try {
      const addNode = vi.fn().mockResolvedValue(undefined);
      renderMenu(addNode);
      act(() => seedGraph());
      act(() => {
        ctx!.stateStore.setState({ commandMenuOpen: true });
      });
      await waitFor(() => expect(screen.getAllByTestId('graph-command-item').length).toBeGreaterThan(1));

      const labels = () => screen.getAllByTestId('graph-command-item').map((el) => el.textContent ?? '');
      // Simulator（recent）上浮到首位
      await waitFor(() => expect(labels()[0]).toContain('Simulator'));

      await userEvent.click(screen.getAllByTestId('graph-command-item')[0]);
      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem('seal.dg.command.recent') ?? '[]')).toContain('panel:simulator'),
      );
    } finally {
      window.localStorage.removeItem('seal.dg.command.recent');
    }
  });
});
