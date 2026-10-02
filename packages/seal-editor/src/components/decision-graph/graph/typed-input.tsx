import React, { useCallback, useMemo } from 'react';

import { Input, Select, Switch } from '../../primitives';

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
  /** 引用模式可选路径（消费方从 InputContract 字段树投影） */
  fieldPaths?: string[];
};

const MODE_OPTIONS: Array<{ value: TypedValueMode; label: string }> = [
  { value: 'literal', label: '值' },
  { value: 'expression', label: '表达式' },
  { value: 'reference', label: '引用' },
];

/** 裸值 → TypedValue 推断（旧数据读取兼容） */
export const coerceToTypedValue = (raw: unknown): TypedValue => {
  if (raw !== null && typeof raw === 'object' && 'mode' in (raw as Record<string, unknown>)) {
    return raw as TypedValue;
  }

  return { mode: 'literal', value: raw };
};

/**
 * Typed Input 万能值输入（Node-RED 模式，缺口 D 立项）：
 * 一控件 + 右缘类型切换，参数值三元（字面量/表达式/引用）显式化。
 */
export const TypedInput: React.FC<TypedInputProps> = ({
  parameterType,
  value,
  onChange,
  disabled,
  placeholder,
  fieldPaths,
}) => {
  const typed = value ?? { mode: 'literal' as const, value: undefined };
  const mode = typed.mode;
  const raw = typed.value;

  const setMode = useCallback(
    (nextMode: TypedValueMode) => {
      if (nextMode === mode) return;
      onChange({ mode: nextMode, value: raw });
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

  const editors = useMemo(
    () => ({
      literal: (
        <LiteralEditor
          parameterType={parameterType}
          value={mode === 'literal' ? raw : undefined}
          onChange={setLiteral}
          disabled={disabled}
          placeholder={placeholder}
        />
      ),
      expression: (
        <Input
          disabled={disabled}
          placeholder={placeholder}
          value={mode === 'expression' ? String(raw ?? '') : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setExpression(e.target.value)}
        />
      ),
      reference: (
        <Select
          disabled={disabled}
          placeholder={placeholder}
          value={mode === 'reference' ? String(raw ?? '') : undefined}
          onChange={(v: string) => setReference(v)}
          options={(fieldPaths ?? []).map((fp) => ({ value: fp, label: fp }))}
        />
      ),
    }),
    [parameterType, mode, raw, disabled, placeholder, fieldPaths, setLiteral, setExpression, setReference],
  );

  return (
    <div className='flex w-full items-center gap-1'>
      <div className='min-w-0 flex-1'>{editors[mode]}</div>
      <Select
        className='w-20 shrink-0'
        size='small'
        disabled={disabled}
        value={mode}
        onChange={(v: TypedValueMode) => setMode(v)}
        options={MODE_OPTIONS}
      />
    </div>
  );
};

/** 字面量编辑器（按声明参数类型渲染） */
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

  return (
    <Input
      disabled={disabled}
      placeholder={placeholder}
      value={typeof value === 'string' ? value : value !== undefined ? String(value) : ''}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
        if (parameterType === 'number') {
          const num = Number(e.target.value);
          onChange(Number.isFinite(num) ? num : e.target.value);
        } else {
          onChange(e.target.value);
        }
      }}
    />
  );
};
