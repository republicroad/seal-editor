import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import clsx from 'clsx';
import { CommandIcon } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../../theming/i18n';
import { useSealPortalContainer } from '../../../theming/portal-context';
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

/** recent 命令（⌘K 二期）：执行序上浮，去重 cap 3（localStorage 不可用静默降级） */
const RECENT_KEY = 'seal.dg.command.recent';

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
  const sealContainer = useSealPortalContainer();
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

  // recent 命令上浮：仅空 query 生效（有过滤意图时排序权归匹配本身）；
  // 每次开面板重读一次 localStorage（执行写回后的下一次打开可见）
  const recentIds = useMemo(() => {
    if (!commandMenuOpen) {
      return [];
    }
    try {
      return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
    } catch {
      return [];
    }
  }, [commandMenuOpen]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source =
      q || recentIds.length === 0
        ? items
        : [
            ...recentIds
              .map((id) => items.find((item) => item.id === id))
              .filter((item): item is CommandItem => Boolean(item)),
            ...items.filter((item) => !recentIds.includes(item.id)),
          ];
    if (!q) {
      return source;
    }
    return source.filter((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(q));
  }, [items, query, recentIds]);

  // ⌘K 二期：↑↓ 高亮导航——Base UI children 渲染模式无内建高亮/键盘序，
  // activeIndex 自管（Enter 提交高亮项，缺省 0=首匹配，与旧「Enter=首匹配」兼容）
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [query, commandMenuOpen]);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!commandMenuOpen) {
      return;
    }
    // jsdom 无 scrollIntoView——可选链调用兜底
    listRef.current?.querySelector('[data-command-active]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, commandMenuOpen]);

  const commit = (command: CommandItem) => {
    graphActions.setCommandMenuOpen(false);
    setQuery('');
    // recent 命令：执行序上浮（去重 cap 3，空 query 时置顶）
    try {
      const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as string[];
      const next = [command.id, ...raw.filter((id) => id !== command.id)].slice(0, 3);
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      /* localStorage 不可用（隐私模式等）静默降级 */
    }
    queueMicrotask(() => command.run());
  };

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
          commit(command);
        }
      }}
    >
      {/* container 必传：缺省 portal 到 body 即落在 .seal-root 岛外，--card 等
          token 不达 → 调色板背景透明（HK-14 同款，全家 overlay 惯例） */}
      <ComboboxPrimitive.Portal container={sealContainer}>
        {/* 虚拟锚点：iframe 视口顶部居中（VS Code 调色板位）——DOM 锚（absolute
            /fixed）的包含块都会被 transform 祖先劫持且随视图漂移（画布视图 vs
            节点页签视图定位语境不同，页签一开 palette 就偏）；虚拟矩形对 DOM
            语境免疫 */}
        <ComboboxPrimitive.Positioner
          anchor={{
            getBoundingClientRect: () => new DOMRect(window.innerWidth / 2, 10, 0, 0),
          }}
          side='bottom'
          align='center'
          sideOffset={6}
          className='z-50'
        >
          <ComboboxPrimitive.Popup
            data-testid='graph-command-menu'
            className='z-50 w-[460px] max-w-[90vw] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)] shadow-[0_16px_40px_rgba(0,0,0,0.18)]'
          >
            <ComboboxPrimitive.Input
              data-testid='graph-command-input'
              onKeyDown={(event) => {
                // ↑↓ 移动高亮（children 渲染模式自管序）；Enter 提交高亮项
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  if (visible.length === 0) {
                    return;
                  }
                  event.preventDefault();
                  setActiveIndex((i) =>
                    event.key === 'ArrowDown' ? (i + 1) % visible.length : (i - 1 + visible.length) % visible.length,
                  );
                  return;
                }
                if (event.key === 'Enter' && visible.length > 0) {
                  event.preventDefault();
                  commit(visible[Math.min(activeIndex, visible.length - 1)]);
                }
              }}
              placeholder={t('dg.command.placeholder')}
              className='h-10 w-full border-b border-[var(--border)] bg-transparent px-3 text-sm outline-none'
            />
            <ComboboxPrimitive.List ref={listRef} className='max-h-[320px] overflow-y-auto p-1'>
              {visible.map((item, index) => (
                <ComboboxPrimitive.Item
                  key={item.id}
                  value={item}
                  data-testid='graph-command-item'
                  data-command-active={index === activeIndex || undefined}
                  onMouseMove={() => setActiveIndex(index)}
                  // 视觉统一走自管 activeIndex（Base UI children 渲染模式内部仍有
                  // 一套 arrow 高亮——data-highlighted 钩子移除，避免双高亮叠加；
                  // Enter/箭头已 preventDefault 让位，内部序不参与提交）
                  className={clsx(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-xs outline-none',
                    index === activeIndex && 'bg-accent text-accent-foreground',
                  )}
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
