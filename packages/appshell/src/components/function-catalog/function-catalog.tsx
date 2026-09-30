import React, { useMemo, useState } from 'react';

import type { CatalogFilter } from '../../hooks/useCustomNodes';
import { type CustomFunctionTool, type CustomNodeNamespace } from '../../lib/custom-node-types';
import PlayCircleIcon from '../../reui/icons/animated/outline/play-circle';
import PlusCircleIcon from '../../reui/icons/animated/outline/plus-circle';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Sheet, SheetContent } from '../ui/sheet';

/**
 * 函数目录（A1，移植自 jdm UDF Lab 抽屉并产品化）：按 namespace 分组的函数
 * 浏览面——签名/参数/返回 + 一键插入画布 + REPL 试运行入口。
 *
 * - A4：弃用工具整卡警示（warning tint + 徽章 + note 行）
 * - ADR-010 Phase 2：`filter` 仅作用于本目录视图（补全/REPL 不跟随，授权全集
 *   仍可用）；origin 徽标位待 ADR-009 #1/#2 透传后补
 * - 组件无状态（除搜索框）；宿主持有 open/onInsert 编排
 */
export const FunctionCatalog: React.FC<{
  schema: CustomNodeNamespace[] | null;
  open: boolean;
  onClose: () => void;
  onInsert: (tool: CustomFunctionTool) => void;
  /** 批 2（A3）：送入 REPL 试运行 */
  onTry?: (tool: CustomFunctionTool) => void;
  /** ADR-010：目录面过滤谓词（体验层） */
  filter?: CatalogFilter;
}> = ({ schema, open, onClose, onInsert, onTry, filter }) => {
  const [search, setSearch] = useState('');

  const namespaces = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (schema ?? [])
      .map((ns) => ({
        ...ns,
        tools: (ns.tools ?? []).filter(
          (tool) =>
            !q ||
            tool.name.toLowerCase().includes(q) ||
            (tool.title ?? '').toLowerCase().includes(q) ||
            (tool.description ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((ns) => ns.tools.length > 0)
      .filter((ns) =>
        filter
          ? ns.tools.every((tool) => filter({ namespace: ns.name, origin: ns.meta?.origin, tool: tool.name }))
          : true,
      )
      .filter((ns) => ns.tools.length > 0);
  }, [schema, search, filter]);

  if (!open) {
    return null;
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent side='right' className='flex w-[520px] flex-col gap-3 overflow-y-auto sm:max-w-[520px]'>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value ?? '')}
          placeholder='搜索函数 / 描述…'
          className='sticky top-0 z-[1]'
        />
        {namespaces.length === 0 && (
          <p className='px-1 text-xs text-[var(--muted-foreground)]'>
            {schema?.length ? '无匹配函数' : 'schema 未加载（目录端点不可达？）'}
          </p>
        )}
        {namespaces.map((ns) => (
          <div key={ns.name}>
            <div className='border-b border-[var(--border)] pb-1.5'>
              <p className='flex items-center gap-1.5 text-[13px] font-semibold'>
                {ns.title}
                {ns.meta && (
                  <Badge
                    variant='secondary'
                    className='align-middle text-[10px]'
                    title={ns.meta.license ? `license: ${ns.meta.license}` : undefined}
                  >
                    {ns.meta.origin === 'reference' ? '参考域' : ns.meta.origin === 'extension' ? '扩展' : '行业包'}
                  </Badge>
                )}
              </p>
              <p className='text-[11px] text-[var(--muted-foreground)]'>
                {ns.name}
                {ns.description ? ` — ${ns.description}` : ''}
              </p>
            </div>
            <div className='mt-2 flex flex-col gap-2'>
              {(ns.tools ?? []).map((tool) => {
                const params = Object.entries(tool.parameters?.properties ?? {});
                const required = new Set(tool.parameters?.required ?? []);
                return (
                  <div
                    key={tool.name}
                    className={
                      'rounded-md border p-2.5 ' +
                      (tool.deprecated
                        ? 'border-[var(--seal-color-warning)]/60 bg-[var(--seal-color-warning-bg)]'
                        : 'border-[var(--border)]')
                    }
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <code className='text-xs font-semibold'>
                          {tool.name}({params.map(([n]) => n).join(', ')})
                        </code>
                        {tool.deprecated && (
                          <Badge variant='secondary' className='ml-1 align-middle'>
                            已弃用{tool.deprecated.since ? ` ${tool.deprecated.since}` : ''}
                          </Badge>
                        )}
                      </div>
                      <div className='flex shrink-0 gap-1'>
                        <Button variant='outline' size='sm' onClick={() => onInsert(tool)}>
                          <PlusCircleIcon className='size-3.5' />
                          插入画布
                        </Button>
                        {onTry && (
                          <Button variant='ghost' size='sm' onClick={() => onTry(tool)}>
                            <PlayCircleIcon className='size-3.5' />
                            试运行
                          </Button>
                        )}
                      </div>
                    </div>
                    {tool.description && (
                      <p className='mt-1 text-[11px] text-[var(--muted-foreground)]'>{tool.description}</p>
                    )}
                    {tool.deprecated?.note && (
                      <p className='mb-1 text-[11px] text-[var(--seal-color-warning)]'>
                        ⚠ {tool.deprecated.note}
                        {tool.deprecated.since ? `（自 ${tool.deprecated.since} 起）` : ''}
                      </p>
                    )}
                    {params.length > 0 && (
                      <div className='mt-1 flex flex-col gap-0.5'>
                        {params.map(([n, p]) => (
                          <div key={n} className='flex items-center gap-1.5 text-[11px]'>
                            <code>{n}</code>
                            <span className='text-[var(--muted-foreground)]'>{p.type ?? 'any'}</span>
                            {!required.has(n) && <span className='text-[var(--muted-foreground)]'>可选</span>}
                            {p.description && (
                              <span className='truncate text-[var(--muted-foreground)]'>— {p.description}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className='mt-1 text-[11px] text-[var(--muted-foreground)]'>
                      返回: {tool.returns?.type ?? 'any'}
                      {tool.returns?.description ? ` — ${tool.returns.description}` : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </SheetContent>
    </Sheet>
  );
};
