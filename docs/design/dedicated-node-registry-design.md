# 专属节点 UI 注册表——schema 化渲染设计（节点去硬编码）

- 日期：2026-09-29
- 状态：**设计定稿待实施**（轨道 B Phase 2；含版本迁移器 §5——实践 6 落地；上游缺口记录见 [ADR-010](../adr/010-function-catalog-tenant-filter.md) 确认段）
- 归属：appshell（useCustomNodes 流程）；内核零改动；zen-udf 核心零改动（origin 依赖为可选增强，见 §6）
- **两层衔接（2026-10-08）**：本档 = 插件体系的**存在性层**（catalog 载荷 → 哪些
  namespace 存在、以什么形态存在）；**编辑接管层**（节点实例 → 编辑面板归谁）
  已立法为 [ADR-017](../adr/017-dedicated-editor-plugin-system.md) 并实施
  （`resolveCustomNode` tester+rank）。本档 tester(ns) 评分语义与 ADR-017
  tester(ctx) 谓词语义刻意不同层， pack 作者视角入口见
  [pack-authoring-guide](./pack-authoring-guide.md)。

## 0. 背景与问题

ADR-010（ed4595d 修正）确立「参考域缺省可见、有条件可过滤」——verdict 可按租户
关闭 http 等出网域（SSRF 面管控）。但 appshell `useCustomNodes` 的四个内建基础
节点（http-request / crypto / current-date / query-list）硬编码在
`composeBaseNodes`，不经目录载荷：**租户被关 http 域时 httpRequestNode 仍可见
可拖，而执行端注册已撤**——画布节点运行期报未知函数。

现状接管形态（要反转的）：schema 载荷照发全量 namespace，`filterOverridden`
按函数名排除被接管的域，专属节点静态注册、客户端常驻。存在性由客户端代码决定，
与服务端目录脱钩。

## 1. 业界六实践（渲染器注册表模式）

「schema 驱动存在性 + 专属 UI 注册表增强 + 通用回退」在业界有成熟同构实现：

| 业界实现 | 数据层（存在性） | 专属 UI（增强） | 回退 |
| --- | --- | --- | --- |
| JSON Forms | JSON Schema | renderer 注册表 + **tester 带 rank 评分** | 内建默认渲染器 |
| VS Code Custom Editors | 文件本身 | 按 selector 注册 viewType 接管 | 默认文本编辑器 |
| Unity Inspector | 序列化字段自动生成检查器 | `[CustomEditor]` 按类型接管 | `DrawDefaultInspector()` |
| Grafana 面板 | panel 注册表按 type id | 每面板自定义 options 编辑器 + 版本 migrator | 自动生成表单 |
| K8s CRD 控制台 | CRD 结构化 schema | 按 kind/apiGroup 注册专属视图 | 通用 YAML 视图；`additionalPrinterColumns` 元数据增强 |
| rjsf / Formily | JSON Schema | widget/field registry 查表 | DefaultWidget |

提炼六条：

1. **存在性归数据层，UI 注册表只做增强**——VS Code/K8s：文件/CRD 是否存在与
   装了什么编辑器/视图无关；
2. **tester 校验能力 + rank 排序**（JSON Forms）——接管按完整子 schema 打分，
   最高分胜出、注册期同分报错；不是按名查表；
3. **三级降级阶梯**——专属 UI → 自动生成 → 通用只读（Grafana/rjsf/K8s YAML 视图）；
4. **部分接管 + 调用通用**（Unity `DrawDefaultInspector()`）——专属 UI 只画
   特有部分，其余内嵌通用渲染器，避免每次通用能力升级都要手动跟四个 Tab；
5. **元数据增强通用渲染**（K8s `additionalPrinterColumns`）——中间档：不写专属
   UI，只给通用渲染加显示提示；提示归客户端注册，**不进 UdfPackMeta**
   （ADR-009 元数据最小化纪律）；
6. **版本迁移器（migrator）**（Grafana）——域形状演化时旧节点数据走迁移或
   明确降级，不静默错配；与 parse-fidelity 约定（新字段必进夹具）同纪律。

## 2. 注册表形态

