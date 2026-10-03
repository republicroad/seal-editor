import type { CustomNodeNamespace } from '../lib/custom-node-types';

/**
 * 兜底 tab 函数作用域的缺省派生（SkinnedDecisionGraph 接线）：
 * 宿主显式 customFunctions 优先（宿主优先原则，与 headerSlots 一致）；
 * 未传时取 EditorShellProvider 的 schema（命名空间 {name, tools} 直通 kernel
 * resolveFunctionScope）——Provider 场景零接线；无 Provider 行为不变。
 */
export const resolveShellCustomFunctions = (
  propValue: unknown,
  shellSchema: CustomNodeNamespace[] | null | undefined,
): unknown => propValue ?? (Array.isArray(shellSchema) && shellSchema.length > 0 ? shellSchema : undefined);
