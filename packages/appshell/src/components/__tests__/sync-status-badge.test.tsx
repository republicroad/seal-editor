// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { AutoPersistState } from '../../shell/auto-persist';
import { SyncStatusBadge } from '../sync-status-badge';

afterEach(cleanup);

const state = (over: Partial<AutoPersistState>): AutoPersistState => ({ status: 'idle', ...over });

describe('SyncStatusBadge（模式 D 同步徽标）', () => {
  test('idle/pending 静默——不打扰连续编辑', () => {
    const { container: a } = render(<SyncStatusBadge state={state({ status: 'idle' })} />);
    expect(a.querySelector('[data-sync-status]')).toBeNull();
    const { container: b } = render(<SyncStatusBadge state={state({ status: 'pending' })} />);
    expect(b.querySelector('[data-sync-status]')).toBeNull();
  });

  test('saving → Saving…；saved → Saved + 时间', () => {
    render(<SyncStatusBadge state={state({ status: 'saving' })} />);
    expect(screen.getByRole('status').getAttribute('data-sync-status')).toBe('saving');

    cleanup();
    render(<SyncStatusBadge state={state({ status: 'saved', lastSavedAt: '2026-09-29T08:00:00.000Z' })} />);
    expect(screen.getByRole('status').getAttribute('data-sync-status')).toBe('saved');
    expect(screen.getByRole('status').textContent).toContain('Saved');
  });

  test('conflict 仅示警，三选 UX 归宿主（契约不变）', () => {
    render(<SyncStatusBadge state={state({ status: 'conflict', conflict: { localBaseRevision: 'v7' } })} />);
    expect(screen.getByRole('alert').getAttribute('data-sync-status')).toBe('conflict');
    expect(screen.queryByRole('button')).toBeNull();
  });

  test('error 展示错误码 + Retry 入口', () => {
    const onRetry = vi.fn();
    render(
      <SyncStatusBadge
        state={state({ status: 'error', lastError: { code: 'NETWORK', message: 'down' } })}
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert').getAttribute('data-sync-status')).toBe('error');
    screen.getByRole('button', { name: 'Retry' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test('error 无 onRetry 时不渲染按钮', () => {
    render(<SyncStatusBadge state={state({ status: 'error', lastError: { code: 'FORBIDDEN', message: 'no' } })} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
