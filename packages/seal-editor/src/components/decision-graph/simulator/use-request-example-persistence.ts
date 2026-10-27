import json5 from 'json5';
import { toast } from 'sonner';

import {
  type RequestContentLike,
  contractExamplesToSources,
  formatRequestExampleSourceName,
  getRequestDefinitions,
  getRequestExampleDataDefinitionConflicts,
  normalizeRequestExampleDataByDefinitions,
  readRequestInputContract,
  requestSchemaFingerprint,
  updateRequestSchemaExamples,
  writeRequestInputContract,
} from '../../../helpers/request-schema';
import type { TranslationKey } from '../../../theming/i18n';
import { type SimulatorExampleBinding, useDecisionGraphRaw } from '../context/dg-store.context';

export type RequestExampleBinding = NonNullable<SimulatorExampleBinding>;

export type UseRequestExamplePersistenceParams = {
  t: (key: TranslationKey) => string;
  requestValue: string | undefined;
  resolvedSimulatorExampleBinding: RequestExampleBinding | null;
  /** input 节点 id（未绑定但节点存在时，「存为新用例」仍可用——首份用例的捕获） */
  inputNodeId?: string;
  onRequestValueChange: (nextValue: string) => void;
  onMarkEdited: () => void;
  onExternalChange?: (nextValue: string) => void;
};

export type PersistRequestToExampleSourceOptions = {
  silentWhenUnbound?: boolean;
  showSuccessMessage?: boolean;
  requestValueOverride?: string;
  silentOnError?: boolean;
  validateDefinitionTypes?: boolean;
  triggeredBy?: 'manual-save' | 'auto-sync';
};

