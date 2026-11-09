import type { DecisionGraphRef, DecisionGraphType } from '@republicroad/seal-editor';
import {
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  PlayIcon,
  Trash2Icon,
} from 'lucide-react';
import * as React from 'react';

import { cn } from '../lib/utils';
import { resolveGraphRef } from './shell-header';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Separator } from './ui/separator';
import { Switch } from './ui/switch';

export type DefaultShellHeaderProps = {
  /** 图文档（enabled 读取与 Export JSON 数据源；SkinnedDecisionGraph 自动传入） */
  graph?: DecisionGraphType;
  disabled?: boolean;
  /**
   * 决策图引用：ref 对象（`useRef` 产物，内部自动解包为当前句柄）或句柄本身；
   * null = 尚未挂载。
   */
  graphRef?: DecisionGraphRef | React.RefObject<DecisionGraphRef | null> | null;
  /** enabled 翻转回调（受控契约：宿主经 onChange 回写后才回显；无回调=开关只读） */
  onEnabledChange?: (enabled: boolean) => void;
  /** 返回导航（无则不渲染 back 钮） */
  onBack?: () => void;
  /** 头部标题（文档名属宿主——kernel 文档无 name 字段） */
  title?: React.ReactNode;
  /** 历史（version-history 数据属宿主 persistence，回调入口制；无则不渲染 History 钮） */
  onOpenHistory?: () => void;
  /** Test Run 动作（skinned 层按 simulateHandler 注入 setActivePanel('simulator')；无回调=按钮禁用） */
  onTestRun?: () => void;
  /** more 菜单 Duplicate（无则不渲染该项） */
  onDuplicate?: () => void;
  /** more 菜单 Delete（destructive，带 AlertDialog 确认；无则不渲染该项） */
  onDelete?: () => void;
  /** 覆盖内建 Export JSON（缺省 = serialize/graph → Blob 下载 decision-graph.json） */
  onExportJson?: () => void;
  /** 右端同步徽标槽（autoPersist 场景由 SkinnedDecisionGraph 注入 SyncStatusBadge） */
  syncBadge?: React.ReactNode;
  className?: string;
};

/**
 * 默认头部（navbar-5 Workflow Editor Navbar 模式）：back link + enabled Switch +
 * History + Test Run 主钮 + more 菜单（Export JSON / Duplicate / Delete）。
 * 形态参照入册 reui-optimization-backlog.md（2026-11-04 复查③）；
 * SkinnedDecisionGraph 经 defaultHeader prop 启用，独立使用同 ShellHeader。
 */
export const DefaultShellHeader: React.FC<DefaultShellHeaderProps> = ({
  graph,
  disabled,
  graphRef,
  onEnabledChange,
  onBack,
  title,
  onOpenHistory,
  onTestRun,
  onDuplicate,
  onDelete,
  onExportJson,
  syncBadge,
  className,
}) => {
  const handle = resolveGraphRef(graphRef);
  const enabled = graph?.enabled ?? true;
  const canExport = !!onExportJson || !!handle || !!graph;
  const testRunDisabled = disabled || !onTestRun;
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const exportJson = () => {
    if (onExportJson) {
      onExportJson();
      return;
    }
    const snapshot = handle?.serialize?.() ?? graph;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'decision-graph.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const runTest = () => onTestRun?.();

  return (
    <header
      className={cn(
        'flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--seal-color-bg-container)] px-4',
        className,
      )}
    >
      <div className='flex min-w-0 items-center gap-2'>
        {onBack && (
          <Button variant='ghost' size='icon-sm' aria-label='Back' title='Back' onClick={onBack}>
            <ChevronLeftIcon />
          </Button>
        )}
        <Switch
          checked={enabled}
          disabled={disabled || !onEnabledChange}
          aria-label='Enable graph'
          onCheckedChange={(checked) => onEnabledChange?.(checked)}
        />
        {title != null && <span className='truncate text-sm font-medium'>{title}</span>}
      </div>
      <div className='flex shrink-0 items-center gap-1'>
        {onOpenHistory && (
          <>
            <Button variant='ghost' size='icon-sm' aria-label='History' title='History' onClick={onOpenHistory}>
              <HistoryIcon />
            </Button>
            <Separator orientation='vertical' className='mx-1 h-5' />
          </>
        )}
        <Button size='sm' className='gap-1.5' disabled={testRunDisabled} onClick={runTest}>
          <PlayIcon className='size-3.5' />
          Test Run
        </Button>
        {(canExport || onDuplicate || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant='ghost'
                  size='icon-sm'
                  aria-label='More options'
                  title='More options'
                  disabled={disabled}
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align='end'>
              {canExport && (
                <DropdownMenuItem onClick={exportJson}>
                  <DownloadIcon />
                  Export JSON
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <CopyIcon />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  {(canExport || onDuplicate) && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className='text-destructive data-highlighted:text-destructive'
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {syncBadge}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this graph?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                onDelete?.();
                setDeleteOpen(false);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};
