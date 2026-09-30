import { CloseOutlined } from '#icons';
import { Resizable } from 're-resizable';
import React, { useMemo } from 'react';

import { useT } from '../../theming/i18n';
import { Button, Tooltip, Typography } from '../primitives';
import { useDecisionGraphActions, useDecisionGraphState } from './context/dg-store.context';

const heightKey = 'jdmEditor:graphPanel:height';

export const GraphPanel: React.FC = () => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const { panels, activePanel: activePanelId } = useDecisionGraphState(({ panels, activePanel }) => ({
    panels,
    activePanel,
  }));

  const activePanel = useMemo(() => {
    return activePanelId === undefined ? undefined : (panels || []).find((panel) => panel.id === activePanelId);
  }, [activePanelId, panels]);

  const defaultHeight = useMemo(() => {
    return Number.parseFloat(localStorage.getItem(heightKey) ?? '') ?? 300;
  }, [activePanel]);

  if (!activePanel) return null;

  return (
    <Resizable
      className={
        // 浮层抽屉（宿主 2026-09-30 裁定）：从编辑面底部向上浮起、覆盖画布
        // （不再占用 grid-area:bottom 行挤压布局）。.seal-dg 为定位祖先；侧栏
        // simulator 按钮为开关（再次点击收起）。收起时 bottom 行自然塌缩为 0。
        // 定位走 inline style：re-resizable 自带 .re-resizable { position: relative }
        // 会在类级层叠里压掉 Tailwind 的 absolute（实测：面板退化成自动放置的
        // grid 项、落到 component 列右侧）——inline 永远赢。
        'flex w-full flex-col border-t border-t-[var(--border)] bg-[var(--seal-color-primary-bg-fade)]'
      }
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 30,
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.12)',
      }}
      defaultSize={{ height: defaultHeight }}
      handleStyles={{
        bottom: { display: 'none' },
        left: { display: 'none' },
        topLeft: { display: 'none' },
        topRight: { display: 'none' },
        right: { display: 'none' },
        bottomLeft: { display: 'none' },
        bottomRight: { display: 'none' },
      }}
      maxHeight={500}
      minHeight={150}
      onResize={(event, direction, elementRef) => {
        localStorage.setItem(heightKey, elementRef.clientHeight.toString());
      }}
    >
      {!activePanel.hideHeader && (
        <div
          className={
            'flex flex-row items-center justify-start gap-2 border-b border-b-[var(--border)] py-1 pl-2 pr-1 [&>span]:text-[13px]'
          }
        >
          <div className={'grow'}>
            <Typography.Text style={{ fontSize: 13 }}>{activePanel.title}</Typography.Text>
          </div>
          <div className={'shrink'}>
            <Tooltip placement='topLeft' title={t('dg.toolbar.closeClose')}>
              <Button
                size={'small'}
                type={'text'}
                icon={<CloseOutlined style={{ fontSize: 12 }} />}
                onClick={() => graphActions.setActivePanel(undefined)}
              />
            </Tooltip>
          </div>
        </div>
      )}
      <div className={'min-h-0 flex-1 overflow-hidden'}>{activePanel?.renderPanel?.()}</div>
    </Resizable>
  );
};
