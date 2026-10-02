import { smartSplit } from './utility';

/** 局部 record 守卫（与 request-schema/utils.isRecord 同义；helper 顶层不引子目录模块） */
const isRecord = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const emptyCustomFunctionReturnSchema = {};

export const normalizeFunctionReturns = (returns?: any) => {
  if (!returns || typeof returns !== 'object' || Array.isArray(returns)) {
    return emptyCustomFunctionReturnSchema;
  }

  return returns;
};

export const normalizeFunctionDefinition = (func: any, namespace?: string) => ({
  ...func,
  namespace: func?.namespace ?? namespace,
  returns: normalizeFunctionReturns(func?.returns),
});

export const normalizeCustomFunctions = (customFunctions?: any): any[] => {
  if (!Array.isArray(customFunctions)) {
    return [];
  }

  return customFunctions.flatMap((item: any) => {
    if (Array.isArray(item?.tools)) {
      return item.tools.map((tool: any) => normalizeFunctionDefinition(tool, item?.name));
    }

    return item?.name ? [normalizeFunctionDefinition(item)] : [];
  });
};

export const getFunctionReturnSchema = (funcmeta?: any) => normalizeFunctionReturns(funcmeta?.returns);

export const isFunctionExpressionValue = (value: unknown): value is string | string[] =>
  Array.isArray(value) || (typeof value === 'string' && value.includes(';;'));

export const isFunctionExpression = (expression?: { type?: string; value?: unknown } | null) =>
  expression?.type === 'function' || isFunctionExpressionValue(expression?.value);

