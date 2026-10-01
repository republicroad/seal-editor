# InputContract 数据形状与序列化规范（ADR-013 清单 #0 · 输入侧契约立法）

- 状态：**立法（legislative）**——实施清单 #0 产物；分享格式是跨仓交换物，先立法后实施
  （ADR-011 契约先行同纪律）
- 上位决策：[ADR-013 输入节点契约统一](../adr/013-input-contract-design.md)
- 对齐：jdm-editor 仓 CONTRACT.md §8 版本纪律（本文档为输入侧对应物，条件成熟时
  可并入 CONTRACT.md 输入侧一节）
- 实施批次：批次一已落码（未发版，随批次二/三合版——§7 勘误修正）+ 批次二
  已落（ajv 懒加载约束校验 + 信封导入/导出 + >20 软折叠）；Run all 复用
  runDecisionTests（批次三）后续落地

## 1 · 数据形状

```ts
type InputContract = {
  contractVersion: number;          // 当前 = 1
  schema: JSONSchema;               // 唯一结构事实源（draft 2020-12 目标，见 ADR-013 OQ1）
  examples: NamedExample[];
};

type NamedExample = {
  id: string;                       // 稳定 UUID
  name: string;
  description?: string;
  data: Record<string, unknown>;    // 完整输入实例——simulator 直接消费
  schemaFingerprint?: string;       // 上次确认合法时的 schema 指纹
};
```

三条根基决策（jdm 评审「修改后接受」）：schema 用标准 JSON Schema 不自造 DSL；
example.data 是完整实例（非 `;;` 位置绑定）；schemaFingerprint 是漂移检测锚。

### schema 投影纪律

契约的 `schema` **不含**内嵌 `examples` / `x-examples-meta`——这两键是 legacy
存储形态的产物。凡写入契约的 schema 文本（Schema 页签原文、JSON→Schema 转换、
粘贴 legacy 形态）一律先剥离：结构进 `schema`，内嵌 examples 按序并入
`examples`（保留既有 id / 名称补齐）。

## 2 · 序列化信封（分享格式）

```json
{
  "contractVersion": 1,
  "schema": { "type": "object", "properties": { ... } },
  "examples": [
    { "id": "…", "name": "正常GOLD用户", "data": { "customer": { "tier": "GOLD" } } }
  ]
}
```

- `contractVersion` 必填——对齐 CONTRACT §8 版本纪律：分享格式无版本号则未来
  格式演进无升级锚点；
- 信封 = `content.inputContract` 的同构投影；**导入 = 采用信封整体**（schema +
  examples 一并替换当前契约；id 缺失/与既有契约冲突时由导入方重铸；
  contractVersion 高于支持版本拒收——向前兼容报版本错误而非静默丢数据）；
- 导出**不携带** `schemaFingerprint`：指纹锚是接收方自己的校验时点，导入后
  重新戳记；
- 演进规则：additive 为 soft（同版本兼容）；breaking（删字段/改语义）必须 bump
  `contractVersion` 并提供迁移注记。

## 3 · 存储纪律（图 interchange 硬约束）

同一张图会被两仓 kernel、新旧版本、playground/demo-server 打开——存储 **MUST
additive**：

1. **规范形态**：`content.inputContract = {contractVersion, schema, examples}`；
2. **legacy 镜像（双写）**：每次写契约同步重生成旧字段（`content.schema` /
   `content.schemaUI`，examples + x-examples-meta 内嵌，经
   `updateRequestSchemaExamples`）——旧版本 kernel / jdm-editor 读镜像不丢数据；
3. **读取优先级**：`content.inputContract` 优先，缺失时 legacy 投影（内嵌
   examples 剥出、`schema-example-${i}` 合成 id、无指纹锚）；
4. **首次编辑迁移写入**：legacy 图第一次经契约写路径落盘时生成
   `inputContract`，只读浏览不写；
5. **模型声明**：`inputNodeSchema.content.inputContract` 必须在 zod schema 显式
   声明——safeParse 会剥掉未声明键（edgeSchema.name 同类事故），
   parse-fidelity fixture 同步覆盖；
6. **单写漏斗纪律（批次一验收补丁，2026-10-01）**：新增写路径（信封导入等）
   **MUST 经 `writeRequestInputContract`**——双写完备性靠此约定维持，绕行即
   产生陈旧镜像或失真契约。

