/**
 * 浏览器 stub：`@gorules/zen-engine`（napi，Node-only）被 appshell 的 fixtures
 * 适配器链（appshell → zen-udf 0.13.0 → zen-engine）静态引入——而 kernel
 * Storybook 同时构建 appshell 的 stories（main.ts stories 第 12 行），其打包图
 * 因此触及 napi 引擎（browser.js 还要解析未安装的 wasm32-wasi）。
 *
 * 浏览器零执行引擎是定位公理（ADR-014）：runner 纯逻辑不受影响，引擎侧唯一
 * 消费者 createZenExpressionEvaluator 在 stories 中从不调用。导出面 =
 * zen-udf 源码对该包的全部具名值导入，调用即抛错。
 *
 * 上游跟进：zen-udf 0.13.1 将求值器工厂移出纯 fixtures 模块后，与 playground
 * 的同款 stub 一并移除。
 */
export const ZenDecisionContent = class {};
export const ZenEngine = class {};
export const evaluateExpressionSync = () => {
  throw new Error('zen-engine is not available in the browser');
};
export const evaluateUnaryExpressionSync = () => {
  throw new Error('zen-engine is not available in the browser');
};
