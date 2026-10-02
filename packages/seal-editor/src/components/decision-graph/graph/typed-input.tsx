import React, { useCallback, useMemo, useRef } from 'react';

import { useT } from '../../../theming/i18n';
import { Input, InputNumber, Select, Switch } from '../../primitives';

export type TypedValueMode = 'literal' | 'expression' | 'reference';

export type TypedValue = {
  mode: TypedValueMode;
  /** literal = 裸值；expression/reference = 表达式/路径字符串 */
  value: unknown;
};

type TypedInputProps = {
  /** 声明参数类型（string/number/boolean 等）——字面量编辑器选择依据 */
  parameterType: string;
  value?: TypedValue;
  onChange: (value: TypedValue) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 引用模式可选路径（消费方从 InputContract 字段树投影）；为空时引用模式隐藏 */
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
 * Typed Input 万能值输入（Node-RED 模式，缺口 D 立项）：
 * 一控件 + 右缘类型切换，参数值三元（字面量/表达式/引用）显式化。
 * 切换备忘 previousByMode：各模式旧值留存，切回不丢（规格 §2.3）。
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
  const mode = typed.mode;
  const raw = typed.value;

  // 每模式值备忘：切换时留存当前值，切回恢复（无记忆的新模式以空值起步，
  // 不做字面量→表达式的内容自动推断——规格 §5 显式优于隐式）
  const previousByMode = useRef<Partial<Record<TypedValueMode, unknown>>>({});

  const hasReferences = (fieldPaths ?? []).length > 0;

  const setMode = useCallback(
    (nextMode: TypedValueMode) => {
      if (nextMode === mode) return;
      previousByMode.current[mode] = raw;
      const remembered = previousByMode.current[nextMode];
      const fallback = nextMode === 'expression' ? '' : undefined;
      onChange({ mode: nextMode, value: remembered !== undefined ? remembered : fallback });
    },
    [mode, onChange, raw],
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

  const setReference = useCallback(
    (ref: string) => {
      onChange({ mode: 'reference', value: ref });
    },
    [onChange],
  );

  // 引用模式仅在消费方提供字段路径时可见（规格 §3）；信封停在 reference
  // 而路径源被移除时降级显示字面量编辑器（存储形状不动，下次切换自愈）
  const modeOptions = useMemo(
    () => [
      { value: 'literal' as const, label: t('cf.modeLiteral') },
      { value: 'expression' as const, label: t('cf.modeExpression') },
      ...(hasReferences ? [{ value: 'reference' as const, label: t('cf.modeReference') }] : []),
    ],
    [t, hasReferences],
  );

  const displayMode: TypedValueMode = mode === 'reference' && !hasReferences ? 'literal' : mode;

  const editors = useMemo(
    () => ({
      literal: (
        <LiteralEditor
          parameterType={parameterType}
          value={displayMode === 'literal' ? raw : undefined}
          onChange={setLiteral}
          disabled={disabled}
          placeholder={placeholder}
        />
      ),
      expression: (
        <Input
          disabled={disabled}
          className='font-mono text-xs'
          placeholder={placeholder ?? '${...} / $.path'}
          value={displayMode === 'expression' ? String(raw ?? '') : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpression(e.target.value)}
        />
      ),
      reference: (
        <Select
          disabled={disabled}
          placeholder={placeholder}
          value={displayMode === 'reference' ? String(raw ?? '') : undefined}
          onChange={(v: string) => setReference(v)}
          options={(fieldPaths ?? []).map((fp) => ({ value: `$.${fp}`, label: fp }))}
        />
      ),
    }),
    [parameterType, displayMode, raw, disabled, placeholder, fieldPaths, setLiteral, setExpression, setReference],
  );

  return (
    <div className='flex w-full items-center gap-1'>
      <div className='min-w-0 flex-1'>{editors[displayMode]}</div>
      <Select
        className='w-[5.5rem] shrink-0'
        size='small'
        disabled={disabled}
        value={displayMode}
        onChange={(v: TypedValueMode) => setMode(v)}
        options={modeOptions}
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
