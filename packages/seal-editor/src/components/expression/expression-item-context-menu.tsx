import React from 'react';

import { useT } from '../../theming/i18n';
import { Dropdown } from '../primitives';
import { SpacedText } from '../spaced-text';

type ExpressionItemContextMenuProps = {
  index: number;
  disabled?: boolean;
  addRowAbove: (index: number) => void;
  addRowBelow: (index: number) => void;
  children: React.ReactNode;
};

/**
 * Store-agnostic context menu shared by the decision-table and
 * custom-function-table expression lists. The two expression stores are
 * separate modules with divergent entry types, so callers wire their own
 * store actions through props instead of this component reading a context.
 */
export const ExpressionItemContextMenu: React.FC<ExpressionItemContextMenuProps> = ({
  index,
  disabled,
  addRowAbove,
  addRowBelow,
  children,
}) => {
  const t = useT();

  return (
    <Dropdown
      destroyPopupOnHide
      transitionName=''
      disabled={disabled}
      overlayStyle={{ minWidth: 200 }}
      trigger={['contextMenu']}
      menu={{
        items: [
          {
            key: 'addRowAbove',
            label: <SpacedText left={t('expression.addRowAbove')} />,
            onClick: () => {
              addRowAbove(index);
            },
          },
          {
            key: 'addRowBelow',
            label: <SpacedText left={t('expression.addRowBelow')} />,
            onClick: () => {
              addRowBelow(index);
            },
          },
        ],
      }}
    >
      {/* 全尺寸容器：children 是数组时 Dropdown 会包 inline-flex span 收缩到内容宽，
          选中框因此占不满单元格——单元素 children 走原样分支 + h/w-full 撑满格子 */}
      <div className='h-full w-full'>{children}</div>
    </Dropdown>
  );
};
