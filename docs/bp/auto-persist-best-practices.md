# BP-10：自动持久化演进与模式 D 最佳实践——从脏标记到连续持久化

## 适用场景

编辑器/创作工具的保存机制选型与实现：从手动保存演进到自动保存、再到
「连续持久化」（无 dirty 概念，同步状态 + 版本治理）。本文记录业界演进阶梯、
seal-appshell 1.9.0 落地 AutoPersistController 时核定的工程实践，可迁移到任何
「文档型编辑面 + 宿主式存储」的产品。

## 核心模型一：dirty 判定的业界演进（五模式阶梯）

| 模式 | 机制 | 代表 | 致命伤 |
| --- | --- | --- | --- |
| A 基线快照 | 保存时快照，dirty = 当前 ≠ 基线 | 经典文档编辑器 | 深比较开销；快照口径必须稳定 |
| B 变更标志 | 任何 mutation 置 flag，保存清 flag | 表单库、朴素 autosave | **undo 回基线不清 flag**（撤销栈不感知标志） |
| C 撤销栈保存标记 | dirty = 撤销栈中有无保存点 | VS Code | 依赖单一变更通路；宿主式存储（外部改文档）即失效 |
| **D 同步状态** | 无 dirty 概念：saving/saved/conflict/error | Figma/Google Docs/Notion/IBM ODM Decision Center | 需版本治理托底（auto/命名/钉住版本）；并发编辑需要三选 UX |
| E 宿主所有 | 内核只发变更信号，dirty/保存全归宿主 | 组件化编辑内核（seal-editor 现状） | 宿主要自己写 B/D |

**判别测试**：undo 回到基线后 dirty 是否清除——A/C 通过，B 失败。
**演进关系**：E（内核无 dirty）+ 宿主选 D（连续持久化）= seal-editor 的终态组合；
C 与 D 不兼容（撤销栈保存标记依赖单一变更通路，宿主式存储不合——VS Code 自身
的 hot exit/backup 是另一层：丢弃型本地工作集恢复，与 D 可组合而非互斥）。

## 核心模型二：持久化基建的业界演进

| 维度 | 早期做法 | 当前最佳实践 |
| --- | --- | --- |
| 保存节奏 | 纯 debounce | **debounce + maxWait 兜底**（纯防抖饿死连续编辑流；静默 2s + 上限 15s） |
| 冗余保存 | 无（首个 tick 必打一轮） | **no-op 跳过**：与已同步基线快照对比（键序无关序列化）；顺带吞掉受控回写/加载的 onChange 回声 |
| 并发 | 无锁/最后写入胜（LWW） | **乐观锁 OCC**（版本/ETag → 409）+ **三选 UX**；静默 LWW = 丢数据，业界公认反模式 |
| 冲突自动消解 | — | CRDT/OT（Yjs/Automerge、Google Docs OT）——**另一个产品量级**，治理型平台（版本树 + 三选）不进入 |
| 失败处理 | 即时失败或无脑重试 | **退避 + 抖动仅限瞬时错误**（网络/5xx）；4xx 语义错误（FORBIDDEN/NOT_FOUND）与 CONFLICT 永不重试 |
| 退出冲刷 | `unload`/`beforeunload` 存数据 | **`pagehide` + `visibilitychange(hidden)` + `fetch keepalive:true`**（unload 事件 Chrome 已弃用；sendBeacon 破坏 CORS 契约）；IndexedDB 写天然存活 |
| 关闭拦截 | 未保存即拦截 | 模式 D 仅 inflight/pending 时提示（「未保存」概念消失） |
| 多标签 | localStorage 事件（无互斥） | **Web Locks 首领选举 + BroadcastChannel**（单保存者 + 状态广播）；乐观锁天然兜底双 tab 并发 |
| 崩溃兜底 | 无 | IndexedDB 本地草稿（VS Code backup 谱系；丢弃型、不进版本树、恢复后作为未同步草稿重放）——与 D 分层组合 |
| 可观测 | 无 | 遥测钩子：保存延迟/失败率/冲突率（saved/conflict/error/retry 事件 + 耗时） |

## 铁律

1. **先选模式再写代码**：B 模式的 undo-基线缺陷是结构性的（补丁救不了）；
   要么 A（基线对比），要么直接 D（同步状态）——D 的成立前提是**版本治理**
   （保存溶解为版本：auto 条目 + 命名版本 + 钉住豁免保留策略）；
