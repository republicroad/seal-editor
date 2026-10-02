# ADR-015：自定义函数节点规范——定义、调用、入参/返回值标准化与编辑面兜底策略

## 状态
proposed（2026-10-02 seal-editor 起草——决策引擎与编辑器的**绝对重点面**规格。
定义侧多为 ADR-011 既有裁定的汇总确认；**调用侧为本 ADR 核心新增裁定提案**：
调用表达式从平坦位置数组迁移至具名字典。zen-udf 单一源与发布方在 jdm-editor 仓
（ruling 12），目标版本 zen-udf 0.14 候选。待 jdm 协商裁定：逐节标注接受/否决/
修改，更新本状态行）

## 0 · 定位（宿主宣言）

**自定义函数节点的兜底 UI 与特定函数加强 UI，是决策引擎和编辑器的绝对重点。**
函数节点是 UDF 生态在画布上的执行落点：定义规范（pack 侧契约）、调用规范（节点
content 格式）、入参/返回值标准化（类型契约）、编辑面策略（兜底永不白块 + 加强
UI 范式演进）四者构成同一条信任链——本 ADR 首次将其作为整体立法。

## 背景

### 历史格式三层并存（调用侧的问题陈述）

| 代 | 形态 | 说明 |
| --- | --- | --- |
| 早期 | `expressions[].value` = 表达式**字符串**（`roster('acme', 1)` 类） | 早期编辑器产物 |
| 派生 | `expr_asts[]` = 字符串**解析后结构** | 引擎/编辑器消费的解析形态 |
| 现行 | `value` = 操作符数组 `[funcName, arg1, arg2, ...]` | 编辑器直写数组后，**与 expr_asts 同构**——三键冗余从此为结构性重复 |

外加编辑器双写的 `arg_exprs`（具名镜像）。位置数组的**恶性盲区**：pack 在中间
插入参数 → 旧图后续位置参数**静默错位**（不报错、值错）——参数漂移带（ADR-013
批次三）在此形态下只能查尾缺，中插盲区显式归迁移链。

### 已有资产（本 ADR 站在其上）

ADR-011（parametersSchema 唯一规范表示 + defineTool + conformance fixtures）、
ADR-014（CONTRACT §10 夹具契约 + executor 反转）、参数漂移带（drift 模式第二次
复用）、migrateGraph 幸存名重绑定、[自定义节点编辑面规格](../design/custom-node-editor-spec.md)
（config 键主权表 + 圆往返保真核对）。

## 决策

### §1 · 定义规范（汇总确认，ADR-011 既有裁定的标准形）

```ts
type CustomFunctionDefinition = {
  name: string;                  // 调用名（scoped 档内唯一；namespace 立法见 ADR-009）
  namespace?: string;            // 所属 pack
  title?: string;
  description?: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'datetime';
      description?: string;
      default?: unknown;         // 漂移带「补缺失」的值来源
    }>;
    required?: string[];
  };
  returns?: JSONSchema;          // 返回值 schema（缺失 = any，见 §3-R3）
  semantics?: 'read' | 'act';    // UdfPackMeta 语义声明
  idempotent?: boolean;
  deprecated?: boolean;
};
```

- `parametersSchema` 是声明侧**唯一规范表示**（ADR-011），flat parameters 弃用
  维持；conformance fixtures 为定义合规验收口径；
- **类型枚举标准化（新增确认）**：`string | number | boolean | object | array |
  datetime` 六型——与 inputNode 字段定义、dt 列类型三处对齐，新类型需三处同步
  立法（datetime 以 `format: 'date-time'` 表达）；
- 返回值：`returns` schema 经 `normalizeFunctionReturns` 归一（缺失 = any），
  是 debug trace 类型推断与下游校验的依据。

### §2 · 调用规范（核心新增裁定提案：位置数组 → 具名字典）

**规范形（目标态存储）**：

```ts
type FunctionCallExpression = {
  id: string;
  key: string;                     // 输出绑定键
  type: 'function';
  call: {
    fn: string;                    // 函数调用名
    args: Record<string, unknown>; // 具名参数（键 = parameters.properties 键）
  };
};
```

1. **具名、顺序无关、schema 可校验**——中插参数静默错位类失败**根除**；
2. **双读兼容（长期）**：位置数组 `[funcName, arg1, ...]` 与早期字符串表达式
   在**读取/解析层**永久接受，按 `parameters.properties` 归一化为规范形
   （结构归一，值不造）——旧图存续零迁移压力；
3. **手写简写保留（创作层）**：表达式编辑器继续接受 `roster('acme', 1)` 位置
   语法，保存时归一化为规范形——平坦数组当初的手写便利动机由 parse 层继承，
   存储不再承担；
4. **`expr_asts` 退役**：规范形落地后 value 即结构化形态，`expr_asts`（同构
   镜像）写入停止、读取兼容保留——三键收敛为一，写路径简化为单漏斗；
