import { render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { JdmConfigProvider } from '../../theme';

const Probe = () => <div data-testid='probe'>ok</div>;

afterEach(() => {
  // jsdom documentElement is shared across tests — clean the dataset
  delete document.documentElement.dataset.mode;
});

describe('JdmConfigProvider scoped injection (P3)', () => {
  it('2.0 LEGACY 退役：no .seal-root ancestor → 不注入、不写 document、开发告警指向挂岛', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      render(
        <JdmConfigProvider>
          <Probe />
        </JdmConfigProvider>,
      );
      // document 不被写（LEGACY :root style tag 与 documentElement data-mode 均随 2.0 退役）
      expect(document.documentElement.dataset.mode).toBeUndefined();
      const styles = [...document.querySelectorAll('style')].filter((s) =>
        (s.textContent || '').includes('--seal-color-primary'),
      );
      expect(styles).toHaveLength(0);
      // 迁移告警：宿主必须挂 .seal-root 岛
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('[seal-editor] No .seal-root wrapper found'));
    } finally {
      warn.mockRestore();
    }
  });

  it('SCOPED: .seal-root ancestor → inline vars + data-mode on the island', () => {
    const island = document.createElement('div');
    island.className = 'seal-root';
    document.body.appendChild(island);

    const { getByTestId } = render(
      <div className='seal-root'>
        <JdmConfigProvider>
          <Probe />
        </JdmConfigProvider>
      </div>,
    );

    expect(getByTestId('probe')).toBeInTheDocument();
    expect(document.documentElement.dataset.mode).toBeUndefined();

    const islands = [...document.querySelectorAll<HTMLElement>('.seal-root')];
    const scoped = islands.find((el) => el.style.getPropertyValue('--seal-color-primary') !== '');
    expect(scoped).toBeTruthy();
    expect(scoped!.style.getPropertyValue('--seal-color-primary')).toBe('#1677ff');
    expect(scoped!.dataset.mode).toBe('light');
    // text-color scoping: dark-mode inputs inherit a visible color (P3 followup)
    expect(scoped!.style.getPropertyValue('color')).toBe('var(--foreground)');

    island.remove();
  });
});
