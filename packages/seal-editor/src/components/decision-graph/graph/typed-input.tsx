import type { CascaderNode } from '#reui/cascader/cascader-types';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import React, { Suspense, lazy, useCallback, useMemo, useRef, useState } from 'react';

import { useT } from '../../../theming/i18n';
import { CodeEditorBase } from '../../code-editor/ce-base';
import { Input, InputNumber, Select, Switch } from '../../primitives';
import { Popover, PopoverContent, PopoverTrigger } from '../../ui/popover';

// 弹层 chunk 懒加载：cascader 组合件只在首开字段弹层时下载（index.js 预算隔离）
const FieldPickerPopup = lazy(() => import('#reui/cascader/field-picker-popup'));

export type TypedValueMode = 'literal' | 'expression' | 'reference';

export type TypedValue = {
  mode: TypedValueMode;
  /** literal = 裸值；expression/reference = 表达式/路径字符串 */
  value: unknown;
};

/** UI 二分模式（呈现层概念）：reference 折叠进 expression，存储三态不变 */
type UiMode = 'literal' | 'expression';

type TypedInputProps = {
  /** 声明参数类型（string/number/boolean 等）——字面量编辑器选择依据 */
  parameterType: string;
  value?: TypedValue;
  onChange: (value: TypedValue) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 输入节点字段树投影：表达式模式供给字段选择器；为空时选择器隐藏 */
  fieldPaths?: string[];
  /** 动态参数选项（verdict 提案方案 A）：非空时字面量模式渲染为可搜索下拉；
   * 未命中选项的现值原样显示（自由文本语义保留），无选项时完全回退现行为 */
  options?: string[];
};

/** 裸值 → TypedValue 推断（旧数据读取兼容；信封原样通过） */
export const coerceToTypedValue = (raw: unknown): TypedValue => {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw) && 'mode' in (raw as Record<string, unknown>)) {
    return raw as TypedValue;
  }

  return { mode: 'literal', value: raw };
};

/**
 * Typed Input 万能值输入（Node-RED 模式，缺口 D 立项）。
 *
 * 呈现层二分（用户心智：写死的值 / 算出来的值）：
 *   值 = 字面量编辑器；表达式 = CM6 紧凑编辑框 + 字段选择器（点选插入裸路径）。
 * 存储层三态不变（literal 全量信封 / expression、reference 信封）——reference 仍单独
 * 记录（字段改名的精确迁移依赖它），仅 UI 呈现折叠进表达式：
 *   字段点选且编辑框为空 → 写 reference；其余表达式编辑 → 写 expression。
 * 安全前提：ADR-016 literal 原样绑定——「值」框内任何内容不求值。
 */
