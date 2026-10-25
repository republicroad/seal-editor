import { NodeResizer, NodeToolbar, Position } from '@xyflow/react';
import clsx from 'clsx';
import React from 'react';

import { useT } from '../../../theming/i18n';
import { useDecisionGraphActions } from '../context/dg-store.context';

/**
 * B1 图可读性工程：注释框节点（Unreal/ComfyUI comment box 形态）。
 * 背景便签：可拖拽/缩放（NodeResizer）/行内编辑文本（nodrag 让位拖拽）；
 * 选中显示删除钮；引擎面不可见（decisionGraph.annotations 承载，非规则节点）。
 */
export const AnnotationNode: React.FC<{ id: string; data: { text?: string }; selected?: boolean }> = ({
  id,
  data,
  selected,
}) => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const annotationId = id.replace(/^annotation-/, '');

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={100}
        lineClassName='!border-[var(--primary)]'
        handleClassName='!rounded-sm !border-[var(--primary)] !bg-[var(--card)]'
      />
      <NodeToolbar isVisible={selected} position={Position.Top}>
        <button
          type='button'
          data-testid='annotation-remove'
          className='rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-xs shadow-sm hover:bg-accent'
          onClick={() => graphActions.removeAnnotation(annotationId)}
        >
          {t('dg.annotation.remove')}
        </button>
      </NodeToolbar>
      <div
        className={clsx(
          'flex h-full w-full flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow',
          'border-[color:var(--seal-color-warning-text)]/30 bg-[var(--seal-color-warning-bg)]',
          selected && 'shadow-md',
        )}
      >
        <div className='flex h-6 shrink-0 items-center justify-between border-b border-[color:var(--seal-color-warning-text)]/20 px-2'>
          <span className='text-[10px] font-medium uppercase tracking-wide opacity-50'>{t('dg.annotation.label')}</span>
        </div>
        <textarea
          className='nodrag nowheel h-full w-full resize-none bg-transparent px-2 py-1 text-xs leading-relaxed opacity-80 outline-none placeholder:opacity-40'
          value={data.text ?? ''}
          placeholder={t('dg.annotation.placeholder')}
          onChange={(e) => graphActions.updateAnnotation(annotationId, { text: e.target.value })}
        />
      </div>
    </>
  );
};
