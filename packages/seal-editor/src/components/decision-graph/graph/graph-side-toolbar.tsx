import { ArrowDownUpIcon, Command as CommandIcon, EllipsisIcon, FocusIcon, ListChecksIcon } from 'lucide-react';
import React, { Fragment, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ParsedExcelData } from '../../../helpers/excel';
import { exportDecisionTable, getExcelData } from '../../../helpers/excel';
import { decisionModelSchema } from '../../../helpers/schema';
import { useT } from '../../../theming/i18n';
import { parseDecisionTable } from '../../decision-table/context/dt-store.context';
import type { MenuProps } from '../../primitives';
import { Button, Dropdown, Tooltip } from '../../primitives';
import {
  selectDiagnostics,
  useDecisionGraphActions,
  useDecisionGraphRaw,
  useDecisionGraphState,
} from '../context/dg-store.context';
import { type DecisionEdge, type DecisionNode } from '../dg-types';
import { NodeKind } from '../nodes/specifications/specification-types';
import type { MergedDataItem } from './graph-excel-dialog';
import { GraphExcelDialog } from './graph-excel-dialog';

const DecisionContentType = 'application/vnd.gorules.decision';

export type GraphSideToolbarProps = {
  //
};

export const GraphSideToolbar: React.FC<GraphSideToolbarProps> = () => {
  const t = useT();
  const decisionGraphRaw = useDecisionGraphRaw();
  const fileInput = useRef<HTMLInputElement>(null);
  const excelFileInput = useRef<HTMLInputElement>(null);
  const [excelGraphData, setExcelGraphData] = useState<ParsedExcelData[] | null>();

  const {
    setDecisionGraph,
    setActivePanel,
    setCommandMenuOpen,
    alignNodesToGrid,
    setCanvasLocked,
    setSnapToGrid,
    setDiagnosticsOpen,
    setFocusMode,
    setDiffMode,
  } = useDecisionGraphActions();
  const { disabled, panels, activePanel, viewConfig, commandMenuOpen, canvasLocked, snapToGrid } =
    useDecisionGraphState(
      ({ disabled, panels, activePanel, viewConfig, commandMenuOpen, canvasLocked, snapToGrid }) => ({
        disabled,
        panels,
        activePanel,
        viewConfig,
        commandMenuOpen,
        canvasLocked,
        snapToGrid,
      }),
    );
  const diagnosticsOpen = useDecisionGraphState(({ diagnosticsOpen: open }) => open);
  const diagnosticErrorCount = useDecisionGraphState((state) =>
    selectDiagnostics(state).reduce((n, entry) => (entry.severity === 'error' ? n + 1 : n), 0),
  );
  const { focusMode, diffMode, hasDiffBaseline } = useDecisionGraphState(
    ({ focusMode, diffMode, hasDiffBaseline }) => ({ focusMode, diffMode, hasDiffBaseline }),
  );

  const handleUploadInput = async (event: any) => {
    const fileList = event?.target?.files as FileList;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const parsed: any = JSON.parse(e?.target?.result as string);
        if (parsed?.contentType !== DecisionContentType) {
          throw new Error('Invalid content type');
        }

        const nodes: DecisionNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : [];
        const nodeIds = nodes.map((node) => node.id);

        const edges: DecisionEdge[] = (parsed.edges as DecisionEdge[]).filter(
          (edge) => nodeIds.includes(edge?.targetId) && nodeIds.includes(edge?.sourceId),
        );

        const modelParsed = decisionModelSchema.safeParse({
          nodes,
          edges,
          settings: parsed?.settings,
        });

        if (!modelParsed.success) {
          toast.error(modelParsed.error?.message);
          return;
        }

        setDecisionGraph(modelParsed.data);
      } catch (e: any) {
        toast.error(e.message);
      }
    };

    reader.readAsText(Array.from(fileList)?.[0], 'UTF-8');
  };

  const uploadJDMExcel = (event: any) => {
    const file = event?.target?.files[0];
    const fileReader = new FileReader();

    try {
      fileReader.readAsArrayBuffer(file);
      fileReader.onload = async () => {
        const buffer = fileReader.result as ArrayBuffer;

        if (!buffer) return;
        const { decisionGraph } = decisionGraphRaw.stateStore.getState();

        const excelData = await getExcelData(buffer, decisionGraph);

        setExcelGraphData(excelData);

        toast.success('Excel file has been uploaded successfully!');
      };
    } catch {
      toast.error('Failed to upload Excel!');
    }
  };

  const handleDataMapping = (mappedExcelData: MergedDataItem[]) => {
    const nodesFromExcel: DecisionNode[] = mappedExcelData.map((excelData) => {
      const inputs = excelData.items
        .filter((item) => item.type === 'input')
        .map((item) => ({
          id: item.id,
          name: item.label,
          field: item.value
            ?.replace(/[^a-zA-Z0-9\s._]/g, '')
            .trim()
            .replace(/\s+/g, '.')
            .toLowerCase(),
        }));

      const outputs = excelData.items
        .filter((item) => item.type === 'output')
        .map((item) => ({
          id: item.id,
          name: item.label,
          field: item.value
            ?.replace(/[^a-zA-Z0-9\s._]/g, '')
            .trim()
            .split(/\s+/)
            .map((word, index) =>
              index === 0 ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
            )
            .join(''),
        }));

      const reducedRules = excelData.rules.map((rule) =>
        rule.reduce(
          (acc: Record<string, any> & { _id: string }, item) => {
            acc[item.headerId] = item.value;
            return acc;
          },
          {
            _id: crypto.randomUUID(),
          },
        ),
      );

      return {
        id: excelData.id,
        name: excelData.name,
        type: NodeKind.DecisionTable,
        content: {
          ...parseDecisionTable({
            inputs,
            outputs,
            rules: reducedRules,
            executionMode: excelData.executionMode || 'single',
            hitPolicy: excelData.hitPolicy || 'first',
            passThrough: excelData.passThrough,
          }),
          inputField: excelData.inputField,
          outputPath: excelData.outputPath,
        },
        position: excelData.position,
      };
    });

    const { decisionGraph } = decisionGraphRaw.stateStore.getState();

    const updatedNodes = decisionGraph.nodes.map((node) => {
      let _node = node;
      // updating existing nodes
      nodesFromExcel.forEach((excelNode) => {
        if (excelNode.id === node.id) _node = { ...node, content: excelNode.content };
      });

      return _node;
    });

    // filtering new nodes and setting them proper position
    const newNodes = nodesFromExcel
      .filter((node) => !updatedNodes.some((existingNode) => existingNode.id === node.id))
      .map((newNode, index) => ({
        ...newNode,
        type: NodeKind.DecisionTable,
        position: (() => {
          const findAvailablePosition = (x: number, y: number) => {
            const position = { x, y };

            if (decisionGraph.nodes.some((node) => node.position.x === position.x && node.position.y === position.y)) {
              return findAvailablePosition(x + 250, y);
            }

            return position;
          };

          const availablePosition = findAvailablePosition(0, 0);

          return { x: availablePosition.x + index * 250, y: 0 };
        })(),
      }));

    const modelParsed = decisionModelSchema.safeParse({
      nodes: [...updatedNodes, ...newNodes],
      edges: decisionGraph.edges,
    });

    if (!modelParsed.success) {
      toast.error(modelParsed.error?.message);
      return;
    }

    setDecisionGraph(modelParsed.data);
    setExcelGraphData(null);
  };

  const downloadJDM = async () => {
    try {
      const { name, decisionGraph } = decisionGraphRaw.stateStore.getState();
      // create file in browser
      const fileName = `${name.replaceAll('.json', '')}.json`;
      const json = JSON.stringify(
        {
          contentType: DecisionContentType,
          nodes: decisionGraph.nodes,
          edges: decisionGraph.edges,
        },
        null,
        2,
      );
      const blob = new Blob([json], { type: 'application/json' });
      const href = URL.createObjectURL(blob);

      // create "a" HTLM element with href to file
      const link = window.document.createElement('a');
      link.href = href;
      link.download = fileName;
      window.document.body.appendChild(link);
      link.click();

      // clean up "a" element & remove ObjectURL
      window.document.body.removeChild(link);
      URL.revokeObjectURL(href);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const downloadJDMExcel = async () => {
    try {
      const { name, decisionGraph, viewConfig } = decisionGraphRaw.stateStore.getState();
      const fileName = name.replaceAll('.json', '');

      const decisionTableNodes = decisionGraph.nodes
        .filter((node) => node.type === NodeKind.DecisionTable)
        .filter((node) => (viewConfig?.enabled ? !!viewConfig?.permissions?.[node.id] : true))
        .map((decisionTable) => ({
          ...decisionTable.content,
          id: decisionTable.id,
          name: decisionTable.name,
        }));

      await exportDecisionTable(fileName, decisionTableNodes);
      toast.success('Excel file has been downloaded successfully!');
    } catch {
      toast.error('Failed to download Excel file!');
    }
  };

  const uploadItems: MenuProps['items'] = [
    !viewConfig?.enabled && {
      key: 'upload-json',
      label: t('dg.toolbar.uploadJson'),
      onClick: () => fileInput?.current?.click?.(),
    },
    {
      key: 'upload-excel',
      label: t('dg.toolbar.uploadExcel'),
      onClick: () => excelFileInput?.current?.click?.(),
    },
  ].filter((item) => !!item);

  const downloadItems: MenuProps['items'] = [
    !viewConfig?.enabled && {
      key: 'download-json',
      label: t('dg.toolbar.downloadJson'),
      onClick: () => downloadJDM(),
    },
    {
      key: 'download-excel',
      label: t('dg.toolbar.downloadExcel'),
      onClick: () => downloadJDMExcel(),
    },
  ].filter((item) => !!item);

  // ⋯ 溢出菜单（P1-4 diff 开关入列——基线在场才出现；布局/锁/吸附带 ✓ 态）
  const moreToolItems: MenuProps['items'] = [
    {
      key: 'align-grid',
      label: t('dg.toolbar.alignToGrid'),
      disabled,
      onClick: () => {
        alignNodesToGrid();
        toast.success(t('dg.toolbar.alignedToGrid'));
      },
    },
    {
      key: 'lock-canvas',
      label: (canvasLocked ? '✓ ' : '') + t('dg.toolbar.lockCanvas'),
      onClick: () => setCanvasLocked(!canvasLocked),
    },
    {
      key: 'snap-grid',
      label: (snapToGrid ? '✓ ' : '') + t('dg.toolbar.snapToGrid'),
      onClick: () => setSnapToGrid(!snapToGrid),
    },
    { key: 'divider-view', type: 'divider' },
    ...(hasDiffBaseline
      ? [
          {
            key: 'diff-view',
            label: (diffMode ? '✓ ' : '') + t('dg.toolbar.diffMode'),
            onClick: () => setDiffMode(!diffMode),
          },
        ]
      : []),
  ];

  // 导入/导出合并菜单（json/excel 双向；上传随只读灰置，下载常可用）
  const importExportItems: MenuProps['items'] = [
    ...uploadItems.map((item) => ({ ...item, disabled })),
    ...downloadItems,
  ];

  return (
    <Fragment>
      <div className={'[grid-area:sidebar] flex h-full min-h-0 bg-[var(--seal-color-bg-container)]'}>
        <input
          hidden
          accept='application/json'
          type='file'
          ref={fileInput}
          onChange={handleUploadInput}
          onClick={(event) => {
            (event.target as HTMLInputElement).value = '';
          }}
        />
        <input
          hidden
          accept='.xlsx'
          type='file'
          ref={excelFileInput}
          onChange={uploadJDMExcel}
          onClick={(event) => {
            (event.target as HTMLInputElement).value = '';
          }}
        />
        <div className='flex w-12 min-w-12 flex-col items-center justify-between gap-2 border-r border-r-[var(--border)] py-2'>
          <div className={'flex flex-col items-center gap-2'}>
            {/* 撤销/重做/auto-layout 已迁画布左上浮动层（高频贴画布，用户裁定） */}
            {/* 导入/导出四动作合并单钮——json/excel 双向一菜单 */}
            <Dropdown menu={{ items: importExportItems }} placement='bottomRight' trigger={['click']}>
              <Button
                type={'text'}
                aria-label={t('dg.toolbar.importExport')}
                data-testid='import-export'
                icon={<ArrowDownUpIcon className='size-4' />}
              />
            </Dropdown>
            {/* 低频画布工具收纳 ⋯ 溢出菜单——侧栏常驻只留高频（undo/redo/auto-layout/
                导入导出/诊断/聚焦/⌘K+面板），面板不再被挤出一屏 */}
            <Dropdown menu={{ items: moreToolItems }} placement='bottomRight' trigger={['click']}>
              <Button
                type={'text'}
                aria-label={t('dg.toolbar.moreTools')}
                data-testid='more-tools'
                icon={<EllipsisIcon className='size-4' />}
              />
            </Dropdown>
          </div>
          <div className={'flex flex-col items-center gap-2'}>
            {/* P0-2 诊断面板开关：错误计数徽标（只读图也可查看诊断） */}
            <Tooltip title={t('dg.diagnostics.title')} placement={'right'}>
              <div className='relative'>
                <Button
                  type={'text'}
                  aria-label={t('dg.diagnostics.title')}
                  aria-pressed={diagnosticsOpen}
                  data-testid='diagnostics-toggle'
                  icon={<ListChecksIcon className='size-4' />}
                  className={diagnosticsOpen ? 'bg-primary/10 text-primary' : undefined}
                  onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}
                />
                {diagnosticErrorCount > 0 && (
                  <span
                    className='pointer-events-none absolute -right-1 -top-1 min-w-3.5 rounded-full bg-[var(--seal-color-error)] px-1 text-center text-[9px] leading-3.5 text-white'
                    data-testid='diagnostics-badge'
                  >
                    {diagnosticErrorCount > 99 ? '99+' : diagnosticErrorCount}
                  </span>
                )}
              </div>
            </Tooltip>
            {/* P1-5 聚焦模式入口：画布独占（快捷键同通道） */}
            <Tooltip title={t('dg.focus.enter')} placement={'right'}>
              <Button
                type={'text'}
                aria-label={t('dg.focus.enter')}
                aria-pressed={focusMode}
                data-testid='focus-mode-toggle'
                icon={<FocusIcon className='size-4' />}
                className={focusMode ? 'bg-primary/10 text-primary' : undefined}
                onClick={() => setFocusMode(!focusMode)}
              />
            </Tooltip>
            <Tooltip title={t('dg.command.open')} placement='right'>
              <Button
                type='text'
                icon={<CommandIcon className='size-4' />}
                aria-pressed={commandMenuOpen}
                aria-label={t('dg.command.open')}
                data-testid='graph-command-trigger'
                className={commandMenuOpen ? 'bg-primary/10 text-primary' : undefined}
                onClick={() => setCommandMenuOpen(!commandMenuOpen)}
              />
            </Tooltip>
            {(panels || []).map((panel) => {
              const isActive = activePanel === panel.id;
              return (
                <Tooltip
                  key={panel.id}
                  title={`${!isActive ? 'Open' : 'Close'} ${panel.title.toLowerCase()} panel`}
                  placement={'right'}
                >
                  <Button
                    key={panel.id}
                    type='text'
                    icon={panel.icon}
                    className={isActive ? 'bg-primary/10 text-primary' : undefined}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (panel?.onClick) return panel.onClick();
                      if (panel?.renderPanel) setActivePanel(isActive ? undefined : panel.id);
                    }}
                  />
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      <GraphExcelDialog
        excelData={excelGraphData}
        handleSuccess={handleDataMapping}
        handleCancel={() => {
          setExcelGraphData(null);
        }}
      />
    </Fragment>
  );
};
