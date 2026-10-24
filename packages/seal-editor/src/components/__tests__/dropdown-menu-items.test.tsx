import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Dropdown, type MenuProps } from '../primitives/dropdown';

/**
 * 回归：renderMenuItems 曾把 onSelect 传给 base-ui Menu.Item——onSelect 是
 * Radix API，base-ui 只有 onClick，未识别的 prop 落到原生 select 事件上，
 * 菜单条目（Documentation/Copy/Duplicate/Delete）全部静默失效。
 */
describe('Dropdown menu items activation', () => {
  const mount = (menu: MenuProps) => {
    const user = userEvent.setup();
    render(
      <Dropdown menu={menu}>
        <button type='button'>open-menu</button>
      </Dropdown>,
    );
    return user;
  };

  it('item onClick fires on click', async () => {
    const onDoc = vi.fn();
    const user = mount({ items: [{ key: 'documentation', label: 'Documentation', onClick: onDoc }] });

    await user.click(screen.getByText('open-menu'));
    await user.click(await screen.findByText('Documentation'));
    expect(onDoc).toHaveBeenCalledTimes(1);
    expect(onDoc).toHaveBeenCalledWith({ key: 'documentation' });
  });

  it('menu-level onClick is the fallback when item has none', async () => {
    const onAny = vi.fn();
    const user = mount({
      items: [{ key: 'delete', label: 'Delete' }],
      onClick: onAny,
    });

    await user.click(screen.getByText('open-menu'));
    await user.click(await screen.findByText('Delete'));
    expect(onAny).toHaveBeenCalledWith({ key: 'delete' });
  });
});
