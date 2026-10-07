import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { CommandIcon } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { useT } from '../../../theming/i18n';
import { useDecisionGraphActions, useDecisionGraphState } from '../context/dg-store.context';
import type { CustomNodeSpecification } from '../nodes/custom-node';
import type { NodeSpecification } from '../nodes/specifications/specification-types';

type CommandItem = {
  id: string;
  group: 'add' | 'panel' | 'goto';
  label: string;
  icon: React.ReactNode;
  keywords: string;
  run: () => void;
};

/**
 * ⌘K 全局调色板（批 20）：节点添加 / 面板开合 / 节点跳转 三组条目，
 * Base UI Combobox 组合（external 零包体；filter=null 自管过滤——组语义
 * 无法用单一 matcher 表达，cascader 同款裁定）。
 * 触发：画布区 Ctrl/⌘+K（输入控件与 CM6 内让位）+ 左栏按钮；开合状态住
 * dg-store（触发钮与弹层分居两处，经 store 联通）。
 */
export const GraphCommandMenu: React.FC<{
  addNode: (type: string, position?: { x: number; y: number }, component?: string) => Promise<void> | void;
  /** 全量节点规格清单（内置 + 宿主自定义），由调用方合并（避开 specifications 环） */
  specifications: Array<NodeSpecification | CustomNodeSpecification<object, any>>;
}> = ({ addNode, specifications }) => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const { commandMenuOpen, panels, activePanelId, nodes, extraCommands } = useDecisionGraphState(
    ({ commandMenuOpen, panels, activePanel, decisionGraph, extraCommands }) => ({
      commandMenuOpen,
      panels: panels ?? [],
      extraCommands: extraCommands ?? [],
      activePanelId: activePanel,
      nodes: (decisionGraph.nodes ?? []).filter((node) => node.type !== 'inputNode'),
    }),
  );
  const [query, setQuery] = useState('');

  // ⌘K/Ctrl+K 全局键（输入控件/CM6 内让位——同 dt undo 键盘先例）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyK') {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.('input, textarea, select, [contenteditable], .cm-editor')) {
          return;
        }
        event.preventDefault();
        graphActions.setCommandMenuOpen(!commandMenuOpen);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandMenuOpen, graphActions]);

  const items = useMemo<CommandItem[]>(() => {
    const addItems = specifications.map((specification) => {
      // 内置规格走 type；custom 规格走 customNode + kind（useNodeAdd 同款双轨）
      const isCustom = !('type' in specification);
      const type = isCustom ? 'customNode' : specification.type;
      const kind = isCustom ? (specification as CustomNodeSpecification<object, any>).kind : undefined;
      return {
        id: `add:${kind ?? type}`,
        group: 'add' as const,
        label: String(specification.displayName ?? type),
        icon: specification.icon,
        keywords: `${type} ${kind ?? ''} ${specification.shortDescription ?? ''} add`,
        run: () => {
          void addNode(type, undefined, kind);
        },
      };
    });
    const panelItems = panels.map((panel) => ({
      id: `panel:${panel.id}`,
      group: 'panel' as const,
      label: panel.title,
      icon: panel.icon,
      keywords: `panel ${panel.title}`,
      run: () => graphActions.setActivePanel(activePanelId === panel.id ? undefined : panel.id),
    }));
    const gotoItems = nodes.map((node) => ({
      id: `goto:${node.id}`,
      group: 'goto' as const,
      label: node.name ?? node.id,
      icon: null as React.ReactNode,
      keywords: `goto ${node.type ?? ''} ${node.name ?? ''}`,
      run: () => {
        graphActions.goToNode(node.id);
        graphActions.openTab(node.id);
      },
    }));
    const extra = extraCommands.map((cmd) => ({
      id: cmd.id,
      group: cmd.group as CommandItem['group'],
      label: cmd.label,
      icon: cmd.icon ?? null,
      keywords: cmd.keywords,
      run: cmd.run,
    }));
    return [...extra, ...panelItems, ...gotoItems, ...addItems];
  }, [panels, activePanelId, nodes, specifications, extraCommands, addNode, graphActions]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return items;
    }
    return items.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q));
  }, [items, query]);

  const groupLabel: Record<CommandItem['group'], string> = {
    add: t('dg.command.groupAdd'),
    panel: t('dg.command.groupPanels'),
    goto: t('dg.command.groupNodes'),
  };

  return (
    <ComboboxPrimitive.Root
      items={visible}
      filteredItems={visible}
      filter={null}
      open={commandMenuOpen}
      onOpenChange={(next) => graphActions.setCommandMenuOpen(next)}
      inputValue={query}
      onInputValueChange={(next: string) => setQuery(next)}
      multiple={false}
      onValueChange={(value) => {
        const command = (Array.isArray(visible) ? visible : []).find((item) => item === value);
        if (command) {
          graphActions.setCommandMenuOpen(false);
          setQuery('');
          queueMicrotask(() => command.run());
        }
      }}
    >
      {/* 隐形锚点：弹层定位于画布区顶部居中（VS Code 调色板位） */}
      <ComboboxPrimitive.Trigger
        render={
          <span
            aria-hidden
            style={{ position: 'absolute', left: '50%', top: 10, width: 1, height: 1, overflow: 'hidden' }}
          />
        }
      />
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner side='bottom' align='center' sideOffset={6}>
          <ComboboxPrimitive.Popup
            data-testid='graph-command-menu'
            className='z-50 w-[460px] max-w-[90vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[0_16px_40px_rgba(0,0,0,0.18)]'
          >
            <ComboboxPrimitive.Input
              data-testid='graph-command-input'
              onKeyDown={(event) => {
                // Enter 提交首个匹配（Base UI children 渲染模式无内建高亮——
                // 以首匹配为默认提交对象，与查询排序一致）
                if (event.key === 'Enter' && visible.length > 0) {
                  event.preventDefault();
                  const command = visible[0];
                  graphActions.setCommandMenuOpen(false);
                  setQuery('');
                  queueMicrotask(() => command.run());
                }
              }}
              placeholder={t('dg.command.placeholder')}
              className='h-10 w-full border-b border-[var(--border)] bg-transparent px-3 text-sm outline-none'
            />
            <ComboboxPrimitive.List className='max-h-[320px] overflow-y-auto p-1'>
              {visible.map((item) => (
                <ComboboxPrimitive.Item
                  key={item.id}
                  value={item}
                  data-testid='graph-command-item'
                  className='flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'
                >
                  {item.icon}
                  <span className='min-w-0 flex-1 truncate'>{item.label}</span>
                  <span className='shrink-0 text-[10px] opacity-50'>{groupLabel[item.group]}</span>
                </ComboboxPrimitive.Item>
              ))}
              {visible.length === 0 && (
                <div className='px-3 py-6 text-center text-xs opacity-50'>{t('dg.command.empty')}</div>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
};

/** 左栏触发钮（图标 + 激活态；开合状态住 dg-store） */
export const GraphCommandMenuTrigger: React.FC = () => {
  const t = useT();
  const graphActions = useDecisionGraphActions();
  const commandMenuOpen = useDecisionGraphState(({ commandMenuOpen }) => commandMenuOpen);
  return (
    <button
      type='button'
      data-testid='graph-command-trigger'
      aria-label={t('dg.command.open')}
      title={t('dg.command.open')}
      aria-pressed={commandMenuOpen}
      className={`flex size-8 items-center justify-center rounded-md transition-colors hover:bg-accent ${
        commandMenuOpen ? 'bg-primary/10 text-primary' : ''
      }`}
      onClick={() => graphActions.setCommandMenuOpen(!commandMenuOpen)}
    >
      <CommandIcon className='size-4' />
    </button>
  );
};
