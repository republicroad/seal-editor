import { Command as CommandIcon, FocusIcon, ListChecksIcon } from 'lucide-react';
import React, { Fragment } from 'react';

import { useT } from '../../../theming/i18n';
import { Button, Tooltip } from '../../primitives';
import { selectDiagnostics, useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';

export type GraphSideToolbarProps = {
  //
};

/** 侧栏（grid-area:sidebar）：单列面板导航——诊断/聚焦/⌘K/宿主面板。
 * 画布空间类工具（undo/redo/auto-layout/导入导出/整理/对比）在画布左上浮动层
 * （graph-canvas-toolbar.tsx，用户裁定终态）。 */
export const GraphSideToolbar: React.FC<GraphSideToolbarProps> = () => {
  const t = useT();
  const { setActivePanel, setCommandMenuOpen, setDiagnosticsOpen, setFocusMode } = useDecisionGraphActions();
  const { panels, activePanel, commandMenuOpen } = useDecisionGraphState(
    ({ panels, activePanel, commandMenuOpen }) => ({
      panels,
      activePanel,
      commandMenuOpen,
    }),
  );
  const diagnosticsOpen = useDecisionGraphState(({ diagnosticsOpen: open }) => open);
  const diagnosticErrorCount = useDecisionGraphState((state) =>
    selectDiagnostics(state).reduce((n, entry) => (entry.severity === 'error' ? n + 1 : n), 0),
  );
  const { focusMode } = useDecisionGraphState(({ focusMode }) => ({ focusMode }));

  return (
    <Fragment>
      <div className={'[grid-area:sidebar] flex h-full min-h-0 bg-[var(--seal-color-bg-container)]'}>
        <div className={'flex w-12 min-w-12 flex-col items-center gap-2 border-r border-r-[var(--border)] py-2'}>
          {/* P0-2 诊断面板开关：错误计数徽标（只读图也可查看诊断） */}
          <Tooltip title={t('dg.diagnostics.title')} placement={'right'}>
            <div className='relative'>
              <Button
                type={'text'}
                aria-label={t('dg.diagnostics.title')}
                aria-pressed={diagnosticsOpen}
                data-testid='diagnostics-toggle'
                icon={<ListChecksIcon className='size-4' />}
                className={diagnosticsOpen ? 'bg-primary/10 text-primary' : undefined}
                onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
              />
              {diagnosticErrorCount > 0 && (
                <span
                  className='pointer-events-none absolute -right-1 -top-1 min-w-3.5 rounded-full bg-[var(--seal-color-error)] px-1 text-center text-[9px] leading-3.5 text-white'
                  data-testid='diagnostics-badge'
                >
                  {diagnosticErrorCount > 99 ? '99+' : diagnosticErrorCount}
                </span>
              )}
            </div>
          </Tooltip>
          {/* P1-5 聚焦模式入口：画布独占（快捷键同通道） */}
          <Tooltip title={t('dg.focus.enter')} placement={'right'}>
            <Button
              type={'text'}
              aria-label={t('dg.focus.enter')}
              aria-pressed={focusMode}
              data-testid='focus-mode-toggle'
              icon={<FocusIcon className='size-4' />}
              className={focusMode ? 'bg-primary/10 text-primary' : undefined}
              onClick={() => setFocusMode(!focusMode)}
            />
          </Tooltip>
          <Tooltip title={t('dg.command.open')} placement='right'>
            <Button
              type='text'
              icon={<CommandIcon className='size-4' />}
              aria-pressed={commandMenuOpen}
              aria-label={t('dg.command.open')}
              data-testid='graph-command-trigger'
              className={commandMenuOpen ? 'bg-primary/10 text-primary' : undefined}
              onClick={() => setCommandMenuOpen(!commandMenuOpen)}
            />
          </Tooltip>
          {(panels || []).map((panel) => {
            const isActive = activePanel === panel.id;
            return (
              <Tooltip
                key={panel.id}
                title={`${!isActive ? 'Open' : 'Close'} ${panel.title.toLowerCase()} panel`}
                placement={'right'}
              >
                <Button
                  key={panel.id}
                  type='text'
                  icon={panel.icon}
                  className={isActive ? 'bg-primary/10 text-primary' : undefined}
                  aria-pressed={isActive}
                  onClick={() => {
                    if (panel?.onClick) return panel.onClick();
                    if (panel?.renderPanel) setActivePanel(isActive ? undefined : panel.id);
                  }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
    </Fragment>
  );
};
