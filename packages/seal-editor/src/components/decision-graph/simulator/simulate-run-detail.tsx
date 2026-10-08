import { CodeBlock, CodeBlockCopyButton, CodeBlockExpandButton } from '#reui/code-block/code-block';
import json5 from 'json5';
import React from 'react';

import { useT } from '../../../theming/i18n';

/**
 * 单笔 Run 的输出/错误详情（code-block 渲染）——被 simulate-runs-panel 以
 * React.lazy 挂载，使 code-block 组件连同 shiki 全部留在动态 chunk
 * （field-picker-popup 同款隔离），index 主包零增重。Suspense fallback =
 * 面板内的裸 <pre>（渐进增强，chunk 加载期间内容不缺席）。
 */
export const SimulateRunDetail: React.FC<{ detail: unknown }> = ({ detail }) => {
  const t = useT();
  const code = json5.stringify(detail, undefined, 2) ?? 'null';

  return (
    <div className='relative' data-testid='simulate-run-detail'>
      <CodeBlock
        code={code}
        language='json'
        variant='ghost'
        foldable
        maxLines={16}
        showLineNumbers={false}
        className='max-h-64 rounded-md bg-muted/60 font-mono text-[10px] leading-relaxed'
      >
        <CodeBlockExpandButton className='text-[10px]' />
      </CodeBlock>
      <CodeBlockCopyButton
        value={code}
        position='pinned'
        alwaysVisible
        className='absolute right-1.5 top-1.5 size-5 text-muted-foreground opacity-60 hover:opacity-100'
        labels={{ copy: t('dg.simulation.copy'), copied: t('dg.simulation.copied') }}
      />
    </div>
  );
};
