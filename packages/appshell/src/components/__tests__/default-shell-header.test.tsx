// @vitest-environment jsdom
import type { DecisionGraphRef } from '@republicroad/seal-editor';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DefaultShellHeader } from '../default-shell-header';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const graph = {
  enabled: true,
  nodes: [{ id: 'a', type: 'inputNode', position: { x: 0, y: 0 }, name: 'A' }],
  edges: [],
};

const makeGraphRef = (overrides: Partial<DecisionGraphRef> = {}) =>
  ({
    setActivePanel: vi.fn(),
    serialize: vi.fn(() => graph),
    ...overrides,
  }) as unknown as DecisionGraphRef;

describe('DefaultShellHeader', () => {
  it('缺省形态：Test Run 与 more 菜单在，back/History 不渲染', () => {
    const ref = makeGraphRef();
    const { container, getByRole } = render(<DefaultShellHeader graph={graph} graphRef={ref} />);
    expect(getByRole('button', { name: 'Test Run' })).toBeTruthy();
    expect(getByRole('button', { name: 'More options' })).toBeTruthy();
    expect(container.querySelector('[aria-label="Back"]')).toBeNull();
    expect(container.querySelector('[aria-label="History"]')).toBeNull();
    // 菜单未打开时不渲染条目
    expect(document.body.textContent).not.toContain('Export JSON');
  });

  it('syncBadge 槽渲染在右端（autoPersist 徽标注入位）', () => {
    const { getByTestId } = render(
      <DefaultShellHeader graph={graph} graphRef={makeGraphRef()} syncBadge={<span data-testid='sync-badge' />} />,
    );
    expect(getByTestId('sync-badge')).toBeTruthy();
  });

  it('onBack / onOpenHistory 传入后渲染对应钮', () => {
    const onBack = vi.fn();
    const { container, getByLabelText } = render(
      <DefaultShellHeader graph={graph} graphRef={makeGraphRef()} onBack={onBack} onOpenHistory={vi.fn()} />,
    );
    fireEvent.click(getByLabelText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[aria-label="History"]')).toBeTruthy();
  });

  it('enabled Switch 受控回显并回调翻转', () => {
    const onEnabledChange = vi.fn();
    const { getByRole } = render(
      <DefaultShellHeader
        graph={{ ...graph, enabled: false }}
        graphRef={makeGraphRef()}
        onEnabledChange={onEnabledChange}
      />,
    );
    const switchEl = getByRole('switch') as HTMLInputElement;
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(switchEl);
    expect(onEnabledChange).toHaveBeenCalledWith(true);
  });

  it('onEnabledChange 未传时 Switch 只读（disabled）', () => {
    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={makeGraphRef()} />);
    const switchEl = getByRole('switch') as HTMLInputElement;
    expect(switchEl.getAttribute('aria-disabled')).toBe('true');
  });

  it('onTestRun 通道：点击回调宿主动作', () => {
    const onTestRun = vi.fn();
    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={makeGraphRef()} onTestRun={onTestRun} />);
    fireEvent.click(getByRole('button', { name: 'Test Run' }));
    expect(onTestRun).toHaveBeenCalledTimes(1);
  });

  it('onTestRun 覆盖缺省动作；disabled 全局禁用 Test Run', () => {
    const onTestRun = vi.fn();
    const ref = makeGraphRef();
    const { getByRole, rerender } = render(<DefaultShellHeader graph={graph} graphRef={ref} onTestRun={onTestRun} />);
    fireEvent.click(getByRole('button', { name: 'Test Run' }));
    expect(onTestRun).toHaveBeenCalledTimes(1);
    expect(ref.setActivePanel).not.toHaveBeenCalled();

    rerender(<DefaultShellHeader graph={graph} graphRef={ref} disabled />);
    expect((getByRole('button', { name: 'Test Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('无 onTestRun 时 Test Run 禁用（graphRef 在场亦然——防静默失效）', () => {
    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={makeGraphRef()} />);
    expect((getByRole('button', { name: 'Test Run' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('more 菜单裁剪：无 Duplicate/Delete 回调时仅 Export JSON', async () => {
    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={makeGraphRef()} />);
    fireEvent.click(getByRole('button', { name: 'More options' }));
    await waitFor(() => expect(document.body.textContent).toContain('Export JSON'));
    expect(document.body.textContent).not.toContain('Duplicate');
    expect(document.body.textContent).not.toContain('Delete');
  });

  it('Export JSON 内建：serialize → Blob 下载', async () => {
    const ref = makeGraphRef();
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock');
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL as typeof URL.createObjectURL;
    URL.revokeObjectURL = revokeObjectURL as typeof URL.revokeObjectURL;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={ref} />);
    fireEvent.click(getByRole('button', { name: 'More options' }));
    await waitFor(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
        el.textContent?.includes('Export JSON'),
      );
      if (!item) throw new Error('export item not mounted');
      fireEvent.click(item);
    });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    expect(ref.serialize).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('application/json');
  });

  it('Delete 走 AlertDialog 确认后回调', async () => {
    const onDelete = vi.fn();
    const { getByRole } = render(<DefaultShellHeader graph={graph} graphRef={makeGraphRef()} onDelete={onDelete} />);
    fireEvent.click(getByRole('button', { name: 'More options' }));
    await waitFor(() => {
      const item = [...document.querySelectorAll('[role="menuitem"]')].find((el) => el.textContent?.includes('Delete'));
      if (!item) throw new Error('delete item not mounted');
      fireEvent.click(item);
    });
    await waitFor(() => expect(document.body.textContent).toContain('Delete this graph?'));
    const confirm = [...document.querySelectorAll('button')].find(
      (el) => el.textContent === 'Delete' && el.closest('[role="alertdialog"]'),
    );
    expect(confirm).toBeTruthy();
    fireEvent.click(confirm!);
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });
});