export const getFunctionNameFromValue = (value?: unknown): string | null => {
  if (Array.isArray(value)) {
    const functionName = value[0]?.trim();
    return functionName ? functionName : null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const [functionName] = smartSplit(value);
  const trimmedFunctionName = functionName?.trim();

  return trimmedFunctionName ? trimmedFunctionName : null;
};

export const findCustomFunctionDefinition = (customFunctions: any[], functionName?: string | null) => {
  if (!functionName) {
    return undefined;
  }

  return customFunctions.find((func: any) => func?.name === functionName);
};

export const LEGACY_CUSTOM_FUNCTION_KIND = 'UDF';

export type FunctionScopeMode = 'scoped' | 'legacy' | 'free';

export type FunctionScope = {
  mode: FunctionScopeMode;
  functions: any[];
};

/**
 * kind 约定（单 token）：'UDF' → legacy(自由全函数)；namespace 名(集合容器节点) → scoped；其余 → free(现状行为)。
 * schema 函数一律落在 ns 容器内，不存在独立的函数名 kind。
 */
export const resolveFunctionScope = (kind?: string | null, customFunctions?: any): FunctionScope => {
  const namespaces = Array.isArray(customFunctions) ? customFunctions.filter(Boolean) : [];
  const allFunctions = normalizeCustomFunctions(namespaces);

  if (!kind) {
    return { mode: 'free', functions: allFunctions };
  }

  if (kind === LEGACY_CUSTOM_FUNCTION_KIND) {
    return { mode: 'legacy', functions: allFunctions };
  }

  const namespaceContainer = namespaces.find((ns: any) => ns?.name === kind);
  if (namespaceContainer) {
    return { mode: 'scoped', functions: normalizeCustomFunctions([namespaceContainer]) };
  }

  return { mode: 'free', functions: allFunctions };
};

export const buildDefaultFunctionExpression = (funcDef: any) => {
  const properties = funcDef?.parameters?.properties ?? {};
  const argExprs: Record<string, string> = {};
  const args = Object.keys(properties).map((argName: string) => {
    argExprs[argName] = properties[argName]?.default ?? '';
    return argExprs[argName];
  });

  return {
    type: 'function' as const,
    value: [funcDef?.name ?? '', ...args],
    funcmeta: funcDef,
    arg_exprs: argExprs,
    returnSchema: getFunctionReturnSchema(funcDef),
  };
};

/**
 * 打开节点时治愈函数作用域漂移：scoped 档 value[0] 不在集合内时重置为首函数；legacy/free 不治愈。
 * 返回 null 表示无需治愈。
 */
export const healExpressionsForScope = (expressions: any, scope?: FunctionScope): any[] | null => {
  if (!scope || scope.mode !== 'scoped' || !Array.isArray(expressions)) {
    return null;
  }

  const [primaryFunction] = scope.functions;
  if (!primaryFunction?.name) {
    return null;
  }

  const allowed = scope.functions.map((func: any) => func?.name).filter(Boolean);

  let changed = false;
  const healed = expressions.map((expression: any) => {
    if (!isFunctionExpression(expression)) {
      return expression;
    }

    const functionName = getFunctionNameFromValue(expression.value);
    if (!functionName || allowed.includes(functionName)) {
      return expression;
    }

    changed = true;
    return { ...expression, ...buildDefaultFunctionExpression(primaryFunction) };
  });

  return changed ? healed : null;
};

/**
 * 函数参数级漂移（兜底 tab 漂移带，分屏范式 drift 模式的第二次复用）：
 * 行的函数调用 args vs 该函数现行 parameters.properties 声明——
 * 缺参（声明有、行未传）与未识别键（行有、声明无）。
 * 仅 scoped 档评估（free/legacy 无单一契约可对照）。
 */
export type FunctionArgsDriftEntry = {
  rowId: string;
  rowKey: string;
  functionName: string;
  /** 函数已声明但本行未传的参数（附声明默认值） */
  missing: Array<{ name: string; default?: unknown }>;
  /** 本行携带但函数未声明的具名键 */
  unrecognized: string[];
};

const getScopeFunction = (scope: FunctionScope | undefined, functionName: string | null) => {
  if (!scope || scope.mode !== 'scoped' || !functionName) {
    return undefined;
  }

  return scope.functions.find((func: any) => func?.name === functionName);
};

export const computeFunctionArgsDrift = (expressions: any, scope?: FunctionScope): FunctionArgsDriftEntry[] => {
  if (!scope || scope.mode !== 'scoped' || !Array.isArray(expressions)) {
    return [];
  }

  const entries: FunctionArgsDriftEntry[] = [];

  expressions.forEach((expression: any) => {
    // 规范形（ADR-015 §2）：value = {$call, kwargs}——直接按 kwargs 键对比
    if (isRecord(expression.value) && typeof expression.value.$call === 'string') {
      const funcDef = getScopeFunction(scope, expression.value.$call);
      if (!funcDef) {
        return;
      }

      const properties = isRecord(funcDef.parameters) ? (funcDef.parameters.properties ?? {}) : {};
      const declared = Object.keys(properties);
      const kwargs = isRecord(expression.value.kwargs) ? expression.value.kwargs : {};
      const missing = declared
        .filter((name) => !(name in kwargs))
        .map((name) => ({ name, default: properties[name]?.default }));
      const unrecognized = Object.keys(kwargs).filter((name) => !declared.includes(name) && name !== '$positional');

      if (missing.length > 0 || unrecognized.length > 0) {
        entries.push({
          rowId: expression.id,
          rowKey: expression.key ?? '',
          functionName: expression.value.$call,
          missing,
          unrecognized,
        });
      }

      return;
    }

    if (!isFunctionExpression(expression)) {
      return;
    }

    const functionName = getFunctionNameFromValue(expression.value);
    if (!functionName) {
      return;
    }

    const funcDef = getScopeFunction(scope, functionName);
    if (!funcDef) {
      return;
    }

    const properties = isRecord(funcDef.parameters) ? (funcDef.parameters.properties ?? {}) : {};
    const declared = Object.keys(properties);
    const argExprs = isRecord(expression.arg_exprs) ? expression.arg_exprs : null;
    const positionalArgs = Array.isArray(expression.value) ? expression.value.slice(1) : [];

    if (argExprs) {
      const namedKeys = Object.keys(argExprs);
      const missing = declared
        .filter((name) => !namedKeys.includes(name))
        .map((name) => ({ name, default: properties[name]?.default }));
      const unrecognized = namedKeys.filter((name) => !declared.includes(name));

      if (missing.length > 0 || unrecognized.length > 0) {
        entries.push({
          rowId: expression.id,
          rowKey: expression.key ?? '',
          functionName,
          missing,
          unrecognized,
        });
      }

      return;
    }

    // 纯位置形态（无具名镜像）：按声明数对比位数，缺尾报缺（不识别中插——位置绑定的固有盲区，迁移链负责）
    const missingCount = Math.max(declared.length - positionalArgs.length, 0);
    if (missingCount > 0) {
      entries.push({
        rowId: expression.id,
        rowKey: expression.key ?? '',
        functionName,
        missing: declared
          .slice(declared.length - missingCount)
          .map((name) => ({ name, default: properties[name]?.default })),
        unrecognized: [],
      });
    }
  });

  return entries;
};

/**
 * 缺参修复（只增不删——圆往返保真）：按声明序重建规范形
 * value = [funcName, ...声明序参数] + arg_exprs 全量镜像；
 * 既有值保留（具名优先、位置次之、默认兜底），未识别键不动。
 * 无可修内容返回 null。
 */
export const fillMissingFunctionArgs = (
  expressions: any,
  drift: FunctionArgsDriftEntry[] | undefined,
  scope?: FunctionScope,
): any[] | null => {
  if (!scope || scope.mode !== 'scoped' || !Array.isArray(expressions) || !Array.isArray(drift) || drift.length === 0) {
    return null;
  }

  const driftByRow = new Map(drift.filter((entry) => entry.missing.length > 0).map((entry) => [entry.rowId, entry]));

  if (driftByRow.size === 0) {
    return null;
  }

  let changed = false;
  const healed = expressions.map((expression: any) => {
    const entry = driftByRow.get(expression?.id);
    if (!entry) {
      return expression;
    }

    const funcDef = getScopeFunction(scope, entry.functionName);
    const properties = funcDef && isRecord(funcDef.parameters) ? (funcDef.parameters.properties ?? {}) : {};
    const declared = funcDef ? Object.keys(properties) : [];
    if (declared.length === 0) {
      return expression;
    }

    const argExprs = isRecord(expression.arg_exprs) ? { ...expression.arg_exprs } : {};
    const positionalArgs = Array.isArray(expression.value) ? expression.value.slice(1) : [];

    declared.forEach((name, index) => {
      if (name in argExprs) {
        return;
      }

      const positional = positionalArgs[index];
      argExprs[name] = positional !== undefined ? positional : (properties[name]?.default ?? '');
      changed = true;
    });

    changed =
      changed ||
      declared.some((name) => !Object.keys(isRecord(expression.arg_exprs) ? expression.arg_exprs : {}).includes(name));

    return {
      ...expression,
      arg_exprs: argExprs,
      value: [entry.functionName, ...declared.map((name) => argExprs[name] ?? '')],
    };
  });

  return changed ? healed : null;
};

/**
 * ADR-015 调用规范（CONTRACT §11 canonical）：`{$call, kwargs}` 具名字典。
 * 双向转换纯助手——存储为规范形，编辑器（CustomFunctionTable）继续以
 * 位置数组形态编辑（价值：表达式构造器按位求值），转换在读写两缘发生。
 */

/** 规范调用形（CONTRACT §11）：{$call: 函数名, kwargs: 具名参数} */
export type NamedFunctionCall = {
  $call: string;
  kwargs: Record<string, unknown>;
};

/** 声明序参数键（funcDef.parameters.properties 的键序即位置序） */
const declaredArgNames = (funcDef?: { parameters?: unknown }): string[] =>
  funcDef && isRecord(funcDef.parameters) && isRecord(funcDef.parameters.properties)
    ? Object.keys(funcDef.parameters.properties)
    : [];

/**
 * 编辑器位置数组 → 规范字典：位置位按声明序映射为参数键；
 * 超出声明位的溢出值收进保留键 `$positional`（0.14 同款约定，供漂移带按
 * extra 检出）；priorKwargs 中的非位置键原样并回（圆往返保真）。
 */
export const editorValueToNamedCall = (
  value: unknown,
  funcDef?: { parameters?: unknown },
  priorKwargs?: Record<string, unknown> | null,
): NamedFunctionCall | null => {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const declared = declaredArgNames(funcDef);
  const fn = String(value[0] ?? '').trim();
  if (!fn) {
    return null;
  }

  const kwargs: Record<string, unknown> = { ...(priorKwargs ?? {}) };
  declared.forEach((name, index) => {
    if (value[index + 1] !== undefined) {
      kwargs[name] = value[index + 1];
    }
  });
  const overflow = value.slice(declared.length + 1);
  if (overflow.length > 0) {
    kwargs.$positional = overflow;
  } else {
    delete kwargs.$positional;
  }

  return { $call: fn, kwargs };
};

/**
 * 规范字典 → 编辑器位置数组（声明序取 kwargs，`$positional` 溢出按原序追加；
 * kwargs 中编辑器无法表达的额外键不进数组——由写路径从 priorKwargs 并回）。
 * 不可转换返回 null（该行走只读/原样保真）。
 */
export const namedCallToEditorValue = (call: unknown, funcDef?: { parameters?: unknown }): string[] | null => {
  if (!isRecord(call)) {
    return null;
  }

  const fn = typeof call.$call === 'string' ? call.$call.trim() : '';
  if (!fn) {
    return null;
  }

  const kwargs = isRecord(call.kwargs) ? call.kwargs : {};
  const declared = declaredArgNames(funcDef);
  const positional = declared.map((name) => (kwargs[name] !== undefined ? kwargs[name] : ''));
  const overflow = Array.isArray(kwargs.$positional) ? kwargs.$positional : [];

  return [fn, ...positional, ...overflow];
};

/**
 * ADR-015 增补（P1 骨架）：多实例视图模型——主从式（Master-Detail）的纯函数层。
 * 并行执行语义（Promise.all 逐条隔离）下实例集合无序：展示按字典序（集合观，
 * 不暗示执行序）；依赖声明（dependsOn）为 additive 预留字段（编辑器暂不渲染）。
 */

/** 实例视图模型（主从列表项） */
export type FunctionInstanceView = {
  id: string;
  /** 函数调用名（规范形 $call；未解析行 = null，列表显示占位） */
  fn: string | null;
  /** 输出绑定键（并行结果归集标签；重复 = error 级） */
  key: string;
  /** ADR-015 增补：显式依赖声明（additive 预留，编辑器暂不渲染） */
  dependsOn?: string[];
  /** 同函数多实例序号（从 1 起；异函数实例为 1） */
  seq: number;
};

/** 实例级漂移三类计数（复用 computeFunctionArgsDrift 的行结果聚合） */
export type InstanceDriftSummary = {
  missing: number;
  unrecognized: number;
};

/** 展示序：函数名 → 输出键 字典序（集合观，不暗示执行序） */
export const compareInstances = (left: FunctionInstanceView, right: FunctionInstanceView): number => {
  const fn = (left.fn ?? '').localeCompare(right.fn ?? '');
  if (fn !== 0) {
    return fn;
  }

  return left.key.localeCompare(right.key);
};

/** 行数组 → 实例视图列表（展示序；同函数实例按出现序编 seq） */
export const buildInstanceViews = (expressions: any, _scope?: FunctionScope): FunctionInstanceView[] => {
  if (!Array.isArray(expressions)) {
    return [];
  }

  const seqByFn = new Map<string, number>();
  const views = expressions.map((expression: any) => {
    let fn: string | null = null;
    let kwargs: Record<string, unknown> | null = null;

    if (isRecord(expression?.value)) {
      fn = typeof expression.value.$call === 'string' ? expression.value.$call : null;
      kwargs = isRecord(expression.value.kwargs) ? expression.value.kwargs : null;
    } else if (isFunctionExpression(expression)) {
      fn = getFunctionNameFromValue(expression.value);
    }

    let seq = 1;
    if (fn) {
      seq = (seqByFn.get(fn) ?? 0) + 1;
      seqByFn.set(fn, seq);
    }

    const view: FunctionInstanceView = {
      id: String(expression?.id ?? ''),
      fn,
      key: String(expression?.key ?? ''),
      seq: fn ? seq : 1,
    };

    // dependsOn additive 预留：存量带此字段的行透传（编辑器暂不渲染）
    if (isRecord(expression) && Array.isArray(expression.dependsOn)) {
      view.dependsOn = expression.dependsOn.map(String);
    }
    void kwargs;

    return view;
  });

  return views.sort(compareInstances);
};

/** 输出键重复检测（并行归集覆盖 + 变量重声明双风险，error 级） */
export const findDuplicateKeys = (expressions: any): string[] => {
  if (!Array.isArray(expressions)) {
    return [];
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();

  expressions.forEach((expression: any) => {
    const key = String(expression?.key ?? '').trim();
    if (!key) {
      return;
    }

    if (seen.has(key)) {
      duplicates.add(key);
    }

    seen.add(key);
  });

  return [...duplicates];
};

/** 实例级漂移汇总（rowId → 计数，供列表点标） */
export const summarizeInstanceDrift = (drift: FunctionArgsDriftEntry[]): Record<string, InstanceDriftSummary> => {
  const summary: Record<string, InstanceDriftSummary> = {};

  drift.forEach((entry) => {
    const current = summary[entry.rowId] ?? { missing: 0, unrecognized: 0 };
    summary[entry.rowId] = {
      missing: current.missing + entry.missing.length,
      unrecognized: current.unrecognized + entry.unrecognized.length,
    };
  });

  return summary;
};
