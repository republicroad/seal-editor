# DAG 决策图编辑器·业界实践与最佳实践沉淀

- 日期：2026-10-25 起草
- 状态：**活档 · 知识沉淀**（本仓图编辑器演进的对照基线；缺口项按触发制/批次随需立项）
- 适用面：`packages/seal-editor` 决策图（React Flow + dagre + CM6/monaco）与决策表协同面
- 关联：[reui-optimization-backlog.md](./reui-optimization-backlog.md)（触发制清单）、
  [two-point-oh-inventory.md](./two-point-oh-inventory.md)（2.0 破坏性面）、
  [dt-instant-eval-badge.md](./archive/plans/dt-instant-eval-badge.md)（A3 即时求值）

## 1 · 产品谱系（按域，各取所长的对象）

| 域 | 代表产品 | 对本仓的借鉴点 |
| --- | --- | --- |
| 规则/决策（BRMS/DMN） | Camunda DMN、Trisotech DMN、Sparkling Logic SMARTS、OpenL Tablets、InRule、Decisions.net | 决策表+DRD 图双形态、注解列一等公民、FEEL 式表达式编辑、规则冲突/重叠分析、治理（版本/审批） |
| 工作流编排 | n8n、Node-RED、Dagster、Airflow、Argo | 执行数据内联回显（pinned data）、单步测试、拉线悬空释放弹搜索、DAG 网格视图 |
| 通用节点图（专业 DCC） | Blender 几何节点、Unreal Blueprint、Houdini、ComfyUI | 注释框/分组框、reroute 绕行点、子流程封装、类别着色、类型端口、拖线释放搜索 |
| AI/Agent 编排 | Dify、LangFlow、Flowise | 节点内参数面板、运行快照对比、对话式建流（观察项） |
| ML 管道 | Kubeflow Pipelines、Metaflow、W&B | 执行态为王：节点级耗时/产物/重试/缓存标记 |

## 2 · 交互实践九域清单（对照本仓）

| # | 域 | 业界实践 | 本仓状态 |
| --- | --- | --- | --- |
| 1 | 画布导航 | 滚轮缩放至光标点、minimap、fit-view、视口持久化、键盘居中选中节点 | ✅ 全有（React Flow 内建 + 视口会话恢复） |
| 2 | 节点创建 | 面板拖入、边"+"插入、拖线悬空释放→搜索菜单、双击空白快捷创建 | ✅ 前二；**拖线释放搜索=缺口**（§5） |
| 3 | 连线管理 | 边选中删除、端点拖拽重连、悬停高亮联动、**类型不匹配阻断/警示** | ✅ 前三；类型阻断=缺口（§5，等真实类型冲突反馈） |
| 4 | 节点语义 | 类型着色、内联摘要、端口命名/必填标注、compact 模式 | ✅ 全有（kind 色/compact/端口标注） |
| 5 | 执行与调试 | 节点角标成功/失败/耗时、失败聚焦+错误面板、运行历史、连线数据探针 | ✅ 基本全有（simulator trace/Runs 面板/表头 reference 值；连线探针=近亲形态） |
| 6 | 可读性工程 | 自动布局（dagre/ELK）、对齐/吸附、画布锁、**注释框/分组框**、**reroute 绕行点**、**子流程封装** | ✅ 前三（dagre+对齐+锁）；**后三=缺口**（§5） |
| 7 | 协作与持久化 | 自动保存+脏徽标、auto-persist、版本历史、实时多人协作 | ✅ 前三（ADR-008/auto-persist/appshell version-history）；多人协作=企业级触发制 |
| 8 | 表达式工程 | monaco/CM6 + lint + 补全、fail-visible 降级 | ✅ 全有（CM6 `$` 诊断、静默降级 RFC） |
| 9 | 治理 | 决策版本化、审批流、锁与权限 | ✅ 版本化/权限（viewConfig permissions）；审批流=触发制 |

## 3 · 规则编辑特有最佳实践（八条铁律）

