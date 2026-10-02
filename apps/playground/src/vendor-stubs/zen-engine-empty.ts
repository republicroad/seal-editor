/**
 * 浏览器 stub：`@gorules/zen-engine`（napi，Node-only）被 zen-udf 的 fixtures
 * 模块静态引用，但浏览器侧唯一消费者是 createZenExpressionEvaluator——
 * 本应用从不调用（ADR-014 定位公理：浏览器零执行引擎，Run all 经宿主
 * simulateHandler 服务端执行）。runner 纯逻辑不受影响。
 *
 * 导出面 = zen-udf 源码对该包的全部具名值导入（engine.ts / register.ts 等），
 * 任何调用在本应用都是死代码——stub 仅满足打包期静态解析。
 *
 * 上游跟进：zen-udf 0.13.1 将求值器工厂移出纯 fixtures 模块后移除本 stub。
 */
export const ZenDecisionContent = class {};
export const ZenEngine = class {};
export const evaluateExpressionSync = () => {
  throw new Error('zen-engine is not available in the browser');
};
export const evaluateUnaryExpressionSync = () => {
  throw new Error('zen-engine is not available in the browser');
};
