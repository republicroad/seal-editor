import { AutoLayoutOutlined } from '#icons';
import { cn } from '#lib/utils';
import { Panel } from '@xyflow/react';
import { EllipsisIcon, Grid2x2Icon, LockIcon, LockOpenIcon, MagnetIcon, Redo2Icon, Undo2Icon } from 'lucide-react';
import React from 'react';
import { toast } from 'sonner';

import { useT } from '../../../theming/i18n';
import type { MenuProps } from '../../primitives';
import { Button, Dropdown, Tooltip } from '../../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';

export type GraphCanvasToolbarProps = {
  //
};

/** 组分隔细线：历史 | 整理 | 模式开关 三组视觉切分 */
const ToolbarDivider: React.FC = () => <div className='mx-0.5 h-5 w-px shrink-0 bg-[var(--border)]' />;

/**
 * 画布左上浮动工具条（用户裁定终态）——三组分隔：历史（undo/redo）｜
 * 整理（auto-layout/对齐网格）｜模式开关（画布锁/吸附，业界惯例成组靠右）
 * ｜⋯（仅对比开关，基线在场才出现；导入导出在侧栏首格 ⇅）。
 * 聚焦模式下随 chrome 整体隐藏（graph.tsx 门控），键盘 ⌘Z 恒可用。
 */
export const GraphCanvasToolbar: React.FC<GraphCanvasToolbarProps> = () => {
  const t = useT();
  const { undo, redo, autoLayout, alignNodesToGrid, setCanvasLocked, setSnapToGrid, setDiffMode } =
    useDecisionGraphActions();
  const { disabled, canvasLocked, snapToGrid, canUndo, canRedo, diffMode, hasDiffBaseline } = useDecisionGraphState(
    ({ disabled, canvasLocked, snapToGrid, canUndo, canRedo, diffMode, hasDiffBaseline }) => ({
      disabled,
      canvasLocked,
      snapToGrid,
      canUndo,
      canRedo,
      diffMode,
      hasDiffBaseline,
    }),
  );

  // ⋯ 菜单：仅剩对比（基线在场）；导入导出组已迁侧栏首格 ⇅ 钮（用户裁定）
  const moreToolItems: MenuProps['items'] = hasDiffBaseline
    ? [
        {
          key: 'diff-view',
          label: (diffMode ? '✓ ' : '') + t('dg.toolbar.diffMode'),
          onClick: () => setDiffMode(!diffMode),
        },
      ]
    : [];

  return (
    <Panel position='top-left' style={{ margin: 10 }}>
      <div className='nodrag nopan flex items-center gap-0.5 rounded-lg border border-[var(--border)] bg-[var(--seal-color-bg-container)] p-0.5 shadow-md'>
        <Tooltip title={t('dg.toolbar.undo')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            className='h-7 w-7 p-0'
            aria-label={t('dg.toolbar.undo')}
            disabled={!canUndo}
            data-testid='undo-button'
            icon={<Undo2Icon className='size-4' />}
            onClick={undo}
          />
        </Tooltip>
        <Tooltip title={t('dg.toolbar.redo')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            className='h-7 w-7 p-0'
            aria-label={t('dg.toolbar.redo')}
            disabled={!canRedo}
            data-testid='redo-button'
            icon={<Redo2Icon className='size-4' />}
            onClick={redo}
          />
        </Tooltip>
        <ToolbarDivider />
        <Tooltip title={t('dg.toolbar.autoLayout')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            className='h-7 w-7 p-0'
            aria-label={t('dg.toolbar.autoLayout')}
            disabled={disabled}
            data-testid='auto-layout'
            icon={<AutoLayoutOutlined />}
            onClick={() => {
              autoLayout().catch((e: unknown) => toast.error(e instanceof Error ? e.message : String(e)));
            }}
          />
        </Tooltip>
        <Tooltip title={t('dg.toolbar.alignToGrid')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            className='h-7 w-7 p-0'
            aria-label={t('dg.toolbar.alignToGrid')}
            disabled={disabled}
            data-testid='align-to-grid'
            icon={<MagnetIcon className='size-4' />}
            onClick={() => {
              alignNodesToGrid();
              toast.success(t('dg.toolbar.alignedToGrid'));
            }}
          />
        </Tooltip>
        <ToolbarDivider />
        <Tooltip title={t('dg.toolbar.snapToGrid')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            aria-label={t('dg.toolbar.snapToGrid')}
            aria-pressed={snapToGrid}
            disabled={disabled}
            data-testid='snap-to-grid-toggle'
            icon={<Grid2x2Icon className='size-4' />}
            className={cn('h-7 w-7 p-0', snapToGrid && 'bg-primary/10 text-primary')}
            onClick={() => setSnapToGrid(!snapToGrid)}
          />
        </Tooltip>
        <Tooltip title={canvasLocked ? t('dg.toolbar.unlockCanvas') : t('dg.toolbar.lockCanvas')} placement={'bottom'}>
          <Button
            type='text'
            size='small'
            aria-label={canvasLocked ? t('dg.toolbar.unlockCanvas') : t('dg.toolbar.lockCanvas')}
            aria-pressed={canvasLocked}
            disabled={disabled}
            data-testid='canvas-lock-toggle'
            icon={canvasLocked ? <LockIcon className='size-4' /> : <LockOpenIcon className='size-4' />}
            className={cn('h-7 w-7 p-0', canvasLocked && 'bg-primary/10 text-primary')}
            onClick={() => setCanvasLocked(!canvasLocked)}
          />
        </Tooltip>
        <ToolbarDivider />
        {moreToolItems.length > 0 && (
          <Dropdown menu={{ items: moreToolItems }} placement='bottomLeft' trigger={['click']}>
            <Button
              type='text'
              size='small'
              className='h-7 w-7 p-0'
              aria-label={t('dg.toolbar.moreTools')}
              data-testid='more-tools'
              icon={<EllipsisIcon className='size-4' />}
            />
          </Dropdown>
        )}
      </div>
    </Panel>
  );
};