export const TypedInput: React.FC<TypedInputProps> = ({
  parameterType,
  value,
  onChange,
  disabled,
  placeholder,
  fieldPaths,
  options,
}) => {
  const t = useT();
  const typed = value ?? { mode: 'literal' as const, value: undefined };
  const raw = typed.value;

  // 每模式值备忘：切换时留存，切回恢复（无记忆的新模式以空值起步——规格 §5 不做内容推断）
  const previousByMode = useRef<Partial<Record<UiMode, unknown>>>({});

  const uiMode: UiMode = typed.mode === 'literal' ? 'literal' : 'expression';
  const exprText = typed.mode === 'literal' ? '' : String(typed.value ?? '');
  const hasFields = (fieldPaths ?? []).length > 0;

  const setUiMode = useCallback(
    (next: UiMode) => {
      if (next === uiMode) return;
      previousByMode.current[uiMode] = uiMode === 'expression' ? exprText : raw;
      const remembered = previousByMode.current[next];
      if (next === 'literal') {
        onChange({ mode: 'literal', value: remembered });
      } else {
        onChange({ mode: 'expression', value: remembered === undefined ? '' : remembered });
      }
    },
    [uiMode, exprText, raw, onChange],
  );

  const setLiteral = useCallback(
    (literalValue: unknown) => {
      onChange({ mode: 'literal', value: literalValue });
    },
    [onChange],
  );

  const setExpression = useCallback(
    (expr: string) => {
      onChange({ mode: 'expression', value: expr });
    },
    [onChange],
  );

  // 字段点选：编辑框为空 → 整值绑定写 reference（保字段改名迁移精度；
  // value = 无 $. 前缀的路径——引擎 reference 语义，ADR-016 实证）；
  // 已有内容 → 以空格拼接写 expression（组合表达式无整值语义）
  const insertField = useCallback(
    (path: string) => {
      const base = exprText;
      if (base.trim() === '') {
        onChange({ mode: 'reference', value: path });
        return;
      }
      onChange({ mode: 'expression', value: `${base}${base.endsWith(' ') ? '' : ' '}${path}` });
    },
    [exprText, onChange],
  );

  const uiModeOptions = useMemo(
    () => [
      { value: 'literal' as const, label: t('cf.modeLiteral') },
      { value: 'expression' as const, label: t('cf.modeExpression') },
    ],
    [t],
  );

  const literalEditor =
    options && options.length > 0 ? (
      <OptionsSelect
        value={uiMode === 'literal' ? raw : undefined}
        options={options}
        disabled={disabled}
        onChange={setLiteral}
      />
    ) : (
      <LiteralEditor
        parameterType={parameterType}
        value={uiMode === 'literal' ? raw : undefined}
        onChange={setLiteral}
        disabled={disabled}
        placeholder={placeholder}
      />
    );

  const expressionEditor = (
    <div className='flex w-full items-start gap-1'>
      <div className='min-w-0 flex-1'>
        <CodeEditorBase
          value={uiMode === 'expression' ? exprText : undefined}
          onChange={setExpression}
          disabled={disabled}
          placeholder={placeholder ?? 'q.tier / 表达式'}
          maxRows={8}
          noStyle
          lint
          type='standard'
          className='text-xs'
        />
      </div>
      {hasFields && (fieldPaths?.length ?? 0) > 0 && (
        <FieldPicker disabled={disabled} fields={fieldPaths ?? []} onPick={insertField} />
      )}
    </div>
  );

  return (
    <div className='flex w-full items-center gap-1'>
      <div className='min-w-0 flex-1'>{uiMode === 'literal' ? literalEditor : expressionEditor}</div>
      {/* 模式切换器外包定宽容器：kernel Select 根节点恒 w-full，直接传宽无效 */}
      <div className='w-[5.5rem] shrink-0'>
        <Select
          size='small'
          disabled={disabled}
          value={uiMode}
          onChange={(v: UiMode) => setUiMode(v)}
          options={uiModeOptions}
        />
      </div>
    </div>
  );
};

/** flat 点路径 → CascaderNode 树：value = 整条路径（选中即回传，免反查）；
 * 中间节点同值收录（`customer` 与 `customer.tier` 并存时分支兼叶子）。 */
export const buildFieldTree = (paths: string[]): CascaderNode[] => {
  const root: CascaderNode[] = [];
  for (const path of [...paths].sort()) {
    const segments = path.split('.');
    let level = root;
    let prefix = '';
    for (let i = 0; i < segments.length; i++) {
      prefix = prefix ? `${prefix}.${segments[i]}` : segments[i];
      let node = level.find((candidate) => candidate.value === prefix);
      if (!node) {
        node = { value: prefix, label: segments[i] };
        level.push(node);
      }
      if (i < segments.length - 1) {
        node.children ??= [];
        level = node.children;
      }
    }
  }
  return root;
};

/** 触发钮外壳：懒加载前后同一外观（popup chunk 首开才下载） */
const PickerTriggerShell: React.FC<{
  label: string;
  disabled?: boolean;
  onClick?: () => void;
}> = ({ label, disabled, onClick }) => (
  <button
    type='button'
    data-slot='select-trigger'
    disabled={disabled}
    onClick={onClick}
    className='flex h-8 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
  >
    <span className='min-w-0 flex-1 truncate text-left opacity-70'>{label}</span>
    <ChevronDownIcon className='size-3.5 shrink-0 opacity-60' />
  </button>
);

