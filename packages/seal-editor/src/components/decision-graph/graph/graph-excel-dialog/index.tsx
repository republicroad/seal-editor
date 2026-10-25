import { PlusOutlined, SwapOutlined } from '#icons';
import { DataGrid, DataGridContainer, type DataGridFeatures, dataGridFeatures } from '#reui/data-grid/data-grid';
import { DataGridTable } from '#reui/data-grid/data-grid-table';
import InformationIcon from '#reui/icons/animated/outline/information';
import type { ColumnDef } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import clsx from 'clsx';
import { isEmpty } from 'lodash';
import React, { Fragment, useEffect, useMemo, useState } from 'react';

import { useT } from '../../../../theming/i18n';
import {
  Button,
  Checkbox,
  Divider,
  Input,
  Modal,
  Select,
  Steps,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from '../../../primitives';
import { ExcelPreviewGrid } from '../../../shared/excel-preview-grid';
import { useDataGridI18n } from '../../../shared/use-data-grid-i18n';
import { assembleMergedData, buildAutoSelection, buildMergedItems } from './merge-data';
import type { GraphExcelDialogProps, ItemValue, SelectedItems } from './types';

export type { MergedDataItem } from './types';

// Column chip colors share the field-pill tokens (roadmap P1, replaces HK-12
// literals; CSS var() keeps runtime retheming live).
const dataTypeConfig = {
  ['input']: { label: 'Input', color: 'var(--seal-color-field-input)' },
  ['output']: { label: 'Output', color: 'var(--seal-color-field-output)' },
};

const stepKeyOf = (step: number) => `step${step}`;

type SheetHeader = {
  id?: string;
  name?: string;
  value?: string;
  _type?: string;
};

export const GraphExcelDialog: React.FC<GraphExcelDialogProps> = ({ excelData, handleSuccess, handleCancel }) => {
  const t = useT();
  const dataGridI18n = useDataGridI18n();
  const [currentStep, setCurrentStep] = useState<number>(0);
  /** A2 最佳实践组合：正文 Tab——映射/预览各自全宽 */
  const [bodyTab, setBodyTab] = useState<'mapping' | 'preview'>('mapping');
  const steps = useMemo(() => excelData?.map((item) => ({ key: item.id, title: item.name })), [excelData]);

  const [items, setItems] = useState<ItemValue[]>([]);
  const [newItemName, setNewItemName] = useState<string>('');

  const [headerWrapStates, setHeaderWrapStates] = useState<Record<string, Record<string, boolean>>>({});

  const [selectedItems, setSelectedItems] = useState<SelectedItems | null>(null);

  useEffect(() => {
    if (!excelData) {
      setSelectedItems(null);
      setCurrentStep(0);
      setNewItemName('');
      setHeaderWrapStates({});

      return;
    }
    const existingTableHeaders = excelData[currentStep].existingTableData.headers
      .map((tableHeader) => ({
        ...tableHeader,
        value: tableHeader.field,
        label: tableHeader.name as string,
        type: tableHeader.type,
      }))
      .filter((header) => header.value);

    const newTableHeaders = (excelData[currentStep]?.headers || []).map((header) => ({
      id: header.id || crypto.randomUUID(),
      value: header.id === '_description' ? 'description' : header.value,
      label: header.name as string,
      ...(header.id !== '_description' && { type: header._type as 'input' | 'output' | undefined }),
    }));

    const mergedItems = buildMergedItems(existingTableHeaders, newTableHeaders);
    setItems(mergedItems);

    const matchingHeaders = mergedItems.filter((item) => {
      return newTableHeaders.some((excelHeader) => excelHeader.id === item.id);
    });

    if (matchingHeaders.length) {
      const selectedItemsMap = buildAutoSelection(matchingHeaders);

      setSelectedItems((prevItems) => {
        const stepKey = stepKeyOf(currentStep);
        const currentStepData = (prevItems || {})[stepKey];

        if (currentStepData) {
          return prevItems;
        }

        return {
          ...(prevItems || {}),
          [stepKey]: selectedItemsMap,
        };
      });
    }
  }, [excelData, currentStep]);

  const sheetHeaders: SheetHeader[] = excelData?.[currentStep]?.headers ?? [];
  const stepSelected = selectedItems?.[stepKeyOf(currentStep)];

  // A2 样例值（Airtable 模式）：按 headerId 取该列前 3 条非空采样
  const sampleValuesOf = (headerId: string): string[] =>
    (excelData?.[currentStep]?.rules ?? [])
      .map((rule) => rule.find((cell) => cell.headerId === headerId)?.value)
      .filter((v) => v !== undefined && v !== null && String(v) !== '')
      .slice(0, 3)
      .map((v) => String(v));

  /**
   * WS2-B2：逐表头映射行进 data-grid——一行一条 Excel 列
   * （列名 → 字段选择 → Input/Output → 引号包裹），状态机与清扫逻辑不变。
   */
  const mappingColumns = React.useMemo<ColumnDef<DataGridFeatures, SheetHeader>[]>(
    () => [
      {
        id: 'excel',
        header: 'Excel columns',
        // 只读信息去输入框化（A2 美化）：列名 medium 字重 + 等宽弱化样例值
        cell: ({ row }) => {
          const samples = row.original.id ? sampleValuesOf(row.original.id) : [];
          return (
            <div className='py-0.5'>
              <Typography.Text className='text-[13px] font-medium'>
                {row.original.name || row.original.value}
              </Typography.Text>
              <div className='mt-0.5 truncate font-mono text-[10px] opacity-50'>{samples.join(' · ') || '—'}</div>
            </div>
          );
        },
        size: 200,
      },
      {
        id: 'field',
        header: () => (
          <span className='flex items-center gap-2'>
            Decision table columns
            <SwapOutlined style={{ fontSize: 14, color: 'var(--primary)' }} />
          </span>
        ),
        cell: ({ row }) => {
          const header = row.original;
          return (
            <Select
              style={{ width: '100%' }}
              placeholder='select field'
              optionLabelProp='display'
              value={stepSelected?.[header.id as string]?.value}
              allowClear
              onClear={() => {
                const stepKey = stepKeyOf(currentStep);
                setSelectedItems((prevItems) => {
                  const currentStepData = { ...(prevItems || {})[stepKey] };
                  delete currentStepData[header.id as string];
                  return {
                    ...(prevItems || {}),
                    [stepKey]: currentStepData,
                  };
                });

                setHeaderWrapStates((prev) => {
                  const stepKey = stepKeyOf(currentStep);
                  const updated = { ...prev[stepKey] };
                  delete updated[header.id as string];
                  return { ...prev, [stepKey]: updated };
                });
              }}
              onSelect={(_, option) => {
                const { id, label, value, type, wrapInQuotes } = option as {
                  id: string;
                  label: string;
                  value?: string;
                  type?: 'input' | 'output';
                  wrapInQuotes?: boolean;
                };

                setSelectedItems((prevItems) => {
                  const stepKey = stepKeyOf(currentStep);
                  const currentStepData = { ...(prevItems || {})[stepKey] };
                  const clearedHeaderIds: string[] = [];

                  Object.keys(currentStepData).forEach((key) => {
                    if (
                      key !== header.id &&
                      (currentStepData[key].value === value || currentStepData[key].label === label)
                    ) {
                      clearedHeaderIds.push(key);
                      delete currentStepData[key];
                    }
                  });

                  if (clearedHeaderIds.length > 0) {
                    setHeaderWrapStates((prev) => {
                      const stepData = { ...(prev[stepKey] || {}) };
                      clearedHeaderIds.forEach((id) => delete stepData[id]);
                      return { ...prev, [stepKey]: stepData };
                    });
                  }

                  return {
                    ...(prevItems || {}),
                    [stepKey]: {
                      ...currentStepData,
                      [header.id as string]: { id, label, value, type, wrapInQuotes },
                    },
                  };
                });
              }}
              dropdownRender={(menu) => (
                <Fragment>
                  {menu}
                  <Divider style={{ margin: '8px 0' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '0 8px 4px' }}>
                    <div
                      style={{
                        flex: 2,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Input
                        placeholder={t('dg.excel.enterFieldName')}
                        value={newItemName}
                        onChange={(event) => setNewItemName(event.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                      <Button
                        type='text'
                        icon={<PlusOutlined />}
                        onClick={() => {
                          setItems([
                            ...items,
                            {
                              value: newItemName,
                              label: newItemName,
                              id: crypto.randomUUID(),
                            },
                          ]);
                          setNewItemName('');
                        }}
                      >
                        Add item
                      </Button>
                    </div>
                  </div>
                </Fragment>
              )}
              optionRender={(option) => {
                const dataType = option.data.type as keyof typeof dataTypeConfig;
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{option.data.label}</span>
                    {dataType && (
                      <Tag style={{ background: dataTypeConfig[dataType].color }}>{dataTypeConfig[dataType].label}</Tag>
                    )}
                  </div>
                );
              }}
              options={items
                .filter((item): item is ItemValue & { value: string } => Boolean(item.value))
                .map((item) => ({
                  id: item.id,
                  label: item.label,
                  value: item.value,
                  type: item.type,
                  wrapInQuotes: item.wrapInQuotes,
                  display: (
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        width: '100%',
                      }}
                    >
                      <span>{item.label}</span>
                    </div>
                  ),
                }))}
            />
          );
        },
        size: 240,
      },
      {
        id: 'type',
        header: 'Data type',
        cell: ({ row }) => {
          const header = row.original;
          if (stepSelected?.[header.id as string]?.value === 'description') {
            return null;
          }
          // 紧凑分段器（A2 美化）：软选中替代实心 radio 块，视觉轻一档
          const currentType = stepSelected?.[header.id as string]?.type ?? 'input';
          const segment = (value: ItemValue['type'], label: string) => {
            const active = currentType === value;
            return (
              <button
                type='button'
                disabled={!stepSelected?.[header.id as string]}
                className={clsx(
                  'flex-1 rounded-[4px] px-3 py-1 text-xs transition-colors disabled:opacity-40',
                  active
                    ? 'bg-primary/10 font-medium text-[var(--primary)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  setSelectedItems((prev) => {
                    const stepKey = stepKeyOf(currentStep);
                    const currentStepData = (prev || {})[stepKey];
                    return {
                      ...(prev || {}),
                      [stepKey]: {
                        ...(currentStepData || {}),
                        [header.id as string]: {
                          ...((currentStepData || {})[header.id as string] || {}),
                          type: value,
                        },
                      },
                    };
                  });
                }}
              >
                {label}
              </button>
            );
          };
          return (
            <div className='inline-flex w-full items-center rounded-md border border-[var(--border)] p-0.5'>
              {segment('input', 'Input')}
              {segment('output', 'Output')}
            </div>
          );
        },
        size: 180,
      },
      {
        id: 'wrap',
        // 列头图标与下方复选框同为水平居中（复选框格 justifyContent:center，
        // 图标此前 inline-flex 靠左随表头 padding——两者左右错位）
        header: () => (
          <div className='flex justify-center'>
            <Tooltip title={t('dg.excel.wrapQuotes')}>
              <span className='inline-flex cursor-pointer text-[var(--muted-foreground)] [&_svg]:block'>
                <InformationIcon className='size-3.5' />
              </span>
            </Tooltip>
          </div>
        ),
        cell: ({ row }) => {
          const header = row.original;
          if (stepSelected?.[header.id as string]?.value === 'description') {
            return null;
          }
          return (
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <Checkbox
                disabled={!stepSelected?.[header.id as string]}
                checked={headerWrapStates[stepKeyOf(currentStep)]?.[header.id as string] || false}
                onChange={(e) => {
                  setHeaderWrapStates((prev) => {
                    const stepKey = stepKeyOf(currentStep);
                    return {
                      ...prev,
                      [stepKey]: {
                        ...(prev[stepKey] || {}),
                        [header.id as string]: e.target.checked,
                      },
                    };
                  });
                }}
              />
            </div>
          );
        },
        size: 60,
      },
    ],
    [currentStep, stepSelected, items, newItemName, headerWrapStates, t, excelData],
  );

  const mappingTable = useTable({
    features: dataGridFeatures,
    columns: mappingColumns,
    data: sheetHeaders,
    getRowId: (row: SheetHeader) => row.id as string,
  });

  return (
    <Modal
      className='seal-graph-excel-dialog gap-2 p-3'
      title={t('dialog.mapExcelData')}
      closable={{ 'aria-label': 'Custom Close Button' }}
      centered
      open={!!excelData}
      onCancel={handleCancel}
      destroyOnClose={true}
      width={1140}
      // 向导按钮组入 footer（A1 重合修复）：Done 此前在内容流里随滚动与
      // Preview 重合——footer 钉底后 Previous 左对齐，Next/Done/Cancel 右对齐
      footer={
        <>
          {currentStep > 0 && (
            <Button style={{ marginRight: 'auto' }} onClick={() => setCurrentStep(currentStep - 1)}>
              Previous
            </Button>
          )}
          {currentStep < (excelData || []).length - 1 && (
            <Button
              type='primary'
              disabled={!selectedItems?.[stepKeyOf(currentStep)] || isEmpty(selectedItems[stepKeyOf(currentStep)])}
              onClick={() => {
                setCurrentStep(currentStep + 1);
              }}
            >
              Next
            </Button>
          )}
          {currentStep === (excelData || []).length - 1 && (
            <Button
              type='primary'
              disabled={!selectedItems?.[stepKeyOf(currentStep)] || isEmpty(selectedItems[stepKeyOf(currentStep)])}
              onClick={() => {
                if (selectedItems && excelData) {
                  handleSuccess(assembleMergedData(excelData, selectedItems, headerWrapStates));
                }
              }}
            >
              Done
            </Button>
          )}
          <Button onClick={handleCancel}>Cancel</Button>
        </>
      }
    >
      <Steps current={currentStep} items={steps} />
      {/* A2 最佳实践组合：映射/预览正文 Tab 切换（各自全宽，宽表不被窄栏裁剪）
          + 映射行内嵌样例值（逐列验证零切换） */}
      <Tabs
        className='mt-2'
        items={[
          { key: 'mapping', label: t('dg.excel.tabMapping') },
          { key: 'preview', label: `${t('dg.excel.tabPreview')} (${sheetHeaders.length})` },
        ]}
        onChange={(key) => setBodyTab(key as 'mapping' | 'preview')}
      />
      <div className='flex h-full min-h-0 flex-1 flex-col pt-2'>
        {bodyTab === 'mapping' ? (
          <div className='flex h-full min-h-0 flex-1 gap-3'>
            <div className='min-w-0 flex-1 overflow-y-auto rounded-lg border border-[var(--border)] p-1'>
              <DataGrid
                table={mappingTable}
                recordCount={sheetHeaders.length}
                i18n={dataGridI18n}
                tableLayout={{ rowBorder: false }}
                getRowClassName={() => 'transition-colors hover:bg-muted/40'}
              >
                <DataGridContainer>
                  <DataGridTable />
                </DataGridContainer>
              </DataGrid>
            </div>
          </div>
        ) : (
          <div className='min-h-0 flex-1'>
            {excelData?.[currentStep] && <ExcelPreviewGrid sheet={excelData[currentStep]} height='100%' />}
          </div>
        )}
      </div>
    </Modal>
  );
};
