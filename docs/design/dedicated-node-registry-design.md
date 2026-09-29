# 专属节点 UI 注册表——schema 化渲染设计（节点去硬编码）

- 日期：2026-09-29
- 状态：**设计定稿待实施**（轨道 B Phase 2；上游缺口记录见 [ADR-010](../adr/010-function-catalog-tenant-filter.md) 确认段）
- 归属：appshell（useCustomNodes 流程）；内核零改动；zen-udf 核心零改动（origin 依赖为可选增强，见 §6）

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
};

// 内建四域注册（现 composeBaseNodes 的四项迁移至此，形状校验取代按名匹配）：
// http-request → HttpRequestTab；crypto → CryptoTab；
// current-date → CurrentDateTab；query-list → QueryListTab
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
| namespace 在载荷 + tester 不匹配 | **可创建**：通用容器（SchemaContainerTab） |
| namespace 不在载荷 | **不可创建**：面板/补全/REPL 均不出现 |
| 旧图已有节点 + namespace 已被关 | **只读渲染**：按 kind 降级为通用只读容器 + 运行期错误就地显示（不白块） |

实现要点：节点 kind 注册（renderNode）与面板可创建列表分离——前者按 kind 常驻
（覆盖旧图），后者严格跟随载荷。

## 4. 部分接管（实践 4）

四个专属 Tab 内未特化的区域（参数表、返回展示）内嵌通用容器渲染，专属部分只画
域特有交互（http 的请求构造/认证区、crypto 的编解码预览）。通用容器能力升级
（工具提示、弃用标记 A4）自动传导，消除四 Tab 的隐性维护税。

## 5. 与 zen-udf 的关系（本设计零 zen-udf 改动）

- **核心机制零改动**：存在性跟随载荷 + tester 注册表 + 降级阶梯全部在 appshell；
  载荷的 namespace/tools 形状信息已足够 tester 校验；
- **origin 元数据 = 可选增强，非前置**：来源徽标与「按 origin 写体验层过滤」
  依赖 ADR-009 清单 #1/#2（`UdfPackMeta` + 信封/端点透传，zen-udf 0.9.0 候选，
  **归属 jdm-editor 仓**——ruling 12 单一源）。origin 未到位前本设计照常工作
  （存在性只看载荷）；到位后注册表与 catalogFilter 可叠加 origin 维度；
- **显示提示不进 UdfPackMeta**（实践 5 × ADR-009 最小化纪律）：图标/标题别名
  等渲染提示归客户端注册表携带。

## 6. 实施归属与阶段

| 项 | 归属 | 量级 | 触发 |
| --- | --- | --- | --- |
| ① 临时一致性措施：`useCustomNodes` 增 `disabledNamespaces?: string[]`，composeBaseNodes 按 namespace 排除 | seal-editor（appshell） | ~半天 | verdict Phase 0 先于本设计启用 http 域关闭 |
| ② 本设计（注册表 + tester + 三级降级 + 四 Tab 部分接管改造） | seal-editor（appshell，随轨道 B Phase 2） | 1–2 天 | 轨道 B 启动 |
| origin 徽标/透传 | zen-udf（jdm-editor）+ appshell | ADR-009 清单 #1/#2/#3 | 0.9.0 |

② 落地后 ① 的排除项作废删除。

## 7. 反模式

| 反模式 | 后果 |
| --- | --- |
| 专属节点静态注册（现状） | 服务端过滤后节点可见不可执行（本设计的动因） |
| tester 退化为按名匹配 | 服务端域形状演化后专属面板错配（实践 2/6） |
| 专属 Tab 整体自绘不嵌通用容器 | 通用能力升级需四处手动跟（实践 4） |
| 显示提示塞进 UdfPackMeta | 违反元数据最小化纪律，兼容性 surface 膨胀（ADR-009 注记） |
| 旧图节点随 namespace 关闭而消失 | 存量文档打开白块——必须走只读降级 |