1. **多形态同源**：决策表/表达式/规则流是同一语义的多形态，可切换不可分叉（DMN 核心信条）。本仓：switch 节点/表达式节点/决策表 ✓。
2. **所见即所测**：仿真与生产**同一引擎**执行，模拟结果才有权威性。本仓：simulateHandler 单源裁定 ✓（n8n 测试数据 pin 同精神）。
3. **测试内联**：夹具与规则同源同库，Run all 即回归。本仓：fixtures ✓——此实践在规则编辑器里属领先形态（多数 BRMS 需外挂测试工程）。
4. **命中可视化**：决策表必须能回答"这行命中了吗/哪行是死行"。本仓：A3 行级徽章+死行检测 ✓——已达 DMN 工具第一梯队（Trisotech/Camunda 均为逐步补齐的形态）。
5. **类型契约前置**：连线兼容 = 数据类型兼容，不匹配在**连线时**即阻断或警示，不留到运行时。本仓：端口有类型语义，连线时阻断=缺口（§5，等真实类型冲突反馈驱动）。
6. **冲突/重叠检测**：规则条件重叠或矛盾时预警（Corticon/Sparkling Logic 的高级能力，需规则语义分析）。本仓：恒值比较哨兵（E）是起步形态；完整冲突分析=触发制。
7. **注释与元数据一等公民**：注解列、节点备注、分组框是治理资产而非装饰。本仓：dt Description 注解列 ✓（auto-fit）；图级注释框 ✓（e00d8623，annotations 随图持久化）。
8. **纯度纪律（外部状态治理）**：自定义函数只做 I/O——取外部数据或向外发送信息；**所有多维度判定尽可能放决策表**（判定=输入的纯函数，副作用外推编排层）。纯度是回归断言的前提：外部状态 UDF 破坏值幂等，故 Run all 分层断言——设了期望的用例断言图输出（deep/path/expression 三模式，CONTRACT §10 serializable 子集），未设期望仅冒烟（执行无异常即过）；捕获范式设期望（Run 报告一键 pin），时序敏感算子走 asOf 钉扎、外部调用走 journal 回放（zen-udf DecisionFixture 既有槽位，ADR-014/021）。

## 4 · 本仓已完成批次索引（本沉淀的实证来源）

- 执行内联回显全链：run strip/执行链路着色渐停/边数据探针/条件级求值点标（reference_map+wasm 逐格布尔+tooltip）
- 输入契约用例集：单源派生（example-sources.ts）/存为新用例（simulator 捕获范式）/逐项改名/Schema 骨架生成
- Run all 分层断言：期望 deep/path/expression（CONTRACT §10 serializable）+ 冒烟语义分家 + 报告 pin/clear（纯度纪律铁律 8）

- ⌘K 全家：调色板一期修复/二期导航/补完检索（f654fb77 前后）
- dt 命中诊断三维：列计数（D2）/行徽章（A3）/死行（A1）
- 画布控制：画布锁/吸附开关/对齐网格（B1/B2，flow-1 形态参照）
- 参考面宿主注入：functionLibraries（ADR-024）
- 浮层治理：Positioner z-50 统一层级 + Portal container（z 阶梯裁定，见 memory）
- Map Excel 导入体验系列：Tab 组合/行内样例值/颜色语义（完成度着色）/表格美化/Description auto-fit

## 5 · 缺口与立项建议（按优先级）

| 缺口 | 价值 | 量级 | 建议 |
| --- | --- | --- | --- |
| ~~注释框/分组框~~ | 已落地（e00d8623：annotations 随图持久化 + 便签节点 + 变更路由 + 工具栏按钮） | — | ✓ |
| 拖线悬空释放→节点搜索菜单 | 与既有"边+插入"互补的第二建节点路径（n8n/ComfyUI 标配；复用 ⌘K 搜索组件） | ~0.5 天 | 可与上条一并立项 |
| reroute 绕行点 | 长边绕行可读性（React Flow 无内建，需自实现小节点） | ~0.5 天 | 低优先，随注释框批次顺评 |
| 连线类型阻断 | 类型契约前置（§3.5） | ~0.5 天 | 等真实类型冲突反馈驱动 |
| 子流程封装（subflow/折叠） | 大图治理（与"多标签"触发项近亲） | 大 | 维持触发制 |
| 规则冲突/重叠检测 | 高级 BRMS 能力（需规则语义分析引擎） | 大 | 维持触发制（恒值哨兵已起步） |
| ELK 布局替代 dagre | 层级布局质量更高（正交边/端口约束） | 中 | dagre 够用则不动 |
| 实时多人协作 | 企业级（Yjs/CRDT） | 大 | 触发制（多标签近亲） |

## 6 · 收敛纪律

- 本档为**对照基线**而非承诺清单：缺口项进入实施必须回答「哪个宿主/哪条信号需要它」（收敛期纪律，防无需求自嗨）；
- 唯一例外：**图可读性工程批次**（注释框+拖线释放搜索）已具备明确用户价值（本会话 Map Excel 系列同模式：实测驱动）；
- 2.0 破坏性面见 [two-point-oh-inventory.md](./two-point-oh-inventory.md)；触发制全清单见
  [reui-optimization-backlog.md](./reui-optimization-backlog.md)。
