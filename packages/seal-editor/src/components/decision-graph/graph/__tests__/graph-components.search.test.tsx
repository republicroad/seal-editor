// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { useContext } from 'react';
import { describe, expect, it } from 'vitest';

import { DecisionGraphProvider, DecisionGraphStoreContext } from '../../context/dg-store.context';
import { GraphComponents } from '../graph-components';

/**
 * 节点搜索默认在位：阈值口径 = 全量节点（核心 6 类 + 自定义）而非仅自定义——
 * 独立应用零自定义也过线（6 > 5），自定义节点增多时搜索先行可用。
 */

type ContextValue = React.ContextType<typeof DecisionGraphStoreContext>;

let ctx: ContextValue | null = null;

const Probe: React.FC = () => {
  ctx = useContext(DecisionGraphStoreContext);
  return null;
};

const renderPanel = () =>
  render(
    <DecisionGraphProvider>
      <Probe />
      <GraphComponents />
    </DecisionGraphProvider>,
  );

const seedCustomNodes = (nodes: unknown[]) => {
  act(() => {
    ctx!.stateStore.setState({ customNodes: nodes as never });
  });
};

describe('GraphComponents 节点搜索（默认在位）', () => {
  it('零自定义节点时搜索框可见（核心 6 类已过 5 阈值）', () => {
    renderPanel();
    expect(screen.getByPlaceholderText('Search components...')).toBeInTheDocument();
  });

  it('按 displayName 过滤：命中自定义节点、未命中核心节点隐藏', async () => {
    const user = userEvent.setup();
    renderPanel();
    seedCustomNodes([
      {
        type: 'customNode',
        kind: 'roster',
        displayName: '身份证实名认证集合',
        shortDescription: '函数集合(2)',
        group: '自定义函数',
        searchKeywords: ['roster_query', 'id_card'],
        generateNode: () => ({ name: 'n' }),
      },
    ]);

    await user.type(screen.getByPlaceholderText('Search components...'), '身份证');

    expect(screen.getByText('身份证实名认证集合')).toBeInTheDocument();
    expect(screen.queryByText('Decision Table')).not.toBeInTheDocument();
  });

  it('过滤后命中数跌破阈值时搜索框不卸载（口径取未过滤全量）', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.type(screen.getByPlaceholderText('Search components...'), 'zzz-no-match-at-all');

    expect(screen.getByPlaceholderText('Search components...')).toBeInTheDocument();
    expect(screen.queryByText('Decision Table')).not.toBeInTheDocument();
  });
});