```ts
/** 专属节点 UI 注册表项（appshell 内部；宿主可扩展注入） */
export type DedicatedNodeRegistration = {
  /** 能力校验 + 优先级：校验载荷域的工具形状是否与本专属 UI 匹配，返回 rank；
   *  返回 0 = 不匹配。最高分胜出，注册期同分报错（实践 2）。 */
  tester: (ns: CustomNodeNamespace) => number;
  /** 节点工厂：createSpecNode 组装（kind/displayName/group/renderTab 等），
   *  renderTab 内部对未覆盖区嵌通用容器（实践 4）。 */
  factory: (ns: CustomNodeNamespace) => CustomNodeSpec;
  /** 实践 6：域形状破坏性演化的显式迁移链（按 from 版本升序执行，见 §5）。
   *  迁移器与专属 UI 同人同文件——域作者在注册时一并声明。 */
  migrations?: DedicatedNodeMigration[];
};

export type DedicatedNodeMigration = {
  /** 起始 pack 版本（UdfPackMeta.version）：节点 config.__meta__.packVersion
   *  低于当前域版本时，按升序执行所有 from > 记录版本的迁移。 */
  from: string;
  /** 迁移说明（人读）：审计/设计时变更日志的天然数据源（治理窗批次）。 */
  describe: string;
  migrate: (config: CustomNodeConfig, ctx: { ns: CustomNodeNamespace }) => CustomNodeConfig;
};
```

`useCustomNodes` 新流程：

```
fetchCustomNodeSchema(schemaSource)          ← 服务端已按租户过滤（安全边界）
  │
  ├─ 对载荷每个 namespace：
  │    registry.tester 全量评分 → 最高分 > 0 → 专属节点（factory）
  │                            → 全部 ≤ 0 → 通用容器（schemaToCustomNodes 现路径）
  │
  ├─ legacyUdfNode 常驻（旧图兼容，不归属任何 namespace，不受目录管控）
  │
  └─ composeBaseNodes 静态四项删除
```

## 3. 三级降级阶梯与旧图分离（实践 3）

| 场景 | 行为 |
| --- | --- |
| namespace 在载荷 + tester 匹配 | **可创建**：专属节点（专属 Tab） |
| namespace 在载荷 + tester 不匹配 | **可创建**：通用容器（kernel 兜底 tab / InstanceEditor——SchemaContainerTab 已退役收编，2026-10） |
| namespace 不在载荷 | **不可创建**：面板/补全/REPL 均不出现 |
| 旧图已有节点 + namespace 已被关 | **只读渲染**：按 kind 降级为通用只读容器 + 运行期错误就地显示（不白块） |

实现要点：节点 kind 注册（renderNode）与面板可创建列表分离——前者按 kind 常驻
（覆盖旧图），后者严格跟随载荷。

## 4. 部分接管（实践 4）

四个专属 Tab 内未特化的区域（参数表、返回展示）内嵌通用容器渲染，专属部分只画
域特有交互（http 的请求构造/认证区、crypto 的编解码预览）。通用容器能力升级
（工具提示、弃用标记 A4）自动传导，消除四 Tab 的隐性维护税。

## 5. 版本迁移器（实践 6 落地）

节点里存的是**历史时刻的域契约**（位置参数绑定、工具名），服务端注册表持有
**当前契约**。域形状演化（工具加参/改名/拆分/删除）时，两者漂移——位置绑定的
错配是**静默错数据**（不报错、绑定错位），比未知函数更危险。对策按漂移类别分两级：

### 5.1 绑定漂移（非破坏性）——具名调用优先 + 通用 rebinder

- **具名调用优先**：`{$call: fn, kwargs}` 形态自描述，天然抗插入/重排——新建
  节点的 seed 默认产出具名形态（三形态调用规范已支持），从源头减少迁移需求
  （resilience-by-design 先于 migration machinery）；
- **通用 rebinder 兜底**：载入时对位置形态的节点，按当前 parametersSchema 做
  **幸存参数名重映射**——能按名对上的迁移，对不上的标记为缺失并写入迁移报告，
  **绝不猜测静默改写**；
- 零注册成本：rebinder 是通用机制，不专属四域。

### 5.2 破坏性演化——域作者显式迁移链（Grafana migrator 同型）

- 域作者在注册表项声明 `migrations`（§2）：`from` 版本锚点 + 显式 transform；
- **版本锚**：seed 时在节点 `config.__meta__.packVersion` 记录创建时的
  `UdfPackMeta.version`（`__meta__` 槽位契约已存在，零变更）；载入时
  记录版本 < 当前域版本 → 按升序执行迁移链 → 更新锚；
