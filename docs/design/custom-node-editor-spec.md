# 自定义节点编辑面规格——config 键主权、模型意图与 UI 适配评估

- 日期：2026-10-02
- 状态：**规格（legislative）+ 评估（UI 层为评估非裁定）**
- 上位：ADR-011（parametersSchema 唯一规范表示）、ADR-013 批次三（drift 模式
  第二次复用——参数漂移带）、[dedicated-node-registry-design.md](./dedicated-node-registry-design.md)（三级降级阶梯）
- 调用格式演进（位置数组→具名字典）已立法为 [ADR-015](../adr/015-custom-function-node-spec.md)

## 1 · 模型层意图：`content.config = z.any()` 是特性

自定义节点是 zen-udf 解析的核心面——`content.config` 就是运行时读取的执行配置。
模型层三条事实，均已核查：

1. **`customNodeSchema.content.config = z.any()`**（schema.ts，已加意图注释）：
   config 的形状由 pack 的 `parametersSchema` 定义（运行时契约），编辑器 zod
   刻意无感知。收紧成严格 schema = 重引 safeParse 剥键事故（pack 自有键丢失）
   + 破坏 pack 自治——**明确不建议**。fidelity fixture 已含 config 未知键
   深结构往返断言（`nested.deep`），防止未来误改；
2. **编辑层圆往返安全（缺口 C 核对结论）**：兜底 tab（CustomFunctionTable）
   的 onChange 走 immer 局部变更，只写 `expressions / expr_asts / meta` 三键
   ——其余键（含 pack 自有键）原样保留；
3. **参数漂移带已落地**：行的函数调用 args vs 现行 `parameters.properties`——
   缺参（补默认）/未识别键（不静默删）；仅 scoped 档；见
   `computeFunctionArgsDrift` / `fillMissingFunctionArgs`（custom-function-schema.ts）。

## 2 · config 键主权表（key ownership）

`config` 是多写手共享的文档区，唯一安全机制 = **各写手只写自己的键**。
任何新写手接入前必须在此登记：

| 键 | 唯一写手 | 说明 |
| --- | --- | --- |
| `expressions` / `expr_asts` | 自定义函数表格 tab（`persistExpressions` 单漏斗） | 表达式绑定行 + 派生 AST 镜像 |
| `meta`（user/proj） | 自定义函数表格 tab | **会话署名**（注意：与 `__meta__` 是两个东西） |
| `__meta__.packVersion` | migrateGraph | **版本锚**——图级迁移链的起点，表格永不触碰 |
| `inputField` / `executionMode` / `outputPath` | 节点容器设置 | 输入作用域 / 循环模式 / 输出位 |
| 其余（pack 自有键） | pack 自身 | 编辑器圆往返保真，永不触碰 |

新增写手（如 typed input 存储迁移）接入 = 在本表登记 + 单漏斗收编 + 往返测试。

## 2.5 · 函数可见性语义（2026-10-03 立法）

**节点内可见的函数集 = 节点形态的声明语义**，单一事实源是
`resolveFunctionScope(kind, customFunctions)`——任何编辑面（InstanceEditor
函数下拉、补全、REPL）都从它取集，不另造第二套过滤。

| 节点形态 | 可见函数集 | scope.mode |
| --- | --- | --- |
| 专用节点（http_request / roster…） | 仅自身（tab 即该函数编辑器，无下拉概念） | —（不经 resolveFunctionScope） |
| 容器节点（kind = 命名空间名） | 该命名空间 tools | scoped |
| 旧版自由 UDF（kind = UDF） | 全集 | legacy |
| 孤儿容器（命名空间被租户过滤/下线） | 全集 + `orphanKind` 降级提示（琥珀语义：原命名空间已下线） | free + orphanKind |

三条边界原则：

1. **创建面与使用面分离**（ADR-010 延伸）：调色板 `catalogFilter` 管「能创建
   哪些节点」；节点内 resolveFunctionScope 管「该实例能调哪些函数」。租户过滤
   后：调色板不再出现该容器（创建面），已存在实例降级为 free + 漂移标记（使用面），
   不直接消失；
2. **软作用域**：scoped 下拉是交互过滤不是安全围栏——表达式模式手写 `$.` 调用
   任意函数不硬拦（显式优于隐式）；真正授权在服务端（zen-udf registry 按租户装配）；
3. **降级必须可见**：孤儿容器不白块但用户须知降级——函数下拉区挂琥珀提示，
   已存实例按漂移标「未识别函数」。

业界对照：容器 scoped = Zapier/Make 模块化；专用节点 = n8n node=operation；
自由 UDF = Windmill 全库可选；tester 接管 = JSON Forms。业界无一做
「容器里看所有命名空间」的混合作用域——跨域用自由 UDF 或另建容器（组合而非聚合）。

### 编辑器最小高度

InstanceEditor 根容器设 'min-h-[320px]'——无实例/空态时不因内容塌缩为单行。

### 主从编辑器深化（2026-10-02 P2 走查收口）

InstanceEditor 视觉重设计 + 功能补全：双卡片列（实例列表 / 参数编辑）、
列表行双行化（函数名 + →输出键）与悬停删除、漂移/重复点标进列表、右栏
输出键可编辑（重复即时警告）、函数描述行、必填星 + 类型标、dependsOn 只读
标签、fieldPaths 透传（引用模式三态）。参数值写入经 typed-input 协议
（literal 裸值 / 非字面量信封）——见 [typed-input-spec.md](./typed-input-spec.md) §7。

