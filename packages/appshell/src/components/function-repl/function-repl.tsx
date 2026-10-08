import React, { useMemo, useState } from 'react';

import type { CustomNodeNamespace } from '../../lib/custom-node-types';
import { CodeBlock, CodeBlockExpandButton } from '../reui/code-block/code-block';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

/** execute 通道回包（demo-server POST /v1/functions/:name/execute 的 200 载荷） */
export type ReplExecuteResult = {
  result: unknown;
  micros: number;
  kwargs?: Record<string, unknown>;
};

/** 宿主注入的执行通道（组件不绑 demo-server URL——无状态原则同 FunctionCatalog） */
export type ReplExecutor = (name: string, args: unknown[]) => Promise<ReplExecuteResult>;

/** 结果渲染插槽：宿主可注入自定义高亮渲染（如 playground 的 code-block）；缺省 = JSON pre */
export type ReplResultRenderer = (result: unknown) => React.ReactNode;

/** 冷启动标注阈值：µs 计——首调含 TSFN/wasm 冷启动（UDF Lab 实测 50ms 级） */
const COLD_START_MICROS = 10_000;

const parseArg = (raw: string, type: string): { ok: true; value: unknown } | { ok: false; error: string } => {
  const trimmed = raw.trim();
  if (type === 'number') {
    const n = Number(trimmed);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `数字无法解析: ${trimmed}` };
  }
  if (type === 'boolean') {
    if (trimmed === 'true' || trimmed === 'false') return { ok: true, value: trimmed === 'true' };
    return { ok: false, error: `布尔仅接受 true/false: ${trimmed}` };
  }
  if (type === 'object' || type === 'array') {
    try {
      return { ok: true, value: JSON.parse(trimmed || (type === 'array' ? '[]' : '{}')) };
    } catch (e) {
      return { ok: false, error: `JSON 无法解析: ${(e as Error).message}` };
    }
  }
  return { ok: true, value: trimmed };
};

/**
 * UDF REPL 面板（A3，docs/design/repl-panel-plan.md §2）：不经图直接调用单个
 * 函数——schema 驱动参数表单 + 执行 + 结果/耗时（冷启动标注）+ 绑定回显。
 * 无状态：执行通道由宿主注入；catalog「试运行」经 initialToolName 预选。
 */
