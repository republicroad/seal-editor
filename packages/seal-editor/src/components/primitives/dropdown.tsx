import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '#components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import * as React from 'react';

export interface MenuItemType {
  key?: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  type?: 'divider' | 'group';
  onClick?: (info: { key: string }) => void;
  children?: MenuItemType[];
}

export interface MenuProps {
  items?: MenuItemType[];
  onClick?: MenuItemType['onClick'];
}

type MenuPrimitiveSet = {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  Separator: typeof DropdownMenuSeparator | typeof ContextMenuSeparator;
  // Radix `Sub` variants are providers without refs and come from different
  // menu implementations, so keep this slot loosely typed.
  Sub: React.ElementType;
  SubTrigger: typeof DropdownMenuSubTrigger | typeof ContextMenuSubTrigger;
  SubContent: typeof DropdownMenuSubContent | typeof ContextMenuSubContent;
};

const renderMenuItems = (
  items: MenuItemType[] | undefined,
  onClick: MenuProps['onClick'],
  P: MenuPrimitiveSet,
): React.ReactNode =>
  // Callers build item arrays with conditional expressions and may leave null
  // entries behind; drop them before touching item.key.
  (items ?? [])
    .filter((item): item is MenuItemType => !!item)
    .map((item, index) => {
      const itemKey = item.key ?? String(index);
      const handleSelect = () => (item.onClick ?? onClick)?.({ key: itemKey });
      return item.type === 'divider' ? (
        <P.Separator key={itemKey} />
      ) : item.children?.length ? (
        <P.Sub key={itemKey}>
          <P.SubTrigger disabled={item.disabled}>{item.label}</P.SubTrigger>
          <P.SubContent>{renderMenuItems(item.children, onClick, P)}</P.SubContent>
        </P.Sub>
      ) : (
        <P.Item
          key={itemKey}
          disabled={item.disabled}
          variant={item.danger ? 'destructive' : 'default'}
          // base-ui Menu.Item 只有 onClick（onSelect 是 Radix API——传给 base-ui
          // 会落到原生 select 事件上，菜单条目全部静默失效）
          onClick={handleSelect}
        >
          {item.icon}
          {item.label}
        </P.Item>
      );
    }) ?? null;

const dropdownPrimitives: MenuPrimitiveSet = {
  Item: DropdownMenuItem,
  Separator: DropdownMenuSeparator,
  Sub: DropdownMenuSub,
  SubTrigger: DropdownMenuSubTrigger,
  SubContent: DropdownMenuSubContent,
};

const contextMenuPrimitives: MenuPrimitiveSet = {
  Item: ContextMenuItem,
  Separator: ContextMenuSeparator,
  Sub: ContextMenuSub,
  SubTrigger: ContextMenuSubTrigger,
  SubContent: ContextMenuSubContent,
};

const usesContextMenuTrigger = (trigger: Array<'click' | 'hover' | 'contextMenu'> | undefined) =>
  Array.isArray(trigger) && trigger.includes('contextMenu');

/** antd placement 语义 → Base UI side/align（A1 漏网补档：此前声明未接线被静默丢弃——
 * graph-side-toolbar 的 bottomRight 菜单实际恒左对齐弹出） */
const PLACEMENT_MAP: Record<string, { side: 'top' | 'bottom' | 'left' | 'right'; align: 'start' | 'center' | 'end' }> =
  {
    top: { side: 'top', align: 'center' },
    topLeft: { side: 'top', align: 'start' },
    topRight: { side: 'top', align: 'end' },
    bottom: { side: 'bottom', align: 'center' },
    bottomLeft: { side: 'bottom', align: 'start' },
    bottomRight: { side: 'bottom', align: 'end' },
  };

export const Dropdown: React.FC<{
  menu?: MenuProps;
  trigger?: Array<'click' | 'hover' | 'contextMenu'>;
  placement?: string;
  /** overlayStyle 经 style 落 Popup（minWidth 等布局类由此生效）；arrow/destroyPopupOnHide/
   * transitionName 三员已随 2.0 终清（Base UI 无对应语义，no-op 时代结束） */
  overlayStyle?: React.CSSProperties;
  disabled?: boolean;
  children?: React.ReactNode;
}> = ({ menu, trigger, placement = 'bottomLeft', overlayStyle, children }) => {
  const wrappedChildren = React.isValidElement(children) ? (
    children
  ) : (
    <span className='inline-flex cursor-pointer items-center'>{children}</span>
  );
  const placementMapped = PLACEMENT_MAP[placement] ?? PLACEMENT_MAP.bottomLeft;

  if (usesContextMenuTrigger(trigger)) {
    return (
      <ContextMenu>
        <ContextMenuTrigger render={wrappedChildren} />
        <ContextMenuContent>{renderMenuItems(menu?.items, menu?.onClick, contextMenuPrimitives)}</ContextMenuContent>
      </ContextMenu>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={wrappedChildren} />
      <DropdownMenuContent side={placementMapped.side} align={placementMapped.align} style={overlayStyle}>
        {renderMenuItems(menu?.items, menu?.onClick, dropdownPrimitives)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