### 运行时仿真内联（2026-10-03 增补）

主从编辑器接入实例级仿真结果（表达式节点 traceData 行尾值显示的同款范式，
业界出处 VS Code inline debug values / n8n test-step / Windmill 行内 chip）：
tab 读 `simulate.result.trace[id].output`（按实例 key 归集，passThrough 输入
混于其中按 key 取值即纯净结果）→ `outputsByKey` 下传；列表行尾截断 chip +
右栏 Result JSON 区，`{error:...}` 形态红显 + ⚠；结果 run-scoped——标注
「上次仿真结果，图变更后重新运行以刷新」。


## 3 · `expr_asts` 权威性（zen-udf 澄清项 · 待提）

`expr_asts` 是 `expressions` 的派生缓存（`toOperatorExprArray` 存储化）——
双写冗余。风险：第三方写手只更新 `expressions` 不更新 `expr_asts`，引擎**若读
expr_asts** 即静默错执行。需向 jdm 澄清一个事实：

- 引擎读 `expressions`（value 原文，运行时解析）→ `expr_asts` 是可丢弃缓存，
  现状无害，文档记一笔即可；
- 引擎读 `expr_asts` → 它是契约的一部分，写入纪律进 CONTRACT §10，且建议
  引擎加「expressions 与 expr_asts 不一致」防御校验。

## 4 · UI 层评估：兜底表格能否用 reui 重新设计

**结论：整体不可换——核心交互（表达式绑定编辑）没有对口的 ReUI 复合组件；
可填的只有外围件，且多数已填。** 逐块：

| 区域 | 现状 | reui 适配性 |
| --- | --- | --- |
| 表达式绑定表（CustomFunctionTable） | 专用编辑器（表达式构造 + 权限模型 + debug trace + inputVariableType） | ✗ 无对口——data-grid 换壳丢掉的是交互不是样式；维持 |
| 函数选择 | kind 页签 + 图标网格富选择器 | ✗ 维持否决清单已有记录（autocomplete 是降级） |
| 漂移带（本批新落） | 自绘琥珀带 + badge 语义 | △ badge 已在用；alert 可选但无交互升级，不构成填缝 |
| 容器设置（inputField/executionMode） | controls.ts 原生件 | △ 同上，无对口复合件 |

### 业界参照（自定义函数节点的编辑面）

| 实现 | 自定义函数编辑面形态 | 可借鉴点 |
| --- | --- | --- |
| **Windmill** | **双模式**：schema 生成的参数表单 ↔ 代码视图，一键切换、双向同步、圆往返 | 与 inputNode Design/Code 同构的函数版——若参数漂移带成熟，双模式是下一步范式候选 |
| **n8n** | 100% schema 驱动 + displayOptions 显隐 + 富类型系统；自定义函数 = Code 节点（编辑器 + 执行模式切换 + 输出面板） | 自定义函数的经典三件套：**编辑器 + 执行模式 + 输出面板** |
| **Zapier / Make** | 字段映射面板（上游输出 → 下游参数的显式 mapping） | 映射可视化——我们的表达式表就是轻量版 |
| **Retool** | 按资源类型的专用查询 UI + 原始 options 兜底 | 资源分型 + 原始兜底 = 三级阶梯的同构 |
| **Node-RED** | 节点定义声明式 defaults → 通用编辑器渲染；自定义 edit.html 才接管 | **Typed Input 万能值输入**（缺口 D 出处）：一控件 + 类型切换（字面量/表达式/引用/JSON），值 = 类型 + 内容两元组——参数值三分类显式化的鼻祖 |
| **Node-RED** | Typed Input 万能值输入（缺口 D） | 见 §5 |

### 三条底线（业界趋同，本仓对照）

1. **schema 随函数自带**——渲染器通用、永不硬编码（parametersSchema ✓）；
2. **永不白块**——原始形态永远可用（CustomFunctionTable 兜底 ✓）;
3. **圆往返保真**——表单不认识的字段原样保留（immer 局部变更 ✓ + 本表键主权）。

## 5 · typed input（缺口 D）存储协议前置协调

若立项（参数值从裸标量/operator 数组 → 类型化两元组 `{type, value}`）：

- 解析协议需 zen-udf 参与——引擎要么认新形态，要么 seal 侧展开为引擎形态
  后投递（后者零 zen-udf 改动，推荐起步方式）；
- 存储为 additive：旧裸值读取时按声明类型推断、新值双写；
- 接入 = 本表键主权新增一行（`config.expressions[].value` 的形状演进登记）。

**实施记录（2026-10-05，http_request url 试点）**：ADR-016 信封落地后本节前提已满足——
zen-udf 1.1.0+ 原生认信封（literal 原样绑定 / expression 求值），无需 seal 侧展开。
`kwargs.url` 已切 TypedInput（值/表达式二分）：信封全态直写，旧裸串读态保语义映射
expression。详见 typed-input-spec §4 专用节试点；推广位见该节。

## 6 · 后果

- 正面：键主权显式化终结「谁写谁」的口头约定；`z.any()` 意图防误收紧；
  expr_asts 澄清项进入 jdm 议程；typed input 前置协调有落点；
- 约束：新写手接入必须登记本表；expr_asts 澄清前，第三方写手只许经
  `persistExpressions` 管线写 config；
- 评估性质：§4 的 reui 适配结论为评估非裁定——Windmill 双模式若立项，
  另起设计文档（预计走 ADR-013 分屏范式的同款流程）。
