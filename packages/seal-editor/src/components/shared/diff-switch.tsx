import React from 'react';

import { ArrowDiffIcon } from '../arrow-diff-icon';
import { Space, Switch, type SwitchProps } from '../primitives';

export type DiffSwitchProps = {
  previousChecked?: boolean;
  displayDiff?: boolean;
} & SwitchProps;

export const DiffSwitch: React.FC<DiffSwitchProps> = ({ displayDiff, previousChecked, ...rest }) => {
  return (
    <Space size={4}>
      {displayDiff && (
        <>
          {/* 旧值装饰：禁用+半透明+aria-hidden——此前与现行开关同态渲染，
              被误读为重复控件（用户报告） */}
          <Switch disabled size={'small'} checked={previousChecked} aria-hidden className='opacity-50' />
          <ArrowDiffIcon />
        </>
      )}
      <Switch size={'small'} {...rest} />
    </Space>
  );
};