export const useRequestExamplePersistence = ({
  t,
  requestValue,
  resolvedSimulatorExampleBinding,
  inputNodeId,
  onRequestValueChange,
  onMarkEdited,
  onExternalChange,
}: UseRequestExamplePersistenceParams) => {
  const { stateStore, actions } = useDecisionGraphRaw();

  const savePreparedRequestToExampleSource = ({
    activeExampleBinding,
    preparedParsed,
    triggeredBy,
    showSuccessMessage = true,
  }: {
    activeExampleBinding: RequestExampleBinding;
    preparedParsed: Record<string, unknown>;
    triggeredBy: 'manual-save' | 'auto-sync';
    showSuccessMessage?: boolean;
  }) => {
    const { decisionGraph } = stateStore.getState();
    const targetNode = decisionGraph.nodes.find((node) => node.id === activeExampleBinding.nodeId);

    if (!targetNode) {
      toast.error(t('simulator.boundRequestNodeNotFound'));
      return null;
    }

    const { contract: targetContract } = readRequestInputContract(targetNode.content);
    const currentSources = contractExamplesToSources(targetContract);
    // 绑定身份 = exampleId → 按当前示例集解析下标（示例已删 = 未绑定，拒绝落笔）
    const boundIndex = currentSources.findIndex((source) => source.id === activeExampleBinding.exampleId);
    if (boundIndex < 0) {
      toast.warning(t('request.selectDataSourceFirst'));
      return null;
    }
    const currentBoundSource = currentSources[boundIndex];
    const formatted = JSON.stringify(preparedParsed, null, 2);

    if (currentBoundSource && JSON.stringify(currentBoundSource.data) === JSON.stringify(preparedParsed)) {
      if (import.meta.env.DEV) {
        console.log('[simulator-request] skipped saving unchanged example source', {
          binding: activeExampleBinding,
          triggeredBy,
        });
      }

      if (showSuccessMessage) {
        toast.success(t('request.dataSourceSaved'));
      }

      return {
        context: preparedParsed,
        formatted,
      };
    }

    const nextSources = [...currentSources];

    while (nextSources.length <= boundIndex) {
      nextSources.push({
        id: crypto.randomUUID(),
        name: formatRequestExampleSourceName(nextSources.length),
        data: {},
        source: 'schema.examples',
      });
    }

    nextSources[boundIndex] = {
      ...nextSources[boundIndex],
      id: nextSources[boundIndex]?.id ?? crypto.randomUUID(),
      name:
        activeExampleBinding.sourceName ?? nextSources[boundIndex]?.name ?? formatRequestExampleSourceName(boundIndex),
      data: preparedParsed,
      source: 'schema.examples',
    };

    actions.updateNode(activeExampleBinding.nodeId, (draft) => {
      draft.content ??= {};
      if (draft.type === 'inputNode') {
        // 契约写路径：draft 内新读契约（双写镜像由 writeRequestInputContract 重生成）；
        // 覆写示例的指纹清空 → 漂移状态在编辑器内重估（确认/迁移后熄灭）
        const contentRecord = draft.content as RequestContentLike & Record<string, any>;
        const { contract: freshContract } = readRequestInputContract(contentRecord);
        const nextExamples = [...freshContract.examples];

        while (nextExamples.length <= boundIndex) {
          nextExamples.push({
            id: crypto.randomUUID(),
            name: formatRequestExampleSourceName(nextExamples.length),
            data: {},
          });
        }

        nextExamples[boundIndex] = {
          ...nextExamples[boundIndex],
          name:
            activeExampleBinding.sourceName ??
            nextExamples[boundIndex]?.name ??
            formatRequestExampleSourceName(boundIndex),
          data: preparedParsed,
          schemaFingerprint: undefined,
        };

        writeRequestInputContract(contentRecord, { ...freshContract, examples: nextExamples });
      } else {
        draft.content.schema = updateRequestSchemaExamples(
          draft.content?.schema,
          nextSources.map((source) => source.data),
        );
      }
      return draft;
    });

    onRequestValueChange(formatted);
    onMarkEdited();
    onExternalChange?.(formatted);
    actions.setSimulatorRequest(formatted);
    actions.setSimulatorExampleBinding({
      ...activeExampleBinding,
      sourceName: nextSources[boundIndex]?.name,
    });

    if (import.meta.env.DEV) {
      console.log('[simulator-request] saved simulator request to bound example source', {
        binding: activeExampleBinding,
        preparedParsed,
        currentBoundSource,
        nextSources,
        triggeredBy,
      });
    }

    if (showSuccessMessage) {
      toast.success(t('request.dataSourceSaved'));
    }

    return {
      context: preparedParsed,
      formatted,
    };
  };

  const persistRequestToExampleSource = (options?: PersistRequestToExampleSourceOptions) => {
    const {
      silentWhenUnbound = false,
      showSuccessMessage = true,
      requestValueOverride,
      silentOnError = false,
      validateDefinitionTypes = false,
      triggeredBy = 'manual-save',
    } = options ?? {};

    const activeExampleBinding = resolvedSimulatorExampleBinding;

    if (!activeExampleBinding) {
      if (!silentWhenUnbound) {
        toast.warning(t('request.selectDataSourceFirst'));
      }
      return null;
    }

    try {
      const sourceRequestValue = requestValueOverride ?? requestValue;
      const parsed = (sourceRequestValue || '').trim().length === 0 ? {} : json5.parse(sourceRequestValue || '{}');

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        if (!silentOnError) {
          toast.error(t('simulator.requestMustBeObjectToSave'));
        }
        return null;
      }

      const { decisionGraph } = stateStore.getState();
      const targetNode = decisionGraph.nodes.find((node) => node.id === activeExampleBinding.nodeId);

      if (!targetNode) {
        if (!silentOnError) {
          toast.error(t('simulator.boundRequestNodeNotFound'));
        }
        return null;
      }

      const requestDefinitions = getRequestDefinitions(targetNode.content);
      const parsedRecord = parsed as Record<string, unknown>;
      const definitionTypeConflicts = validateDefinitionTypes
        ? getRequestExampleDataDefinitionConflicts(parsedRecord, requestDefinitions)
        : [];

      if (definitionTypeConflicts.length > 0) {
        if (!silentOnError) {
          toast.warning(t('request.dataTypeMismatchWarning'));
        }
        return null;
      }

      const preparedParsed = normalizeRequestExampleDataByDefinitions(parsedRecord, requestDefinitions);

      return savePreparedRequestToExampleSource({
        activeExampleBinding,
        preparedParsed,
        triggeredBy,
        showSuccessMessage,
      });
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[simulator-request] failed to save simulator request to example source', {
          binding: activeExampleBinding,
          requestValue,
          error,
          triggeredBy,
        });
      }

      if (!silentOnError) {
        toast.error(t('request.saveDataSourceFailed'));
      }
      return null;
    }
  };

  /**
   * 存为新用例（Postman "Save as example" 捕获范式）：当前编辑器内容追加为
   * 新示例（自动命名 'Data N'，名字回 Design 改）并绑定到它。新鲜捕获与当前
   * schema 相容 → 戳当前 schema 指纹（不亮漂移徽标）。写路径=契约单漏斗
   * （writeRequestInputContract 双写镜像）；未绑定时只要 input 节点存在即可
   * 捕获首份用例。
   */
  const saveAsNewExampleSource = () => {
    const nodeId = resolvedSimulatorExampleBinding?.nodeId ?? inputNodeId;
    if (!nodeId) {
      toast.warning(t('simulator.nodeRequired'));
      return;
    }

    try {
      const parsed = (requestValue || '').trim().length === 0 ? {} : json5.parse(requestValue || '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        toast.error(t('simulator.requestMustBeObjectToSave'));
        return;
      }

      const { decisionGraph } = stateStore.getState();
      const targetNode = decisionGraph.nodes.find((node) => node.id === nodeId);
      if (!targetNode) {
        toast.error(t('simulator.boundRequestNodeNotFound'));
        return;
      }

      const requestDefinitions = getRequestDefinitions(targetNode.content);
      const preparedParsed = normalizeRequestExampleDataByDefinitions(
        parsed as Record<string, unknown>,
        requestDefinitions,
      );
      const formatted = JSON.stringify(preparedParsed, null, 2);

      const { contract: targetContract } = readRequestInputContract(targetNode.content);
      const appendedName = formatRequestExampleSourceName(targetContract.examples.length);
      const appendedId = crypto.randomUUID();

      actions.updateNode(nodeId, (draft) => {
        draft.content ??= {};
        const contentRecord = draft.content as RequestContentLike & Record<string, any>;
        const { contract: freshContract } = readRequestInputContract(contentRecord);
        writeRequestInputContract(contentRecord, {
          ...freshContract,
          examples: [
            ...freshContract.examples,
            {
              id: appendedId,
              name: appendedName,
              data: preparedParsed,
              schemaFingerprint: requestSchemaFingerprint(freshContract.schema),
            },
          ],
        });
        return draft;
      });

      onRequestValueChange(formatted);
      onMarkEdited();
      onExternalChange?.(formatted);
      actions.setSimulatorRequest(formatted);
      actions.setSimulatorExampleBinding({
        nodeId,
        exampleId: appendedId,
        sourceName: appendedName,
      });

      toast.success(`${t('simulator.savedAsNewExample')} · ${appendedName}`);
    } catch {
      toast.error(t('request.jsonInvalidError'));
    }
  };

  return {
    persistRequestToExampleSource,
    saveAsNewExampleSource,
  };
};
