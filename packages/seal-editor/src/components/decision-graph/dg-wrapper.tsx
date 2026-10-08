import type { ProOptions } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import React, { forwardRef, useEffect, useRef, useState } from 'react';
import { match } from 'ts-pattern';

import { useDecisionGraphRaw, useDecisionGraphState } from './context/dg-store.context';
import { GraphPanel } from './dg-panel';
import type { UserResolver } from './dg-types';
import type { GraphRef } from './graph/graph';
import { Graph } from './graph/graph';
import { GraphNodes } from './graph/graph-nodes';
import { GraphSideToolbar } from './graph/graph-side-toolbar';
import type { GraphTabsProps } from './graph/graph-tabs';
import { GraphTabs } from './graph/graph-tabs';
import { CustomFunctionTable } from './graph/tab-custom-function-table';
import type { ToolbarItem } from './graph/toolbar-anchor';
import { ToolbarAnchor } from './graph/toolbar-anchor';
import { resolveCustomNode } from './nodes/resolve-custom-node';
import { decisionTableSpecification } from './nodes/specifications/decision-table.specification';
import { expressionSpecification } from './nodes/specifications/expression.specification';
import { functionSpecification } from './nodes/specifications/function.specification';
import { inputSpecification } from './nodes/specifications/input.specification';
import { outputSpecification } from './nodes/specifications/output.specification';
import { NodeKind } from './nodes/specifications/specification-types';

export type DecisionGraphWrapperProps = {
  reactFlowProOptions?: ProOptions;
  tabBarExtraContent?: GraphTabsProps['tabBarExtraContent'];
  /**
   * 工具栏注入项（S005 P1）：渲染在页签条右端、原生操作之后，group 变化处
   * 出现分隔线。无注入项时零渲染（与不传完全一致）。
   */
  toolbarItems?: ToolbarItem[];
  userResolver?: UserResolver;
  customFunctions?: any;
};

const ResolveUserEffect: React.FC<{ userResolver?: UserResolver }> = ({ userResolver }) => {
  const { stateStore } = useDecisionGraphRaw();

  useEffect(() => {
    if (!userResolver) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await userResolver();
        if (!cancelled && result) {
          stateStore.setState({ user: result.user ?? '' });
        }
      } catch (err) {
        console.warn('[seal-editor] userResolver failed:', err);
        if (!cancelled) {
          stateStore.setState({ user: '' });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userResolver]);

  return null;
};

export const DecisionGraphWrapper = React.memo(
  forwardRef<GraphRef, DecisionGraphWrapperProps>(function DecisionGraphWrapperInner(
    { reactFlowProOptions, tabBarExtraContent, toolbarItems, userResolver, customFunctions },
    ref,
  ) {
    const [disableTabs, setDisableTabs] = useState(false);
    const { hasActiveNode, viewConfig, hideLeftToolbar } = useDecisionGraphState(
      ({ decisionGraph, activeTab, viewConfig, hideLeftToolbar }) => {
        return {
          hasActiveNode: (decisionGraph?.nodes ?? []).some((node) => node.id === activeTab),
          viewConfig,
          hideLeftToolbar,
        };
      },
    );

    // 无注入项时保持原 tabBarExtraContent 引用不变——零注入零 DOM 差异
    const tabsExtra =
      toolbarItems && toolbarItems.length > 0 ? (
        <>
          {tabBarExtraContent}
          <ToolbarAnchor items={toolbarItems} />
        </>
      ) : (
        tabBarExtraContent
      );

    return (
      <>
        <ResolveUserEffect userResolver={userResolver} />
        {!hideLeftToolbar && <GraphSideToolbar />}
        <div className={'[grid-area:graph] flex flex-1 flex-col gap-1 overflow-hidden bg-white'}>
          <GraphTabs disabled={disableTabs} tabBarExtraContent={tabsExtra} />

          <Graph
            ref={ref}
            className={clsx([!hasActiveNode && !viewConfig?.enabled && 'flex flex-col', hasActiveNode && 'hidden'])}
            reactFlowProOptions={reactFlowProOptions}
            onDisableTabs={setDisableTabs}
          />
          <GraphNodes className={clsx([!hasActiveNode && viewConfig?.enabled && 'flex flex-col'])} />
          <TabContents customFunctions={customFunctions} />
        </div>
        <GraphPanel />
      </>
    );
  }),
);

const TabContents: React.FC<{ customFunctions?: any }> = React.memo(({ customFunctions }) => {
  const { openNodes, activeNodeId, components, user, disabled, customNodes } = useDecisionGraphState(
    ({ decisionGraph, openTabs, activeTab, components, user, disabled, customNodes }) => {
      const activeNodeId = (decisionGraph?.nodes ?? []).find((node) => node.id === activeTab)?.id;
      const openNodes = (decisionGraph?.nodes ?? []).filter((node) => openTabs.includes(node.id));

      return {
        openNodes: openNodes.map(({ id, type, name, content }) => ({
          id,
          type,
          name,
          kind:
            typeof (content as { kind?: unknown } | undefined)?.kind === 'string'
              ? (content as { kind: string }).kind
              : undefined,
          config: (content as { config?: unknown } | undefined)?.config,
        })),
        activeNodeId,
        components,
        user,
        disabled,
        customNodes,
      };
    },
  );

  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div style={{ display: 'contents' }} ref={containerRef}>
      {openNodes.map((node) => (
        <div
          key={node?.id}
          className={clsx([
            'relative h-full w-full flex-1 min-h-0 bg-[var(--seal-color-bg-container)] outline-none focus:outline-none focus-within:outline-none',
            activeNodeId === node?.id ? 'flex flex-col' : 'hidden',
          ])}
        >
          {/* 伸展包裹：列向 + 子级拉满——renderTab 根无论自带 height:100%
              与否都占满面板块（行向会让子元素主轴按内容宽收缩，右栏被拽窄） */}
          <div className='flex min-h-0 w-full flex-1 flex-col overflow-hidden [&>*]:h-full'>
            {match(node?.type)
              .with(NodeKind.DecisionTable, () =>
                decisionTableSpecification?.renderTab?.({ id: node?.id, user, disabled, node }),
              )
              .with(NodeKind.Function, () => functionSpecification?.renderTab?.({ id: node?.id, user, disabled, node }))
              .with(NodeKind.Expression, () =>
                expressionSpecification?.renderTab?.({ id: node?.id, user, disabled, node }),
              )
              .with(NodeKind.Input, () => inputSpecification?.renderTab?.({ id: node?.id, user, disabled, node }))
              .with(NodeKind.Output, () => outputSpecification?.renderTab?.({ id: node?.id, user, disabled, node }))

              .otherwise(() => {
                const component = components.find((cmp) => cmp.type === node.type);
                if (component) {
                  return component?.renderTab?.({ id: node.id, user, customFunctions, disabled, node });
                }

                if (node.kind) {
                  // ADR-017：kind 精确 + tester 谓词统一解析（rank 降序，同 rank 按声明序）
                  const customSpec = resolveCustomNode(customNodes, node);
                  if (customSpec?.renderTab) {
                    return customSpec.renderTab({
                      id: node.id,
                      user,
                      customFunctions,
                      disabled,
                      node: { id: node.id, name: node.name, kind: node.kind, config: node.config },
                    });
                  }
                  // 无自定义 renderTab 的 kind 节点（容器/旧版 UDF）回退到
                  // 自定义函数表格——与 zrule 行为一致
                  return <CustomFunctionTable id={node.id} user={user} customFunctions={customFunctions} />;
                }

                return null;
              })}
          </div>
        </div>
      ))}
    </div>
  );
});
