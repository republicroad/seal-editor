import { contractExamplesToSources, readRequestInputContract } from './contract';
import { formatRequestExampleSourceName } from './examples';
import { legacyInputsToExampleObject } from './legacy';
import type { RequestContentLike, RequestExampleSource } from './types';

/**
 * 示例列表单一派生入口（业界铁律：派生函数必须单源）。
 *
 * 契约优先（content.inputContract），legacy（schema 内嵌 examples +
 * x-examples-meta）经 readRequestInputContract 投影，两者皆空且存在
 * legacy inputs 时合成单源。命名权威 = 契约 example 名 > x-examples-meta 名
 * > 'Data N' 统一回退——所有消费方（Design 编辑器 / simulator 绑定 / 持久化）
 * 必须经此（或其内核 contractExamplesToSources）取列表，禁止各自从
 * schema 直接派生：回退名分歧曾致 simulatorExampleBinding 双写乒乓死循环
 * （ Maximum update depth exceeded，55a9385f）。
 */
export const getRequestExampleSources = (
  content?: RequestContentLike | null,
  options?: { dataLabel?: string },
): RequestExampleSource[] => {
  const sources = contractExamplesToSources(readRequestInputContract(content).contract, options);
  if (sources.length > 0 || (content?.inputs ?? []).length === 0) {
    return sources;
  }

  return [
    {
      id: 'schema-example-0',
      name: formatRequestExampleSourceName(0, options?.dataLabel),
      data: legacyInputsToExampleObject(content?.inputs),
      source: 'schema.examples',
    },
  ];
};
