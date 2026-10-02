# Typed Input 万能值输入——参数值三模式显式化（缺口 D 立项）

- 日期：2026-10-02
- 状态：**设计走查 · 立项**（typed input 控件原语 + 存储协议 + 接线方案；
  Node-RED 模式出处，参数值「字面量/表达式/引用」三分类显式化）
- 上位：[custom-node-editor-spec.md](./custom-node-editor-spec.md) §4（缺口 D）、
  ADR-015 §4（typed input 候选）、[ADR-013](../adr/013-input-contract-design.md)
  （InputContract 字段树 = 引用模式数据源）
- 归属：seal-editor kernel（控件原语）+ 消费方接线（兜底 tab / 分屏编辑器）

## 1 · 问题：参数值的三元决策全靠隐式约定

规则引擎的参数值天然跨三种来历：

| 来历 | 例子 | 当前输入方式 |
| --- | --- | --- |
| 字面量 | `"GOLD"`、`3`、`true` | 按声明类型的输入框直接填 |
| 表达式 | `$.customer.tier == 'GOLD' ? 0.1 : 0.05` | 把表达式**当字符串写进文本框** |
| 上游引用 | `customer.tier`（InputContract 字段路径） | 同上——也是当字符串写 |

后两类的「这是个表达式 / 这是个字段引用」信息**全靠隐式约定**承载——没有类型
徽章、没有编辑器切换、没有按模式校验。用户靠记忆语法，读图的人靠猜。

## 2 · 设计：TypedInput 控件

### 2.1 存储协议

```ts
type TypedValueMode = 'literal' | 'expression' | 'reference';

type TypedValue = {
  mode: TypedValueMode;
  /** literal = 裸值；expression/reference = 表达式/路径字符串 */
  value: unknown;
};
```

- **additive 双写**：旧裸值读取时按声明类型推断为 `{mode:'literal', value}`；
  新写入始终输出 TypedValue 形态（圆往返保真——旧消费者能读裸值也能读
  TypedValue，新消费者只认 TypedValue）；
- **键主权登记**：`config.expressions[].value` 的形状演进登记（编辑面规格 §2
  键主权表追加行）。

### 2.2 控件 API

```ts
type TypedInputProps = {
  /** 声明参数类型（string/number/boolean 等）——字面量编辑器选择依据 */
  parameterType: string;
  value?: TypedValue;
  onChange: (value: TypedValue) => void;
  disabled?: boolean;
  placeholder?: string;
  /** 引用模式可选路径（InputContract 字段树投影） */
  fieldPaths?: string[];
};
```

三模式编辑器：

| 模式 | 编辑器 | 说明 |
| --- | --- | --- |
| literal | 按声明类型的输入框（text/number/checkbox） | 字面量直接填 |
| expression | monaco（紧凑模式，zen-expression 语法） | 表达式编辑 |
| reference | 下拉字段选择器（fieldPaths 列表） | 从合法路径中选 |

### 2.3 模式切换

右缘类型切换按钮（Node-RED typedInput 同款交互）——切换时保留旧值在
`previousByMode` 备忘（切回不丢值）。三种模式互斥。

### 2.4 引用模式数据源

`fieldPaths` 由消费方传入（_kernel 零 InputContract 依赖_）：
- 自定义函数表 → 从输入节点 InputContract 的字段树投影；
- 独立使用（无输入节点）→ fieldPaths 为空，引用模式隐藏。

## 3 · 组件规格

```tsx
export const TypedInput: React.FC<TypedInputProps> = (...);

// 渲染结构：
// ┌─────────────────────────────┬──────┐
// │ [按模式切换的编辑器]           │ 模式 ▾│
// └─────────────────────────────┴──────┘
```

- 模式切换按钮：右缘下拉（Select size=small），选项 = literal/expression/
  reference（reference 仅 fieldPaths 非空时可见）；
- 字面量编辑器：按 parameterType 渲染——string → Input、number →
  InputNumber、boolean → Switch；
- 表达式编辑器：紧凑 monaco（language='javascript'，自动补全 `$.` 前缀）；
- 引用编辑器：Select 从 fieldPaths 选。

## 4 · 消费方接线

### 自定义函数表（兜底 tab）

CustomFunction 的参数值列 → TypedInput 替换（值编辑层升级）。
旧裸值读取 → 推断为 literal → 编辑 → 保存 TypedValue 形态。

### 分屏编辑器（前瞻）

主从编辑器（P2 主从骨架的右侧参数绑定区）→ 同一 TypedInput 复用。

## 5 · 明确不做

- 自动推断（用户写 `$.` 前缀自动切 expression——反模式，显式优于隐式）；
- 嵌套 TypedValue（typed value 里再嵌 typed value——组合爆炸，不做）；
- dt 列类型对接（dt 已有自己的列类型体系，独立演进）。

## 6 · 后果

- 正面：参数值三元显式化；引用模式字段选择器消灭手敲路径错误；两个编辑面
  （自定义节点/输入节点）共享值编辑心智；表达式校验可按模式精准触发；
- 约束：存储形状变更（additive 双写过渡）；CustomFunction 组件需感知
  TypedValue 形态（读旧写新）；新 primitives 文件；
- 键主权：`config.expressions[].value` 的形状演进登记到编辑面规格 §2。
