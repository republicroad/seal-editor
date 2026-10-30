import { ArrowDownUpIcon, Command as CommandIcon, FocusIcon, ListChecksIcon } from 'lucide-react';
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

/** 侧栏（grid-area:sidebar）：单列——首格 ⇅ 导入/导出（json/excel 四动作一菜单，
 * 用户裁定）+ 面板导航（诊断徽标/聚焦/⌘K/宿主面板）。画布空间类工具在画布左上
 * 浮动层（graph-canvas-toolbar.tsx）。 */
export const GraphSideToolbar: React.FC<GraphSideToolbarProps> = () => {
  const t = useT();
  const decisionGraphRaw = useDecisionGraphRaw();
  const fileInput = useRef<HTMLInputElement>(null);
  const excelFileInput = useRef<HTMLInputElement>(null);
  const [excelGraphData, setExcelGraphData] = useState<ParsedExcelData[] | null>();

  const { setDecisionGraph, setActivePanel, setCommandMenuOpen, setDiagnosticsOpen, setFocusMode } =
    useDecisionGraphActions();
  const { viewConfig, panels, activePanel, commandMenuOpen } = useDecisionGraphState(
    ({ viewConfig, panels, activePanel, commandMenuOpen }) => ({
      viewConfig,
      panels,
      activePanel,
      commandMenuOpen,
    }),
  );
  const diagnosticsOpen = useDecisionGraphState(({ diagnosticsOpen: open }) => open);
  const diagnosticErrorCount = useDecisionGraphState((state) =>
    selectDiagnostics(state).reduce((n, entry) => (entry.severity === 'error' ? n + 1 : n), 0),
  );
  const { focusMode } = useDecisionGraphState(({ focusMode }) => ({ focusMode }));

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
      const { name, decisionGraph, viewConfig: viewConfigState } = decisionGraphRaw.stateStore.getState();
      const fileName = name.replaceAll('.json', '');

      const decisionTableNodes = decisionGraph.nodes
        .filter((node) => node.type === NodeKind.DecisionTable)
        .filter((node) => (viewConfigState?.enabled ? !!viewConfigState?.permissions?.[node.id] : true))
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

  const importExportItems: MenuProps['items'] = [
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
        <div
          className={
            'flex w-12 min-w-12 flex-col items-center justify-between gap-2 border-r border-r-[var(--border)] py-2'
          }
        >
          {/* 顶部组：⇅/诊断/聚焦；底部组：⌘K/面板沉底（justify-between——e2e dock 探针与 flow-1 惯例依赖此几何） */}
          <div className={'flex flex-col items-center gap-2'}>
            {/* ⇅ 导入/导出：json/excel 四动作一菜单（首格，用户裁定） */}
            <Dropdown menu={{ items: importExportItems }} placement='rightBottom' trigger={['click']}>
              <Button
                type={'text'}
                aria-label={t('dg.toolbar.importExport')}
                data-testid='import-export'
                icon={<ArrowDownUpIcon className='size-4' />}
              />
            </Dropdown>
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
          </div>
          <div className={'flex flex-col items-center gap-2'}>
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