/** 字段选择器（cascader 树 + 全树搜索，懒加载弹层 chunk）：点选插入裸路径。
 * 语义与旧 Select 版一致——插入走 onPick（空框→reference 信封、非空→拼表达式）；
 * 弹层选中后重挂外壳键，保证同项可连点。 */
const FieldPicker: React.FC<{
  disabled?: boolean;
  fields: string[];
  onPick: (path: string) => void;
}> = ({ disabled, fields, onPick }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const nodes = useMemo(() => buildFieldTree(fields), [fields]);

  return (
    <div className='w-24 shrink-0' data-testid='typed-input-field-picker'>
      {open ? (
        <Suspense fallback={<PickerTriggerShell label={t('cf.field')} disabled={disabled} />}>
          <FieldPickerPopup
            nodes={nodes}
            disabled={disabled}
            triggerClassName='flex h-8 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors data-popup-open:ring-2 data-popup-open:ring-ring/50'
            triggerLabel={t('cf.field')}
            placeholder={t('cf.fieldInsert')}
            onPick={onPick}
            onClose={() => {
              // 卸载弹层——下次点击重挂新生（选中态与搜索词自然清空），同项可连点
              setOpen(false);
            }}
          />
        </Suspense>
      ) : (
        <PickerTriggerShell label={t('cf.field')} disabled={disabled} onClick={() => setOpen(true)} />
      )}
    </div>
  );
};

/** 动态参数选项下拉（可搜索；选中即设字面量）：触发钮显示现值（含不在选项内的
 * 自由文本现值——诚实语义），弹层搜索+列表，Esc/点外关闭。 */
const OptionsSelect: React.FC<{
  value?: unknown;
  options: string[];
  disabled?: boolean;
  onChange: (value: unknown) => void;
}> = ({ value, options, disabled, onChange }) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const current = typeof value === 'string' ? value : value !== undefined && value !== null ? String(value) : '';
  const filtered = useMemo(
    () => (query ? options.filter((opt) => opt.toLowerCase().includes(query.toLowerCase())) : options),
    [options, query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={disabled}
        data-testid='param-options-trigger'
        className='flex h-8 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50'
      >
        <span className='min-w-0 flex-1 truncate text-left'>
          {current || <span className='opacity-50'>{t('cf.paramOptionsSearch')}</span>}
        </span>
        <ChevronDownIcon className='size-3.5 shrink-0 opacity-60' />
      </PopoverTrigger>
      <PopoverContent align='start' className='w-[320px] p-1' data-testid='param-options-popup'>
        <div className='border-b border-b-[var(--border)] p-1.5'>
          <Input
            value={query}
            placeholder={t('cf.paramOptionsSearch')}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            className='h-7 text-xs'
          />
        </div>
        <div className='flex max-h-56 flex-col overflow-y-auto p-1'>
          {filtered.map((opt) => (
            <button
              key={opt}
              type='button'
              data-testid='param-option'
              className='flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-xs hover:bg-accent'
              onClick={() => {
                onChange(opt);
                setOpen(false);
                setQuery('');
              }}
            >
              <span className='min-w-0 truncate'>{opt}</span>
              {current === opt && <CheckIcon className='size-3.5 shrink-0 text-primary' />}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className='px-2 py-3 text-center text-xs opacity-50'>{t('cf.paramOptionsEmpty')}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** 字面量编辑器（按声明参数类型渲染：string → Input、number → InputNumber、boolean → Switch） */
const LiteralEditor: React.FC<{
  parameterType: string;
  value?: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ parameterType, value, onChange, disabled, placeholder }) => {
  if (parameterType === 'boolean') {
    return <Switch checked={value === true} disabled={disabled} onChange={(v: boolean) => onChange(v)} />;
  }

  if (parameterType === 'number' || parameterType === 'integer') {
    const numeric = typeof value === 'number' ? value : null;
    return (
      <InputNumber
        disabled={disabled}
        placeholder={placeholder}
        value={numeric}
        controls={false}
        onChange={(v: number | null) => onChange(v)}
      />
    );
  }

  return (
    <Input
      disabled={disabled}
      placeholder={placeholder}
      value={typeof value === 'string' ? value : value !== undefined && value !== null ? String(value) : ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
};
