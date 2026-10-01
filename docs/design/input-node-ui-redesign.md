# 输入节点 UI 重设计——从三页签独立到分屏联动编辑器

- 日期：2026-09-30
- 状态：**UI 范式提案 · 待裁定**（[ADR-013](../adr/013-input-contract-design.md) 的 UI 层配套设计；ADR 定义数据模型与同步机制，本文档定义视图形态）
- 前置：[ADR-013](../adr/013-input-contract-design.md) InputContract 契约对象

## 0. 现状与痛点

输入节点编辑面板使用**三页签独立**模式：字段定义 / 用例数据 / Schema 各占一个页签，
页签间切换 = 上下文断裂。

| 痛点 | 具体表现 |
| --- | --- |
| 上下文断裂 | 编辑 Schema 时看不到 Examples 是否受影响；必须切页签确认 |
| 编辑反馈延迟 | Examples 里的字段与 Definitions 定义不一致时，无创作时提示——运行时才暴露 |
| 导航成本 | 字段多时，Definitions 的递归树 + Examples 的源列表需要来回切换对齐 |
| 无实时校验 | 三视图均无内联的 schema 约束校验（required 缺失 / 类型不匹配） |

## 1. 业界三种编辑范式

### 范式 1 · 三页签独立（当前模式）

Postman 旧版、多数 IDE。页签间切换 = 上下文断裂，编辑 Schema 时看不到 Example 影响。

### 范式 2 · 分屏联动（业界金标准——Stoplight Studio）

```
┌─────────────┬──────────────────────────────────┐
│ Field Tree   │  Selected Field Editor           │
│ (常驻导航)    │  (form or code, per type)       │
│              │                                   │
│ ▼ customer   │  Name: [customer____]            │
│   tier  str  │  Type: [string ▼]                │
│   weight num │  Required: [✓]                   │
│ ▼ cart       │  Description: [________]         │
│   weight num │                                  │
│              │  ── Example Preview ──           │
│ [+ Add field]│  { "tier": "GOLD", ... }        │
└─────────────┴──────────────────────────────────┘
```

**关键设计**：
- **左栏持久 field tree**——不是页签，是常驻导航（永远看得见结构）
- **右栏上下文感知编辑**——选中字段后右侧变为该字段的专属编辑器
- **Example Preview 内嵌在右栏底部**——不是独立页签，是当前字段的实时预览
- **Top bar 切换 Design/Code 模式**——Design = 结构化表单，Code = 原始 JSON Schema

代表：Stoplight Studio（金标准）、Swagger Editor、Insomnia。

### 范式 3 · Schema-driven 自动表单

Schema 定义后自动生成表单——用户永远不直接编辑 schema。低代码平台（Retool/Appsmith/react-jsonschema-form）的模式。适合简单场景，但复杂嵌套/约束的表达力不足。

## 2. 业界收敛出的核心交互模式

| # | 模式 | 来源 | 说明 |
|---|---|---|---|
| 1 | **字段树常驻导航** | Stoplight/Postman v10 | 树不是页签——是常驻的结构导航，选中节点后右侧变为该节点的编辑器 |
| 2 | **类型驱动编辑器切换** | Stoplight | 字段类型从 `string` 改为 `object` → 编辑器从文本框变为嵌套子字段列表 |
| 3 | **Schema ↔ Example 双向校验** | Postman/Swagger | 编辑 example 时，右侧内联显示 schema 约束的校验结果（required 缺失 / type 不匹配 / enum 越界）——不切页签 |
| 4 | **Design / Code 双模式** | Stoplight/Swagger Editor | 结构化表单 ↔ 原始 JSON Schema，一键切换，双向同步 |
| 5 | **Example as executable doc** | Postman/Insomnia | 每个示例一键执行——不只是文档，是可运行的活文档 |
| 6 | **Migrate 而非静默改** | DB migration 同型 | schema 变更后 examples 不被自动修改，而是标记 drifted + 提供显式迁移操作 |

## 3. 推荐范式：分屏联动编辑器

### 3.1 布局

```
┌──────────────────────────────────────────────────────────┐
│ ┌────────────┐  ┌───────────────────────────────────────┐│
│ │ Field Tree  │  │  Context Editor                       ││
│ │ (reui Tree) │  │                                       ││
│ │             │  │  ┌─ Design ─┐  ┌─ Code ─┐            ││
│ │ ▼ customer  │  │  └──────────┘  └────────┘            ││
│ │   tier  str │  │                                       ││
│ │   weight num│  │  Name: [________]                     ││
│ │ ▼ cart      │  │  Type: [string ▼]                     ││
│ │   weight num│  │  Default: [________]                  ││
│ │             │  │  Description: [________]              ││
│ │ [+ Add]     │  │                                       ││
│ │             │  │  ── Example ────────────────────      ││
│ │             │  │  { "tier": "GOLD", ... }             ││
│ └────────────┘  └───────────────────────────────────────┘│
│                    [SchemaToolbarActions]                  │
└──────────────────────────────────────────────────────────┘
```

