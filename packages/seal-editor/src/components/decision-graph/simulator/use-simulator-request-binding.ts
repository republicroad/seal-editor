import { useMemo } from 'react';

import { getRequestDefinitions, getRequestExampleSources } from '../../../helpers/request-schema';
import type { RequestContentLike, RequestDefinition, RequestExampleSource } from '../../../helpers/request-schema';
import type { SimulatorExampleBinding } from '../context/dg-store.context';

export type ResolvedSimulatorExampleBinding = {
  nodeId: string;
  exampleId: string;
  sourceName?: string;
};

export type UseSimulatorRequestBindingParams = {
  inputNodeContent?: unknown;
  inputNodeId?: string;
  simulatorExampleBinding?: SimulatorExampleBinding | null;
};

export type SimulatorRequestBinding = {
  requestSources: RequestExampleSource[];
  boundRequestSourceIndex: number;
  defaultRequestSourceIndex: number;
  defaultRequestSource?: RequestExampleSource;
  resolvedSimulatorExampleBinding: ResolvedSimulatorExampleBinding | null;
  currentBindingIdentity: string | null;
  requestDefinitions: RequestDefinition[];
  sourceOptions: Array<{ value: number; label: string }>;
  bindingName?: string;
  shouldShowSimulatorSourceSelect: boolean;
};

export const useSimulatorRequestBinding = ({
  inputNodeContent,
  inputNodeId,
  simulatorExampleBinding,
}: UseSimulatorRequestBindingParams): SimulatorRequestBinding => {
  const requestContent = inputNodeContent as RequestContentLike | null | undefined;
  // 单一派生入口（example-sources.ts）：与 Design 编辑器同内核同名——回退名分歧曾是乒乓死循环根因
  const requestSources = useMemo(() => getRequestExampleSources(requestContent), [requestContent]);
  // 绑定身份 = exampleId：按当前示例集解析下标（id 失配 = -1 = 未绑定，面板 effect 自愈重绑）
  const boundRequestSourceIndex = useMemo(() => {
    if (!simulatorExampleBinding || simulatorExampleBinding.nodeId !== inputNodeId) {
      return -1;
    }

    return requestSources.findIndex((source) => source.id === simulatorExampleBinding.exampleId);
  }, [inputNodeId, requestSources, simulatorExampleBinding]);
  const defaultRequestSourceIndex =
    boundRequestSourceIndex >= 0 ? boundRequestSourceIndex : requestSources.length > 0 ? 0 : -1;
  const defaultRequestSource = defaultRequestSourceIndex >= 0 ? requestSources[defaultRequestSourceIndex] : undefined;
  const resolvedSimulatorExampleBinding = useMemo<ResolvedSimulatorExampleBinding | null>(() => {
    if (!inputNodeId || defaultRequestSourceIndex < 0 || !defaultRequestSource) {
      return null;
    }

    return {
      nodeId: inputNodeId,
      exampleId: defaultRequestSource.id,
      sourceName: defaultRequestSource.name,
    };
  }, [defaultRequestSource, defaultRequestSourceIndex, inputNodeId]);
  const currentBindingIdentity = useMemo(
    () => (simulatorExampleBinding ? `${simulatorExampleBinding.nodeId}:${simulatorExampleBinding.exampleId}` : null),
    [simulatorExampleBinding],
  );
  const requestDefinitions = useMemo(() => getRequestDefinitions(requestContent), [requestContent]);
  const sourceOptions = useMemo(
    () => requestSources.map((source, index) => ({ value: index, label: source.name })),
    [requestSources],
  );
  const bindingName = useMemo(
    () => (boundRequestSourceIndex >= 0 ? requestSources[boundRequestSourceIndex]?.name : undefined),
    [boundRequestSourceIndex, requestSources],
  );
  const shouldShowSimulatorSourceSelect = Boolean(bindingName) && Boolean(inputNodeId) && requestSources.length > 1;

  return {
    requestSources,
    boundRequestSourceIndex,
    defaultRequestSourceIndex,
    defaultRequestSource,
    resolvedSimulatorExampleBinding,
    currentBindingIdentity,
    requestDefinitions,
    sourceOptions,
    bindingName,
    shouldShowSimulatorSourceSelect,
  };
};
