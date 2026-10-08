# 上游缺口：jdm-editor dg-infer 推理循环空转（return→continue）

- 日期：2026-10-08
- 状态：**seal-editor 已修复**（bdaf403d 及其后续 tester 仲裁批）；上游 jdm-editor
  待同步
- 上游位置：`packages/jdm-editor/src/components/decision-graph/dg-infer.tsx:142-145`

## 缺陷

`inferNodeTypes` 的遍历循环对 inputNode 早期返回用了 `return`，而它位于
`produce(nodeTypes, (draft) => { for (const … of graphWalker.walk(graph)) { … } })`
的 recipe 内——`return` 退出的是**整个 produce 回调**，不是本次迭代。

graphWalker.walk 的首个 yield 恒为 inputNode（traversal.ts walkGraph
`yield { node: begin, incomers: [] }`，begin 即 inputNode；无 inputNode 的图
walk 直接不产出）。因此：

- 有 inputNode 的图（一切合法图）：循环体只跑一次即整体退出，**下游节点零处理**；
- 无 inputNode 的图：walk 空转，同样零处理。

即 `inferNodeTypes` 对所有图都是 no-op——节点规格与自定义节点 spec 声明的
`inferTypes`（needsUpdate/determineOutputType）从未执行过，类型推断完全依赖
第一条 trace 驱动的 effect（simulate 结果回填 Input/Output）。

## 佐证

- 实证测试（mock VariableType + spy determineOutputType）：修复前调用数 = 0、
  isModified = false；修复后 = 1 / true（seal-editor dg-infer.test.tsx 四例锁定）；
- 上游同位代码核对：jdm-editor dg-infer.tsx:142-145 与修复前逐字一致。

## 修复

```diff
     for (const { node, incomers } of graphWalker.walk(decisionGraph)) {
       if (node.type === 'inputNode') {
-        return;
+        continue;
       }
```

inputNode 的类型由字段定义另路写入（本就无 inferTypes 可跑），应跳过本次迭代
而非退出整个推理。

## 行为影响面（消费方升级须知）

修复后 `inferTypes` 首次真正生效：

- 声明了 `inferTypes` 的自定义节点 spec 将开始在推断链中被消费
  （determineOutputType 的产出写入 nodeTypes 的 InferredOutput）；
- 内建节点若有声明同样开始生效；
- 下游 UI（typed input 类型提示、trace 类型推断）可能开始显示此前缺失的
  推断类型——属预期修复而非回归，但依赖「推断恒空」现状的宿主应知悉。

## 上游同步建议

补丁一行（return→continue）+ 同型回归测试。jdm 侧未关联 OQ/CONTRACT 条目——
属纯实现缺陷，无契约面变更。
