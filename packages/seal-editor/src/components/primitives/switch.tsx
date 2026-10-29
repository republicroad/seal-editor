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
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  defaultChecked,
  disabled,
  size,
  className,
  style,
  onChange,
}) => (
  <UiSwitch
    checked={checked === undefined ? undefined : !!checked}
    defaultChecked={defaultChecked}
    disabled={disabled}
    onCheckedChange={(next) => onChange?.(next === true)}
    // small 覆写：w-7(28) 轨道 + 12px 拇指——Base UI 内建拇指位移 calc(100%-2px)
    // 只走 10px，差 4px 到右缘；此前的修法把 translate 挂在根元素（整个开关
    // 随 checked 平移 14px=用户看到的"点击后向左偏移"）——正确做法是位移
    // 限定到拇指 span（14px 走满 26/28，留 2px 边距）
    className={cn(size === 'small' && 'h-4 w-7 [&_span]:size-3 [&[data-checked]_span]:translate-x-3.5', className)}
    style={style}
  />
);
