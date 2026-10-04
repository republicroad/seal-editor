import React, { useCallback, useMemo, useRef, useState } from 'react';

import { useT } from '../../../theming/i18n';
import { Input, InputNumber, Select, Switch } from '../../primitives';

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
 *   值 = 字面量编辑器；表达式 = 等宽编辑框 + 字段选择器（点选插入 `$.path`）。
 * 存储层三态不变（literal 裸值 / expression、reference 信封）——reference 仍单独
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

  const literalEditor = (
    <LiteralEditor
      parameterType={parameterType}
      value={uiMode === 'literal' ? raw : undefined}
      onChange={setLiteral}
      disabled={disabled}
      placeholder={placeholder}
    />
  );

  const expressionEditor = (
    <div className='flex w-full items-center gap-1'>
      <div className='min-w-0 flex-1'>
        <Input
          disabled={disabled}
          className='font-mono text-xs'
          placeholder={placeholder ?? 'q.tier / 表达式'}
          value={uiMode === 'expression' ? exprText : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpression(e.target.value)}
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

/** 字段选择器：点选插入 $.path。Select 短生命周期（key 重挂）——保证同项可连点。 */
const FieldPicker: React.FC<{
  disabled?: boolean;
  fields: string[];
  onPick: (path: string) => void;
}> = ({ disabled, fields, onPick }) => {
  const t = useT();
  const [generation, setGeneration] = useState(0);
  return (
    <div className='w-24 shrink-0' data-testid='typed-input-field-picker'>
      <Select
        key={generation}
        size='small'
        disabled={disabled}
        placeholder={t('cf.field')}
        onChange={(value: string) => {
          onPick(value);
          setGeneration((g) => g + 1);
        }}
        options={fields.map((field) => ({ value: field, label: field }))}
      />
    </div>
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
