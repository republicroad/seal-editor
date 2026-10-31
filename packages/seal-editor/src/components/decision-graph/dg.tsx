import { ReactFlowProvider } from '@xyflow/react';
import clsx from 'clsx';
import { forwardRef } from 'react';

import { JdmConfigProvider, type ThemeConfig } from '../../theme';
import type { ThemeSeeds } from '../../theming/derive';
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
  /** 皮肤种子（2.2.0 / verdict 提案二追加）：随透传进内核作用域，品牌派生在
   *  内层 Provider 完成——宿主免外包 Provider 即得完整皮肤派生（seeds/token） */
  seeds?: ThemeSeeds;
};

export type DecisionGraphRef = GraphRef;

export const DecisionGraph = forwardRef<DecisionGraphRef, DecisionGraphProps & DecisionGraphThemeOptions>(
  ({ reactFlowProOptions, tabBarExtraContent, toolbarItems, userResolver, theme, seeds, ...props }, ref) => {
    // M2 自持岛根（ADR-025）：内核自渲染 .seal-root——宿主不再需要提供岛根
    // div/类名；theme.mode 显式时写 data-mode，未传则不写=继承最近祖先作用域
    // （宿主自身 data-mode 驱动），两者皆无回落基础亮色。透明表面透宿主底、
    // data-mode 双写抖动等问题自此结构性消失。
    const content = (
      <SafeBoundary>
        <div className='seal-root' data-mode={theme?.mode}>
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
        </div>
      </SafeBoundary>
    );
    // 主题透传口（ADR-025 M1）：宿主传 theme 时条件内嵌 chrome=false 的
    // JdmConfigProvider（内核节点色彩消费 ThemeModeContext/computeTheme）——
    // 未传=零改动（外层 Provider/装饰器路径照旧）；confirmState 全局单源，
    // 内层 chrome=false 防 ConfirmHost 双挂（3e87c8a7 回归面）
    return theme || seeds ? (
      <JdmConfigProvider theme={theme} seeds={seeds} chrome={false}>
        {content}
      </JdmConfigProvider>
    ) : (
      content
    );
  },
);
