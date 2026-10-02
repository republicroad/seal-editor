import React, { useMemo, useState } from 'react';

import type { FunctionScope } from '../../../helpers/custom-function-schema';
import { useT } from '../../../theming/i18n';
import { Button, Select, Typography } from '../../primitives';
import { TypedInput } from './typed-input';
import type { TypedValue } from './typed-input';

/** 函数实例（规范形一行） */
export type FunctionInstance = {
  id: string;
  /** 输出绑定键 */
  key: string;
  /** 规范形调用 {$call, kwargs} */
  call: { $call: string; kwargs: Record<string, unknown> };
  /** ADR-015 增补：显式依赖声明（additive 预留） */
  dependsOn?: string[];
};

type InstanceEditorProps = {
  instances: FunctionInstance[];
  functionScope: FunctionScope;
  disabled?: boolean;
  onChange: (instances: FunctionInstance[]) => void;
};

/** 主从编辑器：左栏实例列表 + 右侧单实例编辑器（TypedInput 三模式）。
 *  自管理 selectedId（内部 useState），不需外部 selectedId prop。 */
export const InstanceEditor: React.FC<InstanceEditorProps> = ({ instances, functionScope, disabled, onChange }) => {
  const t = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const functions = functionScope.functions;
  const selected = useMemo(
    () => instances.find((inst) => inst.id === selectedId) ?? instances[0] ?? null,
    [instances, selectedId],
  );

  const fnOptions = useMemo(
    () => functions.map((f: any) => ({ value: f.name as string, label: f.name as string })),
    [functions],
  );

  const updateInstance = (id: string, patch: Partial<FunctionInstance>) => {
    onChange(instances.map((inst) => (inst.id === id ? { ...inst, ...patch } : inst)));
  };

  const addInstance = () => {
    const fn = functions[0]?.name ?? '';
    const id = crypto.randomUUID();
    const next = [...instances, { id, key: `output_${instances.length + 1}`, call: { $call: fn, kwargs: {} } }];
    onChange(next);
    setSelectedId(id);
  };

  const removeInstance = (id: string) => {
    const next = instances.filter((inst) => inst.id !== id);
    onChange(next);
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  };

  const selectedFn = selected ? functions.find((f: any) => f.name === selected.call.$call) : undefined;
  const paramNames = useMemo(
    () => (selectedFn ? Object.keys(selectedFn.parameters?.properties ?? {}) : []),
    [selectedFn],
  );

  return (
    <div className='flex min-h-0 flex-1 gap-3 overflow-hidden'>
      {/* 左栏：实例列表 */}
      <div className='flex w-52 shrink-0 flex-col overflow-hidden rounded-lg border border-border'>
        <div className='min-h-0 flex-1 overflow-y-auto py-1'>
          {instances.map((inst) => {
            const fn = functions.find((f: any) => f.name === inst.call.$call);
            return (
              <div
                key={inst.id}
                role='button'
                tabIndex={0}
                data-testid='instance-list-item'
                data-id={inst.id}
                className={`flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors ${
                  selected?.id === inst.id ? 'bg-primary/10' : 'hover:bg-muted/60'
                } ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
                onClick={() => setSelectedId(inst.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelectedId(inst.id);
                  }
                }}
              >
                <span className='min-w-0 flex-1 truncate font-medium'>{fn?.name ?? inst.call.$call}</span>
                <span className='shrink-0 opacity-50'>→ {inst.key}</span>
                {!disabled && instances.length > 1 && (
                  <button
                    type='button'
                    className='shrink-0 text-[10px] opacity-40 hover:opacity-80'
                    aria-label='remove'
                    onClick={(e) => {
                      e.stopPropagation();
                      removeInstance(inst.id);
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
          {instances.length === 0 && (
            <div className='p-2 text-xs text-[var(--muted-foreground)]'>{t('cf.instanceEmpty')}</div>
          )}
        </div>
        <div className='shrink-0 border-t border-border p-1.5'>
          <Button type='link' size='small' className='!pl-1' disabled={disabled} onClick={addInstance}>
            {t('cf.addInstance')}
          </Button>
        </div>
      </div>

      {/* 右栏：选中实例的参数绑定编辑器 */}
      <div className='min-h-0 min-w-0 flex-1 overflow-y-auto p-3'>
        {selected && selectedFn ? (
          <div className='flex flex-col gap-2'>
            <div className='grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2'>
              <Typography.Text className='text-xs opacity-70'>{t('cf.paramFn')}</Typography.Text>
              <Select
                disabled={disabled}
                value={selected.call.$call}
                onChange={(v: string) => updateInstance(selected.id, { call: { $call: v, kwargs: {} } })}
                options={fnOptions}
              />
            </div>
            {paramNames.map((name) => {
              const paramDef = selectedFn.parameters?.properties?.[name];
              const paramType = typeof paramDef?.type === 'string' ? paramDef.type : 'string';
              const argValue = selected.call.kwargs[name];
              const typed: TypedValue =
                argValue !== null && typeof argValue === 'object' && 'mode' in (argValue as Record<string, unknown>)
                  ? (argValue as TypedValue)
                  : { mode: 'literal', value: argValue };

              return (
                <div key={name} className='grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2'>
                  <Typography.Text className='text-xs opacity-70'>{name}</Typography.Text>
                  <TypedInput
                    parameterType={paramType}
                    value={typed}
                    disabled={disabled}
                    fieldPaths={[]}
                    onChange={(tv: TypedValue) =>
                      updateInstance(selected.id, {
                        call: { ...selected.call, kwargs: { ...selected.call.kwargs, [name]: tv.value } },
                      })
                    }
                  />
                </div>
              );
            })}
            {paramNames.length === 0 && (
              <Typography.Text className='text-xs opacity-50'>{t('cf.noParams')}</Typography.Text>
            )}
          </div>
        ) : (
          <div className='flex flex-1 items-center justify-center p-4'>
            <Typography.Text className='text-xs opacity-50'>{t('cf.selectInstance')}</Typography.Text>
          </div>
        )}
      </div>
    </div>
  );
};
