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
