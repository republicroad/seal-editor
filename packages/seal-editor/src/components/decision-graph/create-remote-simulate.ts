import type { DecisionGraphType } from './dg-types';
import type { Simulation } from './simulator/simulation.types';

/**
 * A3 服务端仿真裁定（规则仿真以服务端请求为核心）：浏览器 wasm 只覆盖 zen
 * 表达式子集、自定义节点（UDF registry）服务端专属——服务端引擎是唯一完整
 * 执行面。本工厂 = 远程仿真传输客户端：POST {model, input, trace:true} →
 * Simulation 形状映射（剥执行上下文注入键），endpoint 由调用方注入零硬编码。
 */

export type RemoteSimulateParams = {
  /** 引擎端点基址（如 http://localhost:8787 或同源网关 '/engine'） */
  baseUrl: string;
  /** 服务不可达时的回落仿真（如离线 demo trace）——缺省无回落（错误上抛） */
  fallback?: (graph: DecisionGraphType, context: unknown) => Simulation;
};

type SimulateOutcome = {
  simulation: Simulation;
  errorMessage?: string;
};

/** 剥离服务端 UDF 执行上下文注入键（__zen_udf_exec_ctx__——回显噪音） */
const stripExecContext = (value: unknown): unknown => {
  if (value && typeof value === 'object' && !Array.isArray(value) && '__zen_udf_exec_ctx__' in value) {
    const { __zen_udf_exec_ctx__: _, ...rest } = value as Record<string, unknown>;
    return rest;
  }
  return value;
};

export const createRemoteSimulate = ({
  baseUrl,
  fallback,
}: RemoteSimulateParams): ((payload: { graph: DecisionGraphType; context: unknown }) => Promise<SimulateOutcome>) => {
  return async ({ graph, context }) => {
    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/execute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          // annotations 不入 model（编辑器视觉资产，引擎面只读 nodes/edges）
          model: { nodes: graph.nodes, edges: graph.edges },
          input: context,
          trace: true,
        }),
      });
      const data = (await res.json()) as {
        result?: unknown;
        performance?: string;
        trace?: Record<string, unknown>;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || res.statusText);
      }
      // trace 形状与引擎透传一致（id/name/type/order/performance/input/output/
      // traceData——A3 徽章、switch 高亮、dt 命中行的消费形状）；剥离上下文键
      const trace = Object.fromEntries(
        Object.entries(data.trace ?? {}).map(([nodeId, t]) => {
          if (!t || typeof t !== 'object') {
            return [nodeId, t];
          }
          const { input, output } = t as { input?: unknown; output?: unknown };
          return [
            nodeId,
            {
              ...(t as Record<string, unknown>),
              input: stripExecContext(input),
              output: stripExecContext(output),
            },
          ];
        }),
      );
      return {
        simulation: {
          result: {
            performance: data.performance ?? '',
            result: data.result ?? null,
            snapshot: graph,
            trace,
          },
        } as Simulation,
      };
    } catch (e) {
      if (fallback) {
        return { simulation: fallback(graph, context) };
      }
      return {
        simulation: {
          result: { result: null, snapshot: graph, trace: {} },
        },
        errorMessage: String(e).slice(0, 300),
      } as SimulateOutcome;
    }
  };
};
