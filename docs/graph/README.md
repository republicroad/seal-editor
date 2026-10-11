# Graph fixtures

决策图测试夹具，供文档与回归验证引用。

## expression-node-dollar-ref.json

表达式节点 `$` 语义演示图（input → expression1）。

- 行 `c = 3`、`d = 4`：字面量
- 行 `e = $.a`：**无效引用** —— `$` 根只覆盖当前节点行输出累积域，不含输入字段；该行被引擎静默丢弃（输出中无 `e` 键）
- 行 `g = $.c`：先行行交叉引用，`$` = 当前节点行输出域，`$.c` = 3

实测（zen-engine 2.1.0，`decision.evaluate`）：

```
输入:  {"a": 1, "b": 2}
输出:  {"a": 1, "b": 2, "c": 3, "d": 4, "g": 3}
```

规则：**节点内交叉引用用 `$.<rowKey>`；输入数据一律裸字段名直引**。
行引用失败不报错、静默缺键——编辑器侧校验（漂移带/检查器）应识别
`$.<非行键>` 且该名为输入字段时的可修复提示。

全上下文 `$` 绑定实测矩阵（决策表/独立求值/`$root`/`$nodes`）见
[zen-dollar-binding-matrix](../design/zen-dollar-binding-matrix.md)。
