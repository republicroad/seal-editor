import { hotkeysCoreFeature, syncDataLoaderFeature } from '@headless-tree/core';
import { useTree } from '@headless-tree/react';
import { type CustomFunctionTool, type CustomNodeNamespace } from '@republicroad/seal-appshell';
import React, { useMemo } from 'react';

import { Tree, TreeItem, TreeItemLabel } from '../components/reui/tree';

/**
 * 函数目录树（批次一：reui tree 首次入链）——域 → 工具两级目录，
 * 点工具叶直接插入画布（与 FunctionCatalog 抽屉同一插入契约）。
 * 数据 = useCustomNodes schema（含 meta.origin 维度，徽标待 ADR-009 透传后补）。
 */

type CatalogItem = { name: string; isBranch: boolean; tool?: CustomFunctionTool; children?: string[] };

export const CatalogTree: React.FC<{
  schema: CustomNodeNamespace[];
  onPick: (tool: CustomFunctionTool) => void;
  className?: string;
}> = ({ schema, onPick, className }) => {
  const { items, rootId } = useMemo(() => {
    const items: Record<string, CatalogItem> = {
      catalog: { name: '函数目录', isBranch: true },
    };
    for (const ns of schema) {
      const nsId = `ns:${ns.name}`;
      items[nsId] = { name: ns.title || ns.name, isBranch: true };
      items['catalog'].children = [...(items['catalog'].children ?? []), nsId];
      for (const tool of ns.tools ?? []) {
        const toolId = `tool:${ns.name}:${tool.name}`;
        items[toolId] = { name: `${tool.name}（${tool.title ?? tool.name}）`, isBranch: false, tool };
        items[nsId].children = [...(items[nsId].children ?? []), toolId];
      }
    }
    return { items, rootId: 'catalog' };
  }, [schema]);

  const tree = useTree<CatalogItem>({
    initialState: { expandedItems: ['catalog'] },
    rootItemId: rootId,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().isBranch,
    dataLoader: {
      getItem: (itemId) => items[itemId],
      getChildren: (itemId) => items[itemId].children ?? [],
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  return (
    <div className={`text-xs ${className ?? ''}`}>
      <Tree indent={14} tree={tree}>
        {tree.getItems().map((item) => {
          const data = item.getItemData();
          const isTool = data && !data.isBranch;
          return (
            <TreeItem key={item.getId()} item={item}>
              <div
                role={isTool ? 'button' : undefined}
                className='flex w-full cursor-pointer items-center gap-1 py-0.5 hover:underline'
                onClick={() => {
                  if (isTool && data?.tool) onPick(data.tool);
                }}
              >
                <TreeItemLabel item={item} />
              </div>
            </TreeItem>
          );
        })}
      </Tree>
    </div>
  );
};
