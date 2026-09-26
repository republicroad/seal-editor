# ReUI data-grid 上游贡献包：`getRowClassName` / `getCellClassName`

- 日期：2026-09-27
- 状态：**就绪待提交**（治理裁决：上游贡献由宿主手动执行）
- 基线：base-nova registry 的 `data-grid`（jdm-editor reui 线于 65e63217 vendored 的版本）
- 补丁：[`reui-data-grid-extensions.patch`](./reui-data-grid-extensions.patch)（56 行，仅两个可选回调）

## 动机

决策表（decision table）编辑器把 TanStack v9 表实例喂给 vendored data-grid 渲染时，
需要两类**状态着色**，而现有插槽（status 角标、row status）均不覆盖：

1. **行级**：cursor 所在行高亮、simulator 命中行、diff removed 行的整行底色；
2. **格级**：字段级 diff tint（modified 行仅变更格着 warning 底色）、cursor 格描边。

这些是**瞬态/派生态**（来自仿真、diff、编辑位置），不属于数据本身，因此不适合
`getRowStatus`/`getCellStatus` 的角标语义；以可选类名回调暴露是通用解。

## API（补丁全文）

```ts
/** Optional per-row class names for stateful row tints the status slots do
 *  not cover (transient highlight, active simulation row, …). */
getRowClassName?: (row: TData, dataIndex: number | undefined) => string | undefined;

/** Optional per-cell class names for stateful tints/outlines the status
 *  corner-mark slot does not cover (field-level diff coloring, transient
 *  cursor highlight, …). Concatenated into the body cell's className. */
getCellClassName?: (row: TData, columnId: string, rowIndex: number | undefined) => string | undefined;
```

接线点各一处：body row 的 `className` 拼接 `rowClassName`；body cell 的
`className` 拼接 `getCellClassName?.(row.original, column.id, row.index)`。

## 实战验证

seal-editor 决策表（决策表核心编辑器整体跑在 vendored grid 上，
见 seal-editor 仓 `docs/design/dt-datagrid-retrofit-plan.md`）已在线上使用：
字段级 diff tint、cursor 行/格高亮、simulator 命中行三类状态全部经此二回调渲染，
461 单测 + 76 storybook 交互用例 + 明暗双主题走查通过。

## 同源佐证

seal-editor 与 jdm-editor（reui 线）两仓的 data-grid vendored 副本均已包含
同一补丁（jdm `f9a1b19e..0ebc46b3` 区间引入，diff 即本文件所附），跨越
`DataGridTableDndRows`（非虚拟全量渲染）与表头吸顶两种布局验证。

## 提交方式（宿主手动）

1. 向 ReUI 上游提交 issue/PR 时附本补丁与本文动机段；
2. 上游合并后，seal/jdm 两侧 vendored 副本回归 pristine + 该补丁的组合不变，
   后续上游更新可继续无补丁跟踪。
