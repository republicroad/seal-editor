import clsx from 'clsx';
import React from 'react';

import type { RadioGroupProps } from '../primitives';
import { Radio } from '../primitives';

export type DiffRadioProps = {
  previousValue?: string;
  displayDiff?: boolean;
} & RadioGroupProps;

export const DiffRadio: React.FC<DiffRadioProps> = ({ displayDiff, previousValue, options, ...rest }) => {
  // 分段控件形态（Figma/Linear 检查器惯例，dt 侧 Data type/hitPolicy 同款）：
  // 2-3 项互斥选组用 Button 分段——未选中项 muted 可读（圆点式未选标签对比度
  // 塌陷，用户报告），触达面积更大；diff 装饰沿用（旧值删除线/新值着色）
  return (
    <Radio.Group {...rest}>
      {(options || []).map((option: any) => (
        <Radio.Button
          value={option.value}
          key={option.value}
          className={clsx([
            displayDiff &&
              option.value === previousValue &&
              'text-[var(--destructive)] line-through decoration-[var(--destructive)]',
            displayDiff && option.value === rest.value && 'text-[var(--seal-color-success)]',
          ])}
        >
          {option.label}
        </Radio.Button>
      ))}
    </Radio.Group>
  );
};
