import { useMemo } from 'react';

import type { DataGridI18nOverrides } from '../../reui/data-grid/data-grid-i18n';
import { useT } from '../../theming/i18n';

/**
 * data-grid 内置文案 → 本仓 useT 词条的单点接线（i18n 单 prop 全覆盖）。
 * 四个 DataGrid 消费点（dt 主表 / 双 excel 对话框 / 导入预览）共用，
 * 新增消费点直接展开本钩子，勿再手写局部 labels。
 */
export const useDataGridI18n = (): DataGridI18nOverrides => {
  const t = useT();
  return useMemo(
    () => ({
      labels: {
        sortAscending: t('dataGrid.sortAscending'),
        sortDescending: t('dataGrid.sortDescending'),
        pinColumnStart: t('dataGrid.pinColumnStart'),
        pinColumnEnd: t('dataGrid.pinColumnEnd'),
        moveColumnStart: t('dataGrid.moveColumnStart'),
        moveColumnEnd: t('dataGrid.moveColumnEnd'),
        columnsMenu: t('dataGrid.columnsMenu'),
        unpinColumn: (title: string) => t('dataGrid.unpinColumn', { title }),
        toggleColumns: t('dataGrid.toggleColumns'),
        rowCreate: t('dataGrid.rowCreate'),
        pinRow: t('dataGrid.pinRow'),
        unpinRow: t('dataGrid.unpinRow'),
        selectRow: t('dataGrid.selectRow'),
        selectAll: t('dataGrid.selectAll'),
        expandRow: t('dataGrid.expandRow'),
        collapseRow: t('dataGrid.collapseRow'),
        dragToReorder: t('dataGrid.dragToReorder'),
        dragToReorderRow: t('dataGrid.dragToReorderRow'),
        reorderingUnavailable: t('dataGrid.reorderingUnavailable'),
        loading: t('dataGrid.loading'),
        empty: t('dataGrid.empty'),
        allRowsLoaded: t('dataGrid.allRowsLoaded'),
        rowsPerPage: t('dataGrid.rowsPerPage'),
        paginationInfo: (info: { from: number; to: number; count: number }) =>
          t('dataGrid.paginationInfo', info as unknown as Record<string, string>),
        previousPage: t('dataGrid.previousPage'),
        nextPage: t('dataGrid.nextPage'),
        goToPage: (page: number) => t('dataGrid.goToPage', { page } as unknown as Record<string, string>),
        paginationEllipsis: t('dataGrid.paginationEllipsis'),
        filterSelectedCount: (count: number) =>
          t('dataGrid.filterSelectedCount', { count } as unknown as Record<string, string>),
        filterNoResults: t('dataGrid.filterNoResults'),
        filterClear: t('dataGrid.filterClear'),
      },
    }),
    [t],
  );
};
