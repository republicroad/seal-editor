import type { ContractFixture, DecisionGraphType, ExampleRunReport, FixturesRunner } from '@republicroad/seal-editor';
import { runDecisionTests } from '@republicroad/zen-udf/runner';

import type { SimulateHandler } from './types';

/**
 * ADR-013 批次三 / ADR-014：simulateHandler → fixturesRunner 适配器（参考实现）。
 *
 * kernel 的 Run all 槽位由本适配器注入：每个 example 经 simulateHandler 跑整图
 * （执行语义与模拟器单源——宿主服务端引擎），报告由 zen-udf 0.13.0 的
 * runDecisionTests 装配（字面复用，勿新写 runner）。smoke 语义：examples 无
 * expect，passed = 执行无异常；Simulation.error → execution-error。
 */
export const createSimulateFixturesRunner = (simulateHandler: SimulateHandler): FixturesRunner => {
  return async (graph: DecisionGraphType, fixtures: ContractFixture[]): Promise<ExampleRunReport> => {
    // D2：规则级命中的 side-channel——runner 契约只透传 traceHits（node ids），
    // ruleHits 由本闭包捕获后在报告侧合入（ExampleRunResult.ruleHits，kernel 可选字段）
    const ruleHitsByIndex: { nodeId: string; ruleId: string }[][] = [];

    const report = await runDecisionTests({
      executor: async (fixture) => {
        const outcome = await simulateHandler(graph, fixture.input);
        const { simulation } = outcome;

        if (simulation.error) {
          ruleHitsByIndex.push([]);
          return { error: simulation.error.message ?? simulation.error.title ?? 'simulation error' };
        }

        const trace = simulation.result?.trace ?? {};
        const ruleHits = Object.entries(trace).flatMap(([nodeId, nodeTrace]) => {
          const ruleId = (nodeTrace as { traceData?: { rule?: { _id?: string } } } | undefined)?.traceData?.rule?._id;
          return ruleId ? [{ nodeId, ruleId }] : [];
        });
        ruleHitsByIndex.push(ruleHits);

        return {
          result: simulation.result?.result,
          traceHits: Object.keys(trace),
        };
      },
      fixtures,
    });

    // 按用例序合入（runDecisionTests 保持 executor 调用序）
    return {
      ...report,
      results: report.results.map((r, index) => ({
        ...r,
        ruleHits: ruleHitsByIndex[index],
      })),
    };

    // 结构性兼容：zen-udf FixtureReport 与 kernel ExampleRunReport 同形
    //（CONTRACT §10 测试契约），此处赋值即编译期校验
    return report;
  };
};
