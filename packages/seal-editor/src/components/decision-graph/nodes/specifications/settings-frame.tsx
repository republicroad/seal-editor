import { Frame, FrameHeader, FramePanel, FrameTitle } from '#reui/frame';
import React from 'react';

/**
 * 节点设置面板的统一壳（WS2 填缝 #4）：spec 的 renderSettings 内容统一由
 * Frame 承载——标题/描述/分区规范化。保留 `settings-form` 类：node-inspector
 * 与 decision-node 的父级选择器（[&_.settings-form_.seal-ce]）依赖它做字号级联。
 *
 * 密度（批次二规范化）：设置面板嵌在画布小卡 / 停靠检查器两种窄容器里，
 * 统一 `spacing='xs'` 档（frame 默认 default 档在小卡片里总内边距 ~22px）；
 * FramePanel 间距 gap-3 → gap-2 同步收紧。
 */
export const SettingsFrame: React.FC<{
  title: string;
  description?: string;
  children: React.ReactNode;
}> = ({ title, description, children }) => (
  <Frame className='settings-form w-full' spacing='xs'>
    <FrameHeader>
      <FrameTitle>{title}</FrameTitle>
      {description ? <p className='text-muted-foreground text-xs'>{description}</p> : null}
    </FrameHeader>
    <FramePanel className='flex flex-col gap-2'>{children}</FramePanel>
  </Frame>
);

/**
 * 批次二规范化：DiffCodeEditor 的内联样式曾在 decision-table / expression
 * 两个 spec 逐字重复（fontSize 12 / lineHeight 20px / 宽度 100%）——收编为
 * 共享常量（同面板与其余控件靠 .settings-form 级联 text-xs 不同，这里显式
 * 指定字号与行高）。
 */
export const settingsCodeEditorStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: '20px',
  width: '100%',
};
