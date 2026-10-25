// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Popover } from '../popover';

// Base UI 在 jsdom 缺 PointerEvent API（instance-editor 同款兜底）
beforeEach(() => {
  window.HTMLElement.prototype.hasPointerCapture = () => false;
  window.HTMLElement.prototype.releasePointerCapture = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  vi.restoreAllMocks();
});

const mount = (props: Partial<React.ComponentProps<typeof Popover>> = {}) => {
  const onOpenChange = vi.fn();
  render(
    <Popover open onOpenChange={onOpenChange} content={<div>panel-body</div>} {...props}>
      <button type='button'>trigger-el</button>
    </Popover>,
  );
  return onOpenChange;
};

describe('Popover（A1 sweep 回归）', () => {
  it('placement 映射：bottomLeft → Positioner data-side=bottom data-align=start', () => {
    mount({ placement: 'bottomLeft' });
    const positioner = document.querySelector("[data-side='bottom'][data-align='start']");
    expect(positioner).toBeTruthy();
  });

  it('disabled 守卫：点击触发器不调用 onOpenChange', async () => {
    const user = userEvent.setup();
    const onOpenChange = mount({ open: undefined, disabled: true });
    await user.click(screen.getByText('trigger-el'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('非点击 trigger 传值发一次开发告警', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mount({ trigger: 'hover' });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('only trigger="click"'));
    mount({ trigger: 'hover' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