export const FunctionRepl: React.FC<{
  schema: CustomNodeNamespace[];
  execute: ReplExecutor;
  initialToolName?: string;
  onBack?: () => void;
  /** 结果渲染插槽（缺省 JSON pre）；宿主可注入自定义高亮渲染 */
  renderResult?: ReplResultRenderer;
}> = ({ schema, execute, initialToolName, onBack, renderResult }) => {
  const tools = useMemo(() => schema.flatMap((ns) => ns.tools ?? []), [schema]);
  const [toolName, setToolName] = useState<string>(initialToolName ?? tools[0]?.name ?? '');
  const tool = tools.find((t) => t.name === toolName);
  const params = useMemo(() => Object.entries(tool?.parameters?.properties ?? {}), [tool]);
  const required = useMemo(() => new Set(tool?.parameters?.required ?? []), [tool]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ReplExecuteResult | null>(null);
  const [coldSeen, setColdSeen] = useState<Set<string>>(new Set());

  const switchTool = (name: string) => {
    setToolName(name);
    setValues({});
    setOutcome(null);
    setClientError(null);
    setServerError(null);
  };

  const run = async () => {
    if (!tool) return;
    setClientError(null);
    setServerError(null);
    const args: unknown[] = [];
    for (const [name, schemaProp] of params) {
      const parsed = parseArg(values[name] ?? '', schemaProp.type ?? 'string');
      if (!parsed.ok) {
        setClientError(`参数 ${name}：${parsed.error}`);
        return;
      }
      args.push(parsed.value);
    }
    setRunning(true);
    try {
      const res = await execute(tool.name, args);
      setOutcome(res);
      if (res.micros > COLD_START_MICROS && !coldSeen.has(tool.name)) {
        setColdSeen((prev) => new Set(prev).add(tool.name));
      }
    } catch (e) {
      setServerError(String((e as Error)?.message ?? e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className='flex flex-col gap-3 p-3 text-xs'>
      <div className='flex items-center gap-2'>
        {onBack && (
          <Button variant='ghost' size='sm' onClick={onBack}>
            ← 目录
          </Button>
        )}
        <select
          aria-label='REPL 函数选择'
          className='h-8 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-xs'
          value={toolName}
          onChange={(e) => switchTool(e.target.value)}
        >
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.title}（{t.name}）{t.deprecated ? ' — 已弃用' : ''}
            </option>
          ))}
        </select>
      </div>

      {tool?.deprecated?.note && (
        <p className='text-[11px] text-[var(--seal-color-warning)]'>
          ⚠ {tool.deprecated.note}
          {tool.deprecated.since ? `（自 ${tool.deprecated.since} 起）` : ''}
        </p>
      )}

      {params.length > 0 && (
        <div className='flex flex-col gap-2'>
          {params.map(([name, prop]) => (
            <div key={name} className='flex flex-col gap-0.5'>
              <div className='flex items-center gap-1.5'>
                <code>{name}</code>
                <span className='text-[10px] text-[var(--muted-foreground)]'>{prop.type ?? 'any'}</span>
                {!required.has(name) && <span className='text-[10px] text-[var(--muted-foreground)]'>可选</span>}
                {required.has(name) && (
                  <Badge variant='secondary' className='text-[9px]'>
                    必填
                  </Badge>
                )}
              </div>
              {prop.type === 'object' || prop.type === 'array' ? (
                <textarea
                  aria-label={`参数 ${name}`}
                  className='min-h-16 rounded-md border border-[var(--border)] bg-[var(--card)] p-2 font-mono text-xs'
                  placeholder={prop.type === 'array' ? '[1, 2, 3]' : '{ "k": "v" }'}
                  value={values[name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                />
              ) : (
                <Input
                  aria-label={`参数 ${name}`}
                  // 数字也用文本框：type=number 会把非法输入清洗成空串，
                  // 客户端解析错误（REPL 的即时反馈）就无法呈现
                  inputMode={prop.type === 'number' ? 'decimal' : undefined}
                  value={values[name] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className='flex items-center gap-2'>
        <Button size='sm' disabled={running || !tool} onClick={() => void run()}>
          {running ? '执行中…' : '执行'}
        </Button>
        {clientError && <span className='text-[11px] text-destructive'>{clientError}</span>}
        {serverError && <span className='text-[11px] text-destructive'>{serverError}</span>}
      </div>

      {outcome && (
        <div className='flex flex-col gap-1 rounded-md border border-[var(--border)] p-2'>
          <div className='flex items-center gap-2 text-[11px] text-[var(--muted-foreground)]'>
            <span data-testid='repl-micros'>{outcome.micros}µs</span>
            {outcome.micros > COLD_START_MICROS && coldSeen.has(tool?.name ?? '') && (
              <Badge variant='secondary' className='text-[9px]'>
                首调含 TSFN/wasm 冷启动
              </Badge>
            )}
          </div>
          {outcome.kwargs && (
            <div className='text-[11px] text-[var(--muted-foreground)]'>
              kwargs: <code>{JSON.stringify(outcome.kwargs)}</code>
            </div>
          )}
          {renderResult ? (
            <div data-testid='repl-result' className='max-h-48 overflow-auto rounded bg-[var(--muted)] p-2'>
              {renderResult(outcome.result)}
            </div>
          ) : (
            <div data-testid='repl-result' className='max-h-48 overflow-auto rounded bg-[var(--muted)]'>
              <CodeBlock
                code={JSON.stringify(outcome.result, null, 2)}
                language='json'
                variant='ghost'
                maxLines={12}
                showLineNumbers={false}
                className='font-mono text-[11px]'
              >
                <CodeBlockExpandButton className='text-[10px]' />
              </CodeBlock>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
