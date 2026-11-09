// @vitest-environment jsdom
// 独立成文件：头部与右缘轨道同树渲染时依赖 resizable 组测量，与其他图挂载隔离。
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ThemeContextProvider } from '../../context/theme.provider';
import type { SkinDefinition } from '../../skin/types';
import { ShellHeader } from '../shell-header';
import { SkinnedDecisionGraph } from '../skinned-decision-graph';

vi.mock('@gorules/zen-engine-wasm', () => {
  class VariableType {}
  const init = Object.assign(() => Promise.resolve(), { isReady: () => false });
  return { default: init, isReady: init.isReady, VariableType };
});
vi.mock('monaco-editor', () => ({}));

afterEach(cleanup);

const graph = { nodes: [{ id: 'a', type: 'inputNode', position: { x: 0, y: 0 }, name: 'A' }], edges: [] };

const skinWithHeader: SkinDefinition = {
  id: 'ocean',
  label: 'Ocean',
  layout: {
    header: {
      slots: {
        left: ({ graph: g }) => <div>OCEAN · {(g.nodes ?? []).length} nodes</div>,
        right: ({ disabled }) => <div>env:{disabled ? 'locked' : 'open'}</div>,
      },
    },
  },
};

const renderSkinned = (skins?: SkinDefinition[]) =>
  render(
    <ThemeContextProvider options={skins ? { skins, defaultSkinId: skins[0]?.id } : undefined}>
      <SkinnedDecisionGraph value={graph as never} onChange={vi.fn()} />
    </ThemeContextProvider>,
  );

describe('ShellHeader', () => {
  it('无槽位返回 null', () => {
    const { container } = render(
      <ThemeContextProvider>
        <ShellHeader />
      </ThemeContextProvider>,
    );
    expect(container.querySelector('header')).toBeNull();
  });

  it('有槽位渲染 left/right 并注入 ctx', () => {
    const { container } = render(
      <ThemeContextProvider options={{ skins: [skinWithHeader], defaultSkinId: 'ocean' }}>
        <ShellHeader graph={graph as never} disabled={false} />
      </ThemeContextProvider>,
    );
    const header = container.querySelector('header');
    expect(header).toBeTruthy();
    expect(header?.textContent).toContain('OCEAN · 1 nodes');
    expect(header?.textContent).toContain('env:open');
  });
});

describe('SkinnedDecisionGraph header', () => {
  it('无 header 槽位：不渲染 ShellHeader（零注入）', async () => {
    const { container } = renderSkinned();
    await waitFor(() => expect(container.querySelector('.seal-dg')).toBeTruthy());
    expect(container.querySelector('header')).toBeNull();
  });

  it('header 槽位：头部出现在画布上方并注入图数据', async () => {
    const { container } = renderSkinned([skinWithHeader]);

    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('header not mounted yet');
      return header;
    });
    expect(header.textContent).toContain('OCEAN · 1 nodes');
    expect(container.querySelector('.seal-dg')).toBeTruthy();
  });

  it('header + right panels 组合：头部与右缘轨道共存', async () => {
    const skin: SkinDefinition = {
      id: 'ocean',
      label: 'Ocean',
      layout: {
        header: { slots: { left: () => <div>OCEAN-HEADER</div> } },
        panels: {
          right: { slots: { 'host:notes': () => <div>notes-body</div> } },
        },
      },
    };
    const { container } = renderSkinned([skin]);

    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('header not mounted yet');
      return header;
    });
    expect(header.textContent).toContain('OCEAN-HEADER');
    expect(container.querySelector('[aria-label="skin-panel-rail"]')).toBeTruthy();

    // 右缘轨道仍可打开 Sheet
    fireEvent.click(container.querySelector('button[aria-label="Open host:notes"]')!);
    await waitFor(() => {
      if (![...document.querySelectorAll('body div')].some((d) => d.textContent === 'notes-body')) {
        throw new Error('sheet not open');
      }
    });
  });
});

