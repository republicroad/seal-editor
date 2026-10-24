/**
 * B2（flow-1 形态参照）：节点位置对齐网格。
 * 栅格缺省 5px——与 graph.tsx 的 snapGrid [5,5] 同栅格，拖拽吸附与整理动作同基准。
 * 纯函数，store alignNodesToGrid 与单测共用。
 */
export const snapNodesToGrid = <T extends { position: { x: number; y: number } }>(nodes: T[], grid = 5): T[] =>
  nodes.map((node) => ({
    ...node,
    position: {
      x: Math.round(node.position.x / grid) * grid,
      y: Math.round(node.position.y / grid) * grid,
    },
  }));
