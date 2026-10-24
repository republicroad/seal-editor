import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { FunctionDebugger } from '../function/function-debugger';

/**
 * ADR-024 D2 回归：Libraries 页签渲染宿主注入目录——此前调用点写死内置
 * functionLibraries（big.js/dayjs/http/zen…），宿主函数目录无法进入编辑器
 * 一等参考面。
 */
describe('FunctionDebugger libraries tab', () => {
  it('renders host-injected libraries instead of defaults', async () => {
    const user = userEvent.setup();
    render(
      <FunctionDebugger
        libraries={[
          {
            name: 'verdict-fns',
            tagline: 'verdict 平台函数',
            typeDef: 'declare function roster_query(value: string): boolean;',
            documentationUrl: '/docs/functions/roster',
          },
        ]}
      />,
    );

    await user.click(screen.getByText('Libraries'));
    expect(screen.getByText('verdict-fns')).toBeInTheDocument();
    expect(screen.queryByText('big.js')).not.toBeInTheDocument();
  });
});
