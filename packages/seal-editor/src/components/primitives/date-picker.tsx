import { cn } from '#lib/utils';
import dayjs, { type Dayjs } from 'dayjs';
import * as React from 'react';

import { borderlessInputClass } from './shared';

export interface DatePickerProps {
  value?: Dayjs | null;
  onChange?: (date: Dayjs | null) => void;
  disabled?: boolean;
  allowClear?: boolean;
  size?: 'large' | 'middle' | 'small';
  /** 含时间选择（input type 切 datetime-local，值格式 YYYY-MM-DDTHH:mm） */
  showTime?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
}

const toDayjs = (raw: string) => dayjs(raw);

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  disabled,
  allowClear = true,
  className,
  style,
  placeholder,
  showTime = false,
}) => (
  <input
    type={showTime ? 'datetime-local' : 'date'}
    value={value?.format ? value.format(showTime ? 'YYYY-MM-DDTHH:mm' : 'YYYY-MM-DD') : ''}
    placeholder={placeholder}
    disabled={disabled}
    onChange={(event) => {
      if (!event.target.value) {
        if (allowClear) onChange?.(null);
        return;
      }
      const parsed = toDayjs(event.target.value);
      if (parsed.isValid()) onChange?.(parsed);
    }}
    className={cn(
      borderlessInputClass,
      'w-full rounded-md border border-input shadow-xs focus-visible:border-ring',
      className,
    )}
    style={style}
  />
);

export const TimePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  disabled,
  allowClear = true,
  className,
  style,
}) => (
  <input
    type='time'
    value={value?.format ? value.format('HH:mm') : ''}
    disabled={disabled}
    onChange={(event) => {
      if (!event.target.value) {
        if (allowClear) onChange?.(null);
        return;
      }
      const parsed = toDayjs(`2000-01-01 ${event.target.value}`);
      if (parsed.isValid()) onChange?.(parsed);
    }}
    className={cn(
      borderlessInputClass,
      'w-full rounded-md border border-input shadow-xs focus-visible:border-ring',
      className,
    )}
    style={style}
  />
);
