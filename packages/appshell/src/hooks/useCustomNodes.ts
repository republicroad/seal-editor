import type { CustomNodeSpecification } from '@republicroad/seal-editor';
import { setUdfCompletions } from '@republicroad/seal-editor';
import { useEffect, useMemo, useState } from 'react';

import { useTheme } from '../context/theme.provider';
import {
  type CustomNodeSchemaSource,
  createLegacyUdfNode,
  fetchCustomNodeSchema,
  schemaToCustomNodes,
} from '../lib/custom-node-registry';
import type { CustomNodeNamespace } from '../lib/custom-node-types';
import { dedicatedFunctionRegistry, dedupeByDedicatedRegistry } from '../lib/dedicated-node-registry';
import { applyNodeOverrides } from '../skin/apply';

type CustomNodeSpec = CustomNodeSpecification<object, any>;

/** ADR-010 Phase 2：目录过滤谓词——仅作用于「可创建面」（组件面板与目录视图），
 *  补全（A2）与 REPL（A3）不跟随（体验层语义，授权全集仍可用）。 */
export type CatalogFilterRef = {
  namespace: string;
  /** origin 徽标维度：UdfPackMeta 透传（ADR-009 #1/#2）后可用，当前载荷缺省 */
  origin?: 'reference' | 'extension' | 'industry';
  /** 工具级过滤预留（当前按 namespace 粒度，ADR-010 开放问题 1 结论） */
  tool?: string;
};
export type CatalogFilter = (ref: CatalogFilterRef) => boolean;

export type UseCustomNodesOptions = {
  /** 自定义节点 schema 来源：默认同源 /api/custom-nodes/schema；可传自定义 URL 或加载函数(库复用) */
  schemaSource?: CustomNodeSchemaSource;
  /** 追加宿主自定义节点(置于内置业务节点之前、schema 驱动节点之前) */
  extraNodes?: CustomNodeSpec[];
  /** ADR-010 Phase 2：目录过滤（仅目录面；返回的 schema 恒为未过滤全量，供补全/REPL） */
  catalogFilter?: CatalogFilter;
};

const applyCatalogFilter = (schema: CustomNodeNamespace[], filter?: CatalogFilter): CustomNodeNamespace[] =>
  filter
    ? schema
        .map((namespace) => ({
          ...namespace,
          tools: (namespace.tools ?? []).filter((tool) =>
            filter({ namespace: namespace.name, origin: namespace.meta?.origin, tool: tool.name }),
          ),
        }))
        .filter((namespace) => namespace.tools.length > 0)
    : schema;

export function useCustomNodes(options?: UseCustomNodesOptions): {
  customNodes: CustomNodeSpec[];
  schema: CustomNodeNamespace[] | null;
  ready: boolean;
} {
  const { schemaSource, extraNodes, catalogFilter } = options ?? {};
  const [schema, setSchema] = useState<CustomNodeNamespace[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchCustomNodeSchema(schemaSource).then((value) => {
      if (!cancelled) {
        setSchema(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [schemaSource]);

  // 轨道 B（A2 产品化）：schema 到达即把 registry 全量函数注入补全/悬停——
  // 不跟随 catalogFilter（ADR-010：体验层过滤仅目录面；授权全集仍可补全）。
  // jdm 原型在宿主页逐个接线，产品化收编到 hook 内，宿主零接线。
  useEffect(() => {
    if (schema) {
      setUdfCompletions(schema.flatMap((ns) => ns.tools ?? []));
    }
  }, [schema]);

  // 专用函数注册表（去硬编码）：tester 胜出的工具由专用节点覆盖，从 schema
  // 驱动结果剔除；失配工具回落通用容器（明确降级，能力校验取代按名遮蔽）。
  const buildable = useMemo<{ schema: CustomNodeNamespace[]; dedicatedNodes: CustomNodeSpec[] } | null>(() => {
    if (!schema) {
      return null;
    }
    const filtered = applyCatalogFilter(schema, catalogFilter);
    const { schema: deduped, takenOver } = dedupeByDedicatedRegistry(filtered, dedicatedFunctionRegistry);
    const dedicatedNodes = dedicatedFunctionRegistry
      .filter((reg) => takenOver.includes(reg.functionName))
      .map((reg) => reg.node);
    return { schema: deduped, dedicatedNodes };
  }, [schema, catalogFilter]);

  // 基础节点仅剩宿主追加项 + 旧版自由 UDF 节点（旧图兼容，不归属 namespace）；
  // 四个专用节点改由注册表按载荷提供——namespace 被租户过滤后节点不再出现。
  const baseNodes = useMemo<CustomNodeSpec[]>(
    () => [...(extraNodes ?? []), createLegacyUdfNode() as CustomNodeSpec],
    [extraNodes],
  );

  // 皮肤节点 UI 槽位劫持：activeSkin.nodeOverrides 按 kind 覆写 renderTab/renderNode；
  // 无 ThemeContextProvider 时 useTheme 兜底空对象，行为与未开皮肤一致
  const { activeSkin } = useTheme();
  const nodeOverrides = activeSkin?.nodeOverrides;

  const customNodes = useMemo<CustomNodeSpec[]>(
    () =>
      applyNodeOverrides(
        buildable ? [...baseNodes, ...buildable.dedicatedNodes, ...schemaToCustomNodes(buildable.schema)] : baseNodes,
        nodeOverrides,
      ),
    [baseNodes, buildable, nodeOverrides],
  );

  // schema 恒为未过滤全量（补全/REPL/宿主自治），过滤只影响 customNodes 构建面
  return { customNodes, schema, ready: schema !== null };
}