### 3.2 组成

| 区域 | reui 组件 | 说明 |
| --- | --- | --- |
| **Field Tree（左栏）** | `tree`（已在 backlog row 5 落地） | 常驻结构导航；namespace→field 两级 |
| **Context Editor（右栏）** | `field` + `input` + `select` + `switch` + `textarea` | 选中字段的专属编辑器（Design 模式）|
| **Code Editor（右栏）** | `code-block`（Shiki 高亮，已 vendored） | Code 模式：原始 JSON Schema |
| **Example Preview（右栏底部）** | `code-block`（JSON 高亮） | 当前字段的 example 实时预览 |
| **Toolbar** | `SchemaToolbarActions`（已提取） | 格式化/导入/仿真联动 |
| **Drift 徽标** | `badge` | drifted examples 的视觉警示 |

### 3.3 交互规则

| 操作 | 效果 |
| --- | --- |
| Tree 选中 namespace | 右栏显示该 namespace 的字段列表（Design 模式）|
| Tree 选中字段 | 右栏显示该字段的编辑器（type 驱动控件切换）|
| 右栏编辑 | → contract store 更新 → 其余视图同步 |
| 右栏 [Code] 切换 | → 显示原始 JSON Schema（只读或编辑）|
| Tree 右键 → 删除 | → 字段移除 + examples 漂移标记 |
| [+ Add field] | → 在当前 namespace 下新增字段 |

### 3.4 reui 组件选型

| 区域 | reui 组件 | 说明 |
| --- | --- | --- |
| Field Tree | `tree`（已在 backlog row 5 落地） | headless-tree syncDataLoader |
| Field Row | `field` + `input` + `select` + `switch` + `textarea` | 统一 label/control/description 模式 |
| Code Editor | `code-block`（Shiki 高亮，已 vendored） | JSON Schema 编辑/预览 |
| Panel Shell | `frame`（已在用） | `spacing='xs'` 档 + `dense` 适配窄面板 |
| Drift 徽标 | `badge` | severity 色标（error/warning）|
| 面板容器 | `sheet` 或 `tabs` | 与 simulator/治理面板统一挂载模式 |

## 4. 实施切分

| 阶段 | 内容 | 量级 | 前置 |
| --- | --- | --- | --- |
| **UI-1** | InputContract store（合并三 hook → 单 store + drift 检测）| kernel | ~1 天 |
| **UI-2** | Field Tree + Context Editor（reui Tree + field 原语） | kernel | ~1.5 天 |
| **UI-3** | Code/Design 双模式切换 + Example Preview 内联 | kernel | ~1 天 |
| **UI-4** | Drift 徽标 + 迁移按钮（对接 ChangeLogPanel）| appshell | ~0.5 天 |
| **UI-5** | 旧图兼容（;; 位置绑定 → 具名调用自动迁移） | kernel | ~0.5 天 |

总量 ~4.5 天，可拆两个 PR（UI-1~3 为一个，UI-4~5 为一个）。

## 5. 开放问题

1. **Type-driven 控件映射**：`type: 'string'` → Input / `type: 'object'` → 嵌套 Tree / `type: 'array'` → ??? 每种类型用什么控件？
2. **嵌套字段深度**：`object` 内嵌 `object` 的编辑——递归 Tree 还是平铺？
3. **与 dt 编辑器的一致性**：dt 的字段编辑（BlurCommitInput + Select）与 input node 的字段编辑是否共享控件？
4. **树操作与 undo/redo 的集成**：字段添加/删除是否进 undo 栈？

## 6. 后果

- 正面：消除页签上下文断裂；创作时 quality gate（schema ↔ example 实时校验）；字段树常驻导航降低认知负荷；Examples 升级为可执行测试用例；
- 约束：UI-2~3 是 kernel renderSettings 的重构（InputContract store + 视图迁移，总量最大）；ajv 依赖需评估体积预算；树形嵌套编辑的 UX 需设计走查；
- 协商方式：jdm-editor 在本文档逐节标注（接受/否决/修改），裁定后更新状态行；实施随内核 minor 发版。