- **缺 `__meta__` 的存量图 = validate-only**：只做绑定校验与报告，不自动
  transform——无版本锚的猜测迁移违反实践 6 的"不静默错配"；
- **无迁移器的破坏性变更 = 明确降级**：节点标错误态 + 迁移提示（哪些参数/
  工具漂移），绝不静默。

### 5.3 运行时点与产出

- 载入时执行：纯函数 `migrateGraph(graph, registry) → { graph, report }`——
  宿主在 value 注入前显式调用（不进内核、不做隐式拦截）；
- `report`（迁移了什么/哪些漂移未解）即**设计时变更日志的天然数据源**——
  直接对接治理窗批次 4（集中验证面板 + 变更日志共用同一事件流）；
- 迁移只发生在编辑器文档域；执行端（zen-udf registry）契约不受影响。

### 5.4 边界

- **零 zen-udf 改动**：版本锚消费 `UdfPackMeta.version`（ADR-009 #1 已排定），
  绑定校验消费现有 parametersSchema；zen-udf 不承载可执行迁移（迁移函数是
  编辑器侧代码，JSON 载荷不可携带）；
- **deprecated ≠ 迁移**：弃用（A4）是显示语义；工具被迁移移除后，旧引用走
  明确降级（5.2 末条）。

## 6. 与 zen-udf 的关系（本设计零 zen-udf 改动）

- **核心机制零改动**：存在性跟随载荷 + tester 注册表 + 降级阶梯全部在 appshell；
  载荷的 namespace/tools 形状信息已足够 tester 校验；
- **origin 元数据 = 可选增强，非前置**：来源徽标与「按 origin 写体验层过滤」
  依赖 ADR-009 清单 #1/#2（`UdfPackMeta` + 信封/端点透传，zen-udf 0.9.0 候选，
  **归属 jdm-editor 仓**——ruling 12 单一源）。origin 未到位前本设计照常工作
  （存在性只看载荷）；到位后注册表与 catalogFilter 可叠加 origin 维度；
- **显示提示不进 UdfPackMeta**（实践 5 × ADR-009 最小化纪律）：图标/标题别名
  等渲染提示归客户端注册表携带。

## 7. 实施归属与阶段

| 项 | 归属 | 量级 | 触发 |
| --- | --- | --- | --- |
| ① 临时一致性措施：`useCustomNodes` 增 `disabledNamespaces?: string[]`，composeBaseNodes 按 namespace 排除 | seal-editor（appshell） | ~半天 | verdict Phase 0 先于本设计启用 http 域关闭 |
| ② 本设计（注册表 + tester + 三级降级 + 四 Tab 部分接管改造） | seal-editor（appshell，随轨道 B Phase 2） | 1–2 天 | 轨道 B 启动 |
| ③ 版本迁移器（§5：具名 seed + rebinder + 显式迁移链 + migrateGraph 工具与报告） | seal-editor（appshell，随轨道 B Phase 2，与 ② 同批） | +0.5–1 天 | 轨道 B 启动 |
| origin 徽标/透传 | zen-udf（jdm-editor）+ appshell | ADR-009 清单 #1/#2/#3 | 0.9.0 |

② 落地后 ① 的排除项作废删除。迁移器与注册表同批实施（注册表是迁移器的挂载点）。

## 8. 反模式

| 反模式 | 后果 |
| --- | --- |
| 专属节点静态注册（现状） | 服务端过滤后节点可见不可执行（本设计的动因） |
| tester 退化为按名匹配 | 服务端域形状演化后专属面板错配（实践 2/6） |
| 专属 Tab 整体自绘不嵌通用容器 | 通用能力升级需四处手动跟（实践 4） |
| 显示提示塞进 UdfPackMeta | 违反元数据最小化纪律，兼容性 surface 膨胀（ADR-009 注记） |
| 旧图节点随 namespace 关闭而消失 | 存量文档打开白块——必须走只读降级 |
| 位置绑定静默猜测重映射 | 错配不报错——错数据比报错危险（§5.1：对不上就标记缺失） |
| 无版本锚的图自动执行迁移链 | 猜测迁移 = 变相静默改写（§5.2：缺锚 validate-only） |
| 破坏性变更不上报迁移器、靠 rebinder 兜底 | 语义变更（非结构变更）rebinder 无能为力——域作者必须显式声明 |
