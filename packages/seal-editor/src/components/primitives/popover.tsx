import {
  Popover as UiPopover,
  PopoverContent as UiPopoverContent,
  PopoverTrigger as UiPopoverTrigger,
} from '#components/ui/popover';
import * as React from 'react';

export interface PopoverProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  content?: React.ReactNode;
  title?: React.ReactNode;
  trigger?: Array<'click' | 'hover' | 'contextMenu'> | 'click' | 'hover' | 'contextMenu';
  placement?: string;
  destroyTooltipOnHide?: boolean;
  arrow?: boolean;
  overlayClassName?: string;
  disabled?: boolean;
  children?: React.ReactNode;
}

type Side = 'top' | 'bottom' | 'left' | 'right';
type Align = 'start' | 'center' | 'end';

/** antd placement 语义 → Base UI side/align（A1 sweep：此前声明未接线被静默丢弃） */
const PLACEMENT_MAP: Record<string, { side: Side; align: Align }> = {
  topLeft: { side: 'top', align: 'start' },
  top: { side: 'top', align: 'center' },
  topRight: { side: 'top', align: 'end' },
  bottomLeft: { side: 'bottom', align: 'start' },
  bottom: { side: 'bottom', align: 'center' },
  bottomRight: { side: 'bottom', align: 'end' },
  left: { side: 'left', align: 'center' },
  right: { side: 'right', align: 'center' },
};

let warnedTrigger = false;

export const Popover: React.FC<PopoverProps> = ({
  open,
  onOpenChange,
  content,
  trigger,
  placement,
  overlayClassName,
  disabled,
  children,
  // antd-parity no-op（A1 sweep 归档）：Base UI 无箭头、关闭即卸载、title 由调用方
  // 自渲染；defaultOpen 零调用面（归档随 2.0 清点）
  title: _title,
  destroyTooltipOnHide: _destroyTooltipOnHide,
  arrow: _arrow,
  defaultOpen: _defaultOpen,
}) => {
  // trigger 语义面：Base UI Trigger 仅 click 开合；hover/contextMenu 传值属迁移噪声。
  // 告警走 effect（副作用不出渲染——react-compiler 纯度铁律）
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production' || warnedTrigger) {
      return;
    }
    const values = Array.isArray(trigger) ? trigger : trigger ? [trigger] : ['click'];
    if (values.some((v) => v !== 'click')) {
      warnedTrigger = true;
      console.warn('[seal] Popover: only trigger="click" is supported (hover/contextMenu ignored).');
    }
  }, [trigger]);

  const placement_ = placement ? PLACEMENT_MAP[placement] : undefined;
  const handleOpenChange = (next: boolean) => {
    if (disabled) {
      return;
    }
    onOpenChange?.(next);
  };

  return (
    <UiPopover open={open} onOpenChange={handleOpenChange}>
      {/*
       * Wrap the child in a real DOM element unconditionally: Base UI
       * `render` merges its handlers into the rendered element, and cloning
       * through a non-DOM subtree (e.g. a Tooltip context provider wrapping a
       * Button, as dialog row actions do) silently drops them.
       */}
      <UiPopoverTrigger render={<span className='inline-flex'>{children}</span>} />
      {/* overlayClassName = 层叠语义，落 Positioner（transform 自建层叠上下文，
          落在 Popup 上出不去）；布局类走 content 内部自行控制 */}
      <UiPopoverContent positionerClassName={overlayClassName} side={placement_?.side} align={placement_?.align}>
        {content}
      </UiPopoverContent>
    </UiPopover>
  );
};
