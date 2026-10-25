import { Switch as UiSwitch } from '#components/ui/switch';
import { cn } from '#lib/utils';
import * as React from 'react';

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  size?: 'default' | 'small';
  className?: string;
  style?: React.CSSProperties;
  onChange?: (checked: boolean) => void;
  checkedChildren?: React.ReactNode;
  unCheckedChildren?: React.ReactNode;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  defaultChecked,
  disabled,
  size,
  className,
  style,
  onChange,
  // A1 sweep 归档：antd-parity 装饰子（开关内双态文案），Base UI Switch 无此插槽
  checkedChildren: _checkedChildren,
  unCheckedChildren: _unCheckedChildren,
}) => (
  <UiSwitch
    checked={checked === undefined ? undefined : !!checked}
    defaultChecked={defaultChecked}
    disabled={disabled}
    onCheckedChange={(next) => onChange?.(next === true)}
    className={cn(size === 'small' && 'data-checked:translate-x-3.5 h-4 w-7 [&_span]:size-3', className)}
    style={style}
  />
);
