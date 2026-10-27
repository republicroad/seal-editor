export type RequestJsonSchema = {
  'type'?: string | string[];
  'description'?: string;
  'format'?: string;
  'properties'?: Record<string, RequestJsonSchema>;
  'items'?: RequestJsonSchema | RequestJsonSchema[];
  'examples'?: unknown[];
  'x-examples-meta'?: RequestExampleMeta[];
  'x-order'?: number;
  [key: string]: unknown;
};

export type LegacyRequestInput = {
  id?: string;
  key?: string;
  type?: string;
  value?: unknown;
  desc?: unknown;
  description?: unknown;
};

export type RequestContentLike = {
  schema?: unknown;
  schemaUI?: unknown;
  inputs?: LegacyRequestInput[];
  /** InputContract（ADR-013）规范存储；legacy schema/examples 为读取回退 */
  inputContract?: InputContract;
};

/**
 * 用例期望（Run all 分层断言，CONTRACT §10 serializable 子集）：deep=全输出
 * 精确断言 / path=输出某路径精确断言 / expression=zen-expression 对结果求值
 * （context 平铺裸键，OQ3 定稿）。外部状态 UDF 破坏值幂等——捕获范式下发
 * （Run 报告一键设期望），纯度纪律见 dag-editor-best-practices 铁律。
 */
export type InputContractExampleExpectation =
  | { mode: 'deep'; value: unknown }
  | { mode: 'path'; path: string; value: unknown }
  | { mode: 'expression'; source: string };

/** InputContract 示例——完整输入实例 + 漂移检测指纹锚（ADR-013 §1） */
export type InputContractExample = {
  id: string;
  name: string;
  description?: string;
  /** 完整输入实例——simulator 直接消费 */
  data: Record<string, unknown>;
  /** 上次确认合法时的 schema 指纹（canonical stringify → FNV-1a） */
  schemaFingerprint?: string;
  /** 用例期望（缺省 = 冒烟语义：执行无异常即通过，ADR-014 §2） */
  expectation?: InputContractExampleExpectation;
};

/** 输入节点唯一事实源：结构（JSON Schema）+ 具名示例集 */
export type InputContract = {
  contractVersion: number;
  /** 结构事实源（不含内嵌 examples / x-examples-meta） */
  schema: RequestJsonSchema;
  examples: InputContractExample[];
};

export type RequestDefinitionType = 'number' | 'string' | 'array' | 'object' | 'datetime' | 'boolean';

export type RequestDefinition = {
  id: string;
  path: string;
  name: string;
  type: RequestDefinitionType;
  description: string;
  format: string;
  order: number;
  depth: number;
  parentPath: string | null;
  source: 'schema.properties' | 'content.inputs';
  defaultValue?: string;
};

export type RequestExampleMeta = {
  name?: string;
  description?: string;
};

export type RequestExampleSource = {
  id: string;
  name: string;
  description?: string;
  data: Record<string, unknown>;
  source: 'schema.examples' | 'content.inputs';
};

export type RequestDefinitionSyncConflict = {
  path: string;
  nextType: RequestDefinitionType;
  value: unknown;
};
