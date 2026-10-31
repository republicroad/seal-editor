import { render } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { JdmConfigProvider } from './theme';

describe('JdmConfigProvider chrome 门（2.1.0 主题透传口）', () => {
  const Probe = () => <div data-testid='probe'>ok</div>;

  it('缺省 chrome=true：children 照常渲染 + 无岛开发告警（2.0 ADR-023 语义）', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { getByTestId } = render(
        <JdmConfigProvider>
          <Probe />
        </JdmConfigProvider>,
      );
      expect(getByTestId('probe')).toBeInTheDocument();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('No .seal-root wrapper found'));
    } finally {
      warn.mockRestore();
    }
  });

  it('chrome=false（嵌套内层）：跳过 Toaster/ConfirmHost——防双宿主回归', () => {
    render(
      <JdmConfigProvider chrome={false}>
        <Probe />
      </JdmConfigProvider>,
    );
    expect(document.querySelector('[data-sonner-toaster]')).toBeNull();
  });

  it('theme.mode 写入岛 data-mode（closest .seal-root）', () => {
    const island = document.createElement('div');
    island.className = 'seal-root';
    document.body.appendChild(island);

    render(
      <div className='seal-root'>
        <JdmConfigProvider theme={{ mode: 'dark' }} chrome={false}>
          <Probe />
        </JdmConfigProvider>
      </div>,
    );
    const scoped = [...document.querySelectorAll<HTMLElement>('.seal-root')].find(
      (el) => el.dataset.mode !== undefined,
    );
    expect(scoped?.dataset.mode).toBe('dark');
    island.remove();
  });
});
