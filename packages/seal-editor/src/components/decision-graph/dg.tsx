import { ReactFlowProvider } from '@xyflow/react';
import clsx from 'clsx';
import { forwardRef } from 'react';

import { JdmConfigProvider, type ThemeConfig } from '../../theme';
import { SafeBoundary } from '../safe-boundary';
import type { DecisionGraphContextProps } from './context/dg-store.context';
import { DecisionGraphProvider } from './context/dg-store.context';
import { SerializerProvider } from './context/serializer.context';
import type { DecisionGraphEmptyType } from './dg-empty';
import { DecisionGraphEmpty } from './dg-empty';
import { DecisionGraphInferTypes } from './dg-infer';
import type { DecisionGraphWrapperProps } from './dg-wrapper';
import { DecisionGraphWrapper } from './dg-wrapper';
import type { GraphRef } from './graph/graph';

export type DecisionGraphProps = {} & DecisionGraphWrapperProps & DecisionGraphContextProps & DecisionGraphEmptyType;

/** 主题透传口（2.1.0，ADR-025 M1 / verdict 提案二）：宿主不经外部 JdmConfigProvider
 *  时经此传模式——内核条件内嵌 chrome=false 的 Provider（ThemeModeContext/token
 *  注入/data-mode 写入），Toaster/ConfirmHost 仍归外层宿主层单源。未传=零改动。 */
export type DecisionGraphThemeOptions = {
  theme?: ThemeConfig;
};

export type DecisionGraphRef = GraphRef;

export const DecisionGraph = forwardRef<DecisionGraphRef, DecisionGraphProps & DecisionGraphThemeOptions>(
  ({ reactFlowProOptions, tabBarExtraContent, toolbarItems, userResolver, theme, ...props }, ref) => {
    const content = (
      <SafeBoundary>
        <div className={clsx(['seal-dg', props?.hideLeftToolbar && 'hidden-left-toolbar'])}>
          <ReactFlowProvider>
            <DecisionGraphProvider>
              <SerializerProvider>
                <DecisionGraphWrapper
                  ref={ref}
                  reactFlowProOptions={reactFlowProOptions}
                  tabBarExtraContent={tabBarExtraContent}
                  toolbarItems={toolbarItems}
                  userResolver={userResolver}
                  customFunctions={props.customFunctions}
                />
                <DecisionGraphInferTypes />
                <DecisionGraphEmpty {...props} />
              </SerializerProvider>
            </DecisionGraphProvider>
          </ReactFlowProvider>
        </div>
      </SafeBoundary>
    );
    // 主题透传口（ADR-025 M1）：宿主传 theme 时条件内嵌 chrome=false 的
    // JdmConfigProvider（内核节点色彩消费 ThemeModeContext/computeTheme）——
    // 未传=零改动（外层 Provider/装饰器路径照旧）；confirmState 全局单源，
    // 内层 chrome=false 防 ConfirmHost 双挂（3e87c8a7 回归面）
    return theme ? (
      <JdmConfigProvider theme={theme} chrome={false}>
        {content}
      </JdmConfigProvider>
    ) : (
      content
    );
  },
);