2. **保存轮 = 基线对比 + 单 inflight + 尾随合并**：防抖窗口内的多次变更合并
   一轮；保存中到达的变更标记 pending，完成后立即合并为下一轮；baseRevision
   恒带当前 head——CONFLICT 即并发信号；
3. **CONFLICT 停轮不自动重试**：状态置 conflict 后停止自动轮，等宿主三选
   （覆盖=无 baseRevision 强写 head / 加载 head=宿主 load 重入 / 另存副本=新 id
   + 命名版本并切换编辑目标）；内容合并与三选 UI 归宿主，机制只提供检测与入口；
4. **重试策略按错误类别分流**：非持久化错误（网络/5xx）指数退避 + 抖动、
   有限次数；持久化语义错误（FORBIDDEN/NOT_FOUND）重试无意义；CONFLICT 见 3；
5. **基线口径必须稳定**：键序无关的稳定序列化做快照对比；文档注入（load/
   restore/adopt）必须重置基线与乐观锁——受控回写的 onChange 回声由基线吞掉，
   否则每次打开文档产生一个冗余版本条目；
6. **退出冲刷走存活传输**：pagehide/visibilitychange 监听 + fetch keepalive
   选项贯穿到传输层（axios 无 keepalive，save 调用需 fetch 实现）；
7. **状态面只讲同步不讲脏**：Saving…/Saved(时间)/Conflict/Error+重试；
   idle 与 pending（防抖窗口内）保持静默——连续编辑时不打扰是业界共识；
8. **版本治理元数据随行**：自动保存条目打 auto 标记走保留策略；每 N 轮升级
   命名版本（namespace 描述能力不描述批次）；钉住豁免清理；遥测事件伴随每轮。

## 测试要点

- 状态机用 fake timers 全覆盖：防抖合并 / maxWait 兜底 / no-op 跳过（含键序
  无关与回声）/ 单 inflight 排队 / CONFLICT 停轮后变更被忽略 / 重试分流 /
  命名版本节奏 / destroy 后静默；
- **放宽时间预算**：`advanceTimersByTimeAsync` 用 500ms/5000ms 而非 0/100ms——
  保存轮完成回调与后续排队的微任务交错是真实竞态；
- 失败轮不得推进命名版本计数（节奏按成功轮计）；
- 回声场景必测：adopt 注入后同内容 onChange 不产生保存轮；
- keepalive 选项逐层透传断言（controller → adapter → fetch init）。

## 参考实例

- 控制器 + hook：`packages/appshell/src/shell/auto-persist.ts`
  （createAutoPersistController / useAutoPersist，六态状态机）
- 注入面：`SkinnedDecisionGraph` `autoPersist` prop（emitted/adopted 双指纹
  区分自身变更与外部注入；宿主优先注入默认同步徽标）
- 徽标：`packages/appshell/src/components/sync-status-badge.tsx`（纯 props）
- 存活传输：`packages/appshell/src/shell/graphs-http-adapter.ts`（save 走 fetch
  keepalive；409/CONFLICT → GraphPersistenceError）
- 契约文档：`docs/design/save-persistence-contract.md`（宿主对接 v1）、
  `docs/design/appshell-auto-persist.md` §6（实施记录 + 业界对齐）
- 端口契约：`packages/appshell/src/shell/persistence.ts`（baseRevision 乐观锁、
  auto/versionName/pinned 治理元数据、listVersions）

## 反模式

| 反模式 | 后果 |
| --- | --- |
| B 模式脏标志 + 宿主式存储 | undo 回基线不清脏（结构性缺陷） |
| 纯 debounce 无 maxWait | 连续编辑流永不落盘，崩溃即全丢 |
| 无基线对比 | 每次打开文档打一轮冗余保存 → 版本条目爆炸 |
| CONFLICT 自动重试/静默 LWW | 覆盖他人编辑；业界公认丢数据反模式 |
| 对 FORBIDDEN/NOT_FOUND 退避重试 | 无意义流量 + 延迟暴露错误 |
| unload/beforeunload 存数据 | 事件已弃用、不可靠；sendBeacon 破坏 CORS |
| 每来源一个 registry/runtime 做隔离 | 缓存碎片化、发布 N 倍、内存 N 倍（ADR-008 L7 反模式） |
| 内核做 dirty/保存按钮 | 模式裁决：变更信号归内核、持久化归宿主（ADR-008 L2） |
