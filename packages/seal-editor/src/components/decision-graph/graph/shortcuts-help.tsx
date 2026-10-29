import React from 'react';

import { useT } from '../../../theming/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../ui/dialog';

const isMacPlatform = () => /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * P1-3 快捷键帮助面板：非输入焦点按 `?` 弹全量清单（Figma/Linear/GitHub 标配）。
 * 键位显示随平台（mac=⌘，Win/Linux=Ctrl）；清单与 graph.tsx 实际绑定同源维护。
 */
export const ShortcutsHelp: React.FC = () => {
  const t = useT();
  const [open, setOpen] = React.useState(false);
  const isMac = React.useMemo(isMacPlatform, []);
  const mod = isMac ? '⌘' : 'Ctrl';

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable], .monaco-editor, .cm-editor')) {
        return;
      }
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const groups = [
    {
      title: t('dg.shortcuts.group.history'),
      rows: [
        { keys: [`${mod}+Z`], label: t('dg.shortcuts.undo') },
        { keys: isMac ? ['⌘+⇧+Z'] : [`${mod}+Shift+Z`, 'Ctrl+Y'], label: t('dg.shortcuts.redo') },
      ],
    },
    {
      title: t('dg.shortcuts.group.editing'),
      rows: [
        { keys: [`${mod}+C`], label: t('dg.shortcuts.copy') },
        { keys: [`${mod}+D`], label: t('dg.shortcuts.duplicate') },
        { keys: [`${mod}+V`], label: t('dg.shortcuts.paste') },
        { keys: ['Backspace'], label: t('dg.shortcuts.delete') },
      ],
    },
    {
      title: t('dg.shortcuts.group.navigate'),
      rows: [
        { keys: [`${mod}+K`], label: t('dg.shortcuts.command') },
        { keys: ['?'], label: t('dg.shortcuts.help') },
      ],
    },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='max-w-md gap-4' data-testid='shortcuts-help'>
        <DialogHeader>
          <DialogTitle className='text-sm'>{t('dg.shortcuts.title')}</DialogTitle>
        </DialogHeader>
        <div className='flex flex-col gap-4 pb-1'>
          {groups.map((group) => (
            <div key={group.title}>
              <div className='mb-1.5 text-[10px] font-medium tracking-wide text-[var(--muted-foreground)] uppercase'>
                {group.title}
              </div>
              <div className='flex flex-col gap-1'>
                {group.rows.map((row) => (
                  <div key={row.label} className='flex items-center justify-between gap-4 text-xs'>
                    <span className='text-[var(--muted-foreground)]'>{row.label}</span>
                    <span className='flex items-center gap-1'>
                      {row.keys.map((key) => (
                        <kbd
                          key={key}
                          className='rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px]'
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
