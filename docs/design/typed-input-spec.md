# Typed Input 万能值输入——参数值三模式显式化（缺口 D 立项）

- 日期：2026-10-02
- 状态：**已实施 · 走查收口**（控件原语 + 存储协议 + 兜底 tab 接线全落地；
  P2 走查 6 项缺口收口记录见 §7）
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

### 2.2.1 · UI 二分呈现（2026-10-04 增补，用户裁定）

**用户心智两分：写死的值 / 算出来的值**——「引用」不设为顶层概念（三概念认知
负担过重，业界对照 n8n Fixed/Expression 两分 + Excel `=` 心智）：

- **模式下拉恒两项**：`值`（literal）/ `表达式`（expression + reference）——
  reference **折叠进表达式呈现**，不再作为顶层选项；
- **表达式模式编辑框旁挂字段选择器**（fieldPaths 非空时出现）：点选字段插入
  `$.path`——引用降格为表达式的**输入辅助**（消灭手敲路径错字）；
- **存储三态不变**（用户裁定）：字段点选且编辑框为空 → 写 `reference`（保字段
  改名的精确迁移精度）；其余表达式编辑 → 写 `expression`；reference 信封重开
  折叠回表达式编辑器回显；
- **安全前提**：ADR-016 literal 原样绑定——「值」框内任何内容不求值（长得像
  表达式的字面量不再需要引号仪式，二分 UI 因此安全）。

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

### 分屏编辑器（主从实例编辑器）

主从编辑器右侧参数绑定区 → 同一 TypedInput 复用（已实施）。

### 专用节点（http_request url 试点，2026-10-05；crypto 输入推广，2026-10-06）

`kwargs.url` / `kwargs.input`（crypto 待摘要内容）→ TypedInput（值/表达式二分 +
字段选择器），信封全态直写：

- 旧裸串读态映射 expression（保语义——裸串执行面走表达式求值路径）；
- 「值」模式 = literal 信封原样绑定（zen-udf 1.1.0+），裸 URL/裸文本引号仪式
  退役（旧形态经求值失败落 null 的陷阱一并消除）；
- crypto 的 secret 槽位保留表达式编辑器（密钥几乎恒为 env 引用，值模式无益）；
- current-date 撤项：该函数**无参数**（此前登记的 format 推广位不存在）；
- 推广位（待触发）：http headers/params 值格（KeyValueEditor 行内）——结构化
  域，按需另议。

### 字段选择器层级化（cascader 换装，2026-10-06）

FieldPicker 从平铺 Select 换装 reui cascader（tree 模式 + searchScope=global
全树搜索 + selectable=any 分支兼叶子），插入语义逐字不变（空框→reference
信封 / 非空→拼表达式）。移植走查记录（badge/frame 移植惯例）：

- **裁剪集**：core/async/context/lib/types/i18n/nav/item 八文件；裁
  columns/footer/virtual（FieldPicker 单选无多选确认条、字段树小不需虚拟）；
- **懒 chunk 隔离**：弹层组合件 `React.lazy` 独立 chunk（实测 77.5KB，
  首开弹层才下载）——index.js 预算不动；Base UI Combobox 组合件走宿主
  external（vite external regex 既有规则），零 kernel 包体；
- **前置件**：scroll-area（Base UI 薄封装，external）/ spinner /
  icon-placeholder 垫片（lucide 按名映射，vendored 调用点零改动）；
- **双版本类型兼容**：ref 赋值处 `(ref as {current:unknown})` cast——
  kernel @types/react 19（RefObject current 可写）与 appshell 18（readonly）
  并存，vendored 代码须两侧同过；
- **树构建**：flat 点路径 → CascaderNode，value = 整条路径（选中即回传免
  反查）；分支与叶子同值并存（`customer` 与 `customer.tier` 都可选，
  selectable=any 承载）；
- CSS +12.6kB 为固有成本（Tailwind 全局类，懒加载隔不了）——预算随批对齐。

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

## 7 · 实施走查记录（2026-10-02 P2 收口）

初版实施与规格的 6 处偏差，本批全部收口：

