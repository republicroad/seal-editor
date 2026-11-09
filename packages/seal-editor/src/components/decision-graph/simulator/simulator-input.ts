import type { DecisionGraphType } from '../dg-types';
import { buildContractFixtures, listInputNodes } from '../graph/fixtures-run';

/**
 * 单击直跑（navbar-5 Test Run 模式）的输入解析：第一个 inputNode 的
 * 契约示例集第一条（复用 Fixtures 面板同款预处理管线——默认值合并 +
 * datetime 归一）；无 inputNode / 无 examples 时回落空对象（MISSING_INPUT
 * 诊断标缺字段，trace 仍显示结构命中——n8n 空 payload 测试触发同构）。
 */
export const resolveSimulatorInput = (graph: DecisionGraphType): unknown => {
  const inputNode = listInputNodes(graph)[0];
  if (!inputNode) {
    return {};
  }
  const fixtures = buildContractFixtures(graph, inputNode.id);
  return fixtures?.[0]?.input ?? {};
};