describe('SkinnedDecisionGraph defaultHeader', () => {
  it('defaultHeader=true：无槽位时渲染默认头部（Test Run 在场）', async () => {
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph value={graph as never} onChange={vi.fn()} defaultHeader />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header || !header.textContent.includes('Test Run')) throw new Error('default header not mounted');
      return header;
    });
    expect(header.querySelector('[aria-label="More options"]')).toBeTruthy();
  });

  it('无 simulateHandler 时 Test Run 诚实禁用（防静默失效）', async () => {
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph value={graph as never} onChange={vi.fn()} defaultHeader />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('default header not mounted');
      return header;
    });
    const testRun = [...header.querySelectorAll('button')].find((b) => b.textContent?.includes('Test Run'))!;
    await waitFor(() => {
      // graphRef 挂载后缺省通道仍不注入（无 simulateHandler = simulator 面板未注册）
      if (!(testRun as HTMLButtonElement).disabled) throw new Error('expected disabled before simulateHandler wiring');
    });
  });

  it('simulateHandler 在场时 Test Run 可用', async () => {
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph
          value={graph as never}
          onChange={vi.fn()}
          defaultHeader
          simulateHandler={vi.fn((_graph: unknown, _input: unknown) =>
            Promise.resolve({ simulation: {}, errorMessage: undefined }),
          )}
        />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('default header not mounted');
      return header;
    });
    const testRun = [...header.querySelectorAll('button')].find((b) => b.textContent?.includes('Test Run'))!;
    await waitFor(() => {
      if ((testRun as HTMLButtonElement).disabled) throw new Error('expected enabled with simulateHandler');
    });
  });

  it('header more 菜单 popup 挂岛根（浮层 token 作用域回归）', async () => {
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph value={graph as never} onChange={vi.fn()} defaultHeader />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('default header not mounted');
      return header;
    });
    fireEvent.click(header.querySelector('[aria-label="More options"]')!);
    await waitFor(() => {
      const menu = document.querySelector('[role="menu"]');
      if (!menu) throw new Error('menu popup not mounted');
      // popup 必须在 .seal-root 岛内（bg-popover 等 token 只在岛作用域解析）
      if (!menu.closest('.seal-root')) throw new Error('menu popup escaped the island');
    });
  });

  it('Test Run 直跑链：examples[0] 喂 handler + 面板打开（n8n 模式）', async () => {
    const graphWithExamples = {
      enabled: true,
      nodes: [
        {
          id: 'in-1',
          type: 'inputNode',
          position: { x: 0, y: 0 },
          name: 'Request',
          content: {
            inputContract: {
              contractVersion: 1,
              schema: { type: 'object' },
              examples: [
                { id: 'e1', name: 'gold', data: { customer: { tier: 'GOLD' } } },
                { id: 'e2', name: 'silver', data: { customer: { tier: 'SILVER' } } },
              ],
            },
          },
        },
      ],
      edges: [],
    };
    const simulateHandler = vi.fn((_graph: unknown, _input: unknown) =>
      Promise.resolve({ simulation: {}, errorMessage: undefined }),
    );
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph
          value={graphWithExamples as never}
          onChange={vi.fn()}
          defaultHeader
          simulateHandler={simulateHandler}
        />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('default header not mounted');
      return header;
    });
    const testRun = [...header.querySelectorAll('button')].find((b) => b.textContent?.includes('Test Run'))!;
    await waitFor(() => {
      if ((testRun as HTMLButtonElement).disabled) throw new Error('expected enabled');
    });
    fireEvent.click(testRun);
    // 直跑：examples[0] 经预处理管线喂 handler
    await waitFor(() => expect(simulateHandler).toHaveBeenCalledTimes(1));
    expect(simulateHandler.mock.calls[0][1]).toEqual({ customer: { tier: 'GOLD' } });
    // 面板自动打开（kernel simulator 面板内容挂载 = Run 钮在 DOM）
    await waitFor(
      () => {
        if (!container.querySelector('[data-testid="simulator-run"]')) {
          throw new Error('simulator panel not opened');
        }
      },
      { timeout: 15000, interval: 200 },
    );
  });

  it('Test Run 直跑链：无 examples 空对象兜底', async () => {
    const simulateHandler = vi.fn((_graph: unknown, _input: unknown) =>
      Promise.resolve({ simulation: {}, errorMessage: undefined }),
    );
    const { container } = render(
      <ThemeContextProvider>
        <SkinnedDecisionGraph
          value={graph as never}
          onChange={vi.fn()}
          defaultHeader
          simulateHandler={simulateHandler}
        />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('default header not mounted');
      return header;
    });
    const testRun = [...header.querySelectorAll('button')].find((b) => b.textContent?.includes('Test Run'))!;
    await waitFor(() => {
      if ((testRun as HTMLButtonElement).disabled) throw new Error('expected enabled');
    });
    fireEvent.click(testRun);
    await waitFor(() => expect(simulateHandler).toHaveBeenCalledTimes(1));
    expect(simulateHandler.mock.calls[0][1]).toEqual({});
  });

  it('槽位在场时槽位形态优先（defaultHeader 不生效）', async () => {
    const { container } = render(
      <ThemeContextProvider options={{ skins: [skinWithHeader], defaultSkinId: 'ocean' }}>
        <SkinnedDecisionGraph value={graph as never} onChange={vi.fn()} defaultHeader />
      </ThemeContextProvider>,
    );
    const header = await waitFor(() => {
      const header = container.querySelector('header');
      if (!header) throw new Error('header not mounted yet');
      return header;
    });
    expect(header.textContent).toContain('OCEAN · 1 nodes');
    expect(header.textContent).not.toContain('Test Run');
  });
});