| # | 走查发现 | 收口 |
| --- | --- | --- |
| 1 | **存储违约**：InstanceEditor 写入只落 `tv.value`，模式信息丢弃（表达式串重读降级 literal） | 写路径修正：literal 存裸值（引擎直读兼容），非字面量存 `{mode, value}` 信封；读取侧 `coerceToTypedValue` 双形态兼容 |
| 2 | §2.3 切换备忘缺失 | `previousByMode` ref：切换留存各模式旧值，切回恢复；新模式空值起步（不做内容自动推断） |
| 3 | §3 引用模式恒可见 | `fieldPaths` 为空时模式下拉隐藏引用项；信封停在 reference 而路径源被移除时降级显示 literal（存储不动，下次切换自愈） |
| 4 | `fieldPaths={[]}` 硬编码 | 兜底 tab 接线：首个输入节点 content → `getRequestDefinitions` 字段树 → 点路径清单 |
| 5 | 模式标签硬编码中文 | i18n 化（`cf.modeLiteral/modeExpression/modeReference`）+ 补齐 InstanceEditor 5 个缺失键（此前渲染裸键名） |
| 6 | number 参数用文本 Input + 强转 | `InputNumber` 原语（integer 同路）；boolean Switch 不变 |

**存储协议（§2.1 原文完整落地，2026-10-04 全量形态化收紧，kernel 1.21.0）**：
三模式恒写信封——引擎 zen-udf 1.1.0 原生拆包（literal 原样绑定 / reference
路径解析，实证 ✓），expression 信封由执行边界展开（expandTypedValues 仅拆
expression，literal/reference 透传）；读取侧 coerceToTypedValue 双形态兼容
不变（存量裸值永久合法）。

**$ 作用域边界（OQ7 已裁定，jdm dollar-scope-decision.md 立法）**：kwargs
求值域**从未接通 dollar 作用域**（standalone 绑定无注入）——`$.fieldx` 恒
null，字段引用用**裸键/点路径或 reference 信封**；表达式节点 / dt 单元格的
`$` 可用（isolate 已接通）。三面边界表 + 多语言移植 MUST 复现见 jdm 裁定
文档。编辑面对策已落地：表达式 placeholder 改裸键/点路径指引，字段选择器
插入无前缀路径。

**执行边界（信封展开）**：demo-server `expandTypedValues`（src/typed-values.ts，
纯函数深走 + 窄识别：自有键恰为 {mode, value} 且 mode 合法）在
/v1/execute · /v1/validate · /v1/shadow · /v1/functions/:name/execute 四口
模型进门时**仅拆 expression 信封**（literal/reference 引擎 1.1.0 原生，
透传；启动时运行时版本断言 ≥ 1.1.0 fail fast）。
其他宿主直连引擎执行存图时需自行展开 expression 信封（CONTRACT §11.6
已立法信封语义）。

**E2E 实证（2026-10-05，demo-server pipeline.test.ts）**：三模式信封全矩阵
过 /v1/execute HTTP 边界 ✓（literal 原样绑定 / expression 展开 / reference
原生路径）——§7 裸路径立法同轮实证：`user` 命中、`$.user` 恒 null（$ 根
不绑定节点输入），与上面对策一致。

**随档动作②（编辑器检测，已落地 2026-10-04）**：兜底 tab 漂移带检测 `$-路径
形态实参`（裸字符串 / expression·reference 信封内 `$.` 前缀——kwargs 域恒
null）——「运行时静默 null」提前为「编辑时可见警告」+ 一键迁移（剥 `$.`
前缀为裸路径）；literal 信封不检测（原样绑定是歧义根治语义）。

**随档动作③（扫描工具入库 + verdict 确认无负担，2026-10-04）**：
`scripts/legacy-graph-audit.mjs`（零依赖 CLI，检测语义与 kernel
findDollarFormRows 同源）——旧图导入场景**先扫后导**：
`node scripts/legacy-graph-audit.mjs graph.json`（发现即 exit 1，可作导入门禁）；
`--fix` 输出改写后 JSON（报告走 stderr）。verdict 确认数据面迁移对其
**无负担**。