5. **`arg_exprs` 随之退役**：`call.args` 即具名参数本体；
6. **漂移带升级**：位置盲区（中插检测）消除；重命名场景 = 未识别旧键 + 缺失
   新键成对出现，可提示按名映射（migrateGraph rebinder 同源语义）；
7. **弃用时间表**：位置数组写入随 seal 下一 minor 切换；字符串表达式弃用沿
   ADR-011 路径；读取兼容不设截止（旧图存续义务）。

### §3 · 入参与返回值标准化

- **入参校验具名化**：`validatePositionalArgs/funcBindParams` 的对应物升级为
  按名校验（missing/extra/type-mismatch 三类——与参数漂移带同构，编辑时孪生）；
- **缺参语义对齐**：编辑面（漂移带）= 默认填充；执行面 = `required` 声明的
  缺参为执行错误、非 required 走声明 default（两侧语义分层，开放问题 4）；
- **返回值标准**：`returns` schema 驱动 debug trace 类型推断、FixturesReport
  `actual` 的校验呈现、outputSchema 衔接；缺失 returns 的函数在标准化中合法
  （= any），漂移带不检返回侧；
- **指纹对称**：调用点漂移锚 = `parametersSchema` 指纹或 `__meta__.packVersion`
  （与 inputContract schemaFingerprint、ADR-013 评审发现 3 同构）。

### §4 · 编辑面策略（兜底 UI + 加强 UI = 绝对重点）

1. **三级降级阶梯（重申，永不白块）**：dedicated Tab → 兜底表格
   （CustomFunctionTable）→ 只读占位；
2. **兜底 UI 已落地**：参数漂移带（三类清单 + 补缺默认 + 圆往返保真）+
   config 键主权表（[custom-node-editor-spec.md](../design/custom-node-editor-spec.md)）+
   immer 局部变更（未知键保真核对 ✓）；
3. **加强 UI 范式候选（评估态，非本批裁定）**：
   - **Windmill 双模式**：schema 生成表单 ↔ 代码视图（inputNode Design/Code
     的函数版范式）；
   - **typed input 万能值输入**（Node-RED 模式，缺口 D）：一控件 + 类型切换
     （字面量/表达式/引用），值 = 类型 + 内容两元组——参数值三分类显式化的
     业界鼻祖，存储协议前置协调见编辑面规格 §5 + §4 业界参照表；
4. **部分接管**：专用 Tab 内嵌兜底容器补覆盖盲区（Unity DrawDefaultInspector
   同构）；显示提示中间层维持客户端 hints（ADR-009 meta-minimization 张力不碰）。

## 实施清单（分归属）

| # | 项 | 归属 | 量级 |
| --- | --- | --- | --- |
| 1 | 引擎双读（规范字典 + 位置/字符串兼容归一）+ args 按名校验 | jdm（zen-udf 0.14 候选） | ~1-1.5 天 |
| 2 | CONTRACT 调用形态节（规范形/兼容形/简写解析/弃用表） | jdm | ~0.25 天 |
| 3 | 写路径切规范字典（persistExpressions/buildDefaultFunctionExpression）+ expr_asts/arg_exprs 退役 + 漂移带全量按名检测 | seal kernel | ~1 天 |
| 4 | Windmill 双模式 + typed input 立项评估 | seal（另起设计文档） | 另批 |

## 开放问题（逐条协商）

1. **引擎具名调用现状**：ADR-011 的 `{$call, kwargs}` 是已实现还是目标态？
   决定 #1 是引擎改造还是纯格式裁定（seal 侧可先起步：写规范形 + 引擎双读前
   保持位置兼容由引擎现状吸收）；
2. **字典键名约定**：`{fn, args}` vs `{$call, kwargs}` 记法——建议对齐 zen-udf
   既有语汇；
3. **位置简写保留边界**：仅编辑器 parse 层（建议），还是引擎长期双读（本 ADR
   取后者——旧图存续义务）；
4. **required 缺参语义**：执行错误（建议）vs 默认填充——编辑面漂移带的填充
   是**创作辅助**，执行面 required 缺失仍应报错，两层不矛盾但需言明；
5. **返回值缺失的函数**：标准化中合法（= any）确认。

## 后果

- 正面：静默错位类失败根除；三键收敛单漏斗；漂移带全能力（按名缺/多/重命名）；
  与 ADR-011（声明）/ADR-014（测试）/本 ADR（调用+编辑面）构成完整函数规范族；
  手写便利由 parse 层继承零损失；
- 约束：破坏性存储格式变更（0.x 窗口 + 引擎双读长期兼容）；parse 层新增常驻
  职责（简写归一化）；两仓同步切换的时序协调；
- 定位重申：兜底 UI（永不白块/圆往返/漂移可见）与加强 UI（双模式/typed input）
  是决策引擎与编辑器的绝对重点——本 ADR 后续演进沿此轴。