## 4 · 漂移协议（ADR-013 §2 评审简化口径）

- **指纹**：`canonical stringify(schema)（键排序递归）→ FNV-1a 双通道 16 hex`。
  仅作相等性锚点，非密码学散列——规避 crypto.subtle 安全上下文约束（ADR-007）；
  与 pack 侧版本钉扎（journal 记 pack version）构成信任链两端同构（评审补充
  发现 3），verdict 侧将来复用同一纪律；
- **报告**：逐 example 重校验 + **missing / extra / type-mismatch 三类清单**，
  不做全量 JSON Schema structural diff（评审 §2 裁定）；
- **徽标判据**：`example.schemaFingerprint !== 当前 schema 指纹`（含未锚定的
  legacy 示例）；
- **安全迁移**：缺值按定义默认值（无默认按类型零值）补齐 + 多余字段移除 +
  datetime 归一化；**类型冲突值原样保留**（不安全漂移——用户逐个决策）；
- **戳记规则**：任何契约持久化时，重算每 example 漂移——干净的戳当前指纹；
  有漂移的保留原锚；「确认有效」= 干净示例补戳；「迁移」= 应用安全迁移后再算。

## 5 · 实施形态注记（与 ADR-013 §1 的偏差声明）

ADR §1 写的是「zustand store 作为第四个同构成员」；本仓实施为**契约模块
（helpers/request-schema/contract.ts）+ 单写漏斗**：读/写/指纹/漂移/迁移全部
收敛在一个模块，三个编辑 hook 与模拟器持久化路径统一经它读写，content 仍是
共享事实源。偏差理由：三 hook 持有的是纯会话草稿（防抖/脏标），非跨面板共享
态；字面 zustand 化是机械重构，待 jdm 实施评审裁定后再做。jdm 评审对 §1 的
接受点（标准 JSON Schema / 完整实例 / 指纹锚三条根基决策）不受影响。

## 6 · 批次路线

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| 一 | 数据形状 + 双写存储 + 指纹 + 漂移引擎 + 徽标/迁移/确认 UI + 本立法文档 | ✅ 本批（已验收，见 §7） |
| 二 | ajv（懒加载）约束级校验（required/min/max/enum/pattern）+ 信封导入/导出 + >20 软提醒；**新增写路径 MUST 经 writeRequestInputContract**（见 §3-6） | ✅ 本批（ajv 外置 + 主入口预算校准 202→206kB gzip；导入整体采用语义见 §2） |
| 三 | Run all 复用 zen-udf `runDecisionTests`（DecisionFixture[] → FixtureReport）+ appshell 变更日志对接 | 待排 |

## 7 · 批次一验收记录（jdm-editor 仓，2026-10-01）

**结论：批次一验收通过**（324668f + 48c8aab + c74f6e6 代码级核查）。

- **评审五点全部落地**：改号 ADR-013、contractVersion 信封、漂移三类清单
  （未做 structural diff）、zod 显式声明 + parse-fidelity fixture（safeParse
  剥键陷阱预防）、schema 投影纪律（legacy 读与 schema 文本并入双路剥离
  examples/x-examples-meta）；
- **跨仓 interchange 实证**：jdm-editor 读取面为 `content.schema/schemaUI`
  （use-request-schema-editing.ts:27）——与双写镜像逐字段对上，旧读者兼容
  成立；契约读取优先级/首编辑迁移/只读不写均按 spec §3 实现；
- **§5 偏差（契约模块替代 zustand store）——裁定接受**：§1 的本质要求是
  「唯一事实源 + 单一写路径」，契约模块+单写漏斗完整交付且纯函数形态更好测
  （12 例单测）；zustand 的前提是跨面板响应式共享态，当前 content 本身即共享
  事实源、三 hook 持有会话草稿，前提不成立。字面 zustand 化**不作义务**，
  留作未来需要响应式跨面板订阅时的机械重构选项；
- **一条纪律补丁**：单写漏斗的完备性靠约定维持——**新增写路径（批次二信封
  导入等）MUST 经 `writeRequestInputContract`**，建议随批次二在本文档显式
  立此条；
- **一处文档勘误**：本档头部「本仓 kernel 1.16.0 已落」与 package.json
  1.15.0 不符——批次一未发版，表述应为「已落码、未发版，随批次二/三合版」，
  随下次提交修正。
