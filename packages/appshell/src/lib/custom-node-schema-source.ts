import fallbackSchema from '../assets/custom-node-schema.json';
import type { CustomNodeNamespace } from './custom-node-types';

// 自定义节点 schema 来源：同源/自定义 URL 字符串，或宿主注入的加载函数(库复用时不假设后端存在)
export type CustomNodeSchemaSource = string | (() => Promise<CustomNodeNamespace[]> | CustomNodeNamespace[]);

export const DEFAULT_SCHEMA_URL = '/api/custom-nodes/schema';

/**
 * 带版本目录信封（文件协议，见 docs/adr/008 补充）：静态 host-functions.json 的
 * 推荐形态——version/generatedAt 供消费方提示目录过期；namespaces 为条目本体。
 * 裸数组（CustomNodeNamespace[]）保持兼容。
 */
export interface CustomNodeSchemaEnvelope {
  version: number | string;
  generatedAt?: string;
  namespaces: CustomNodeNamespace[];
}

const isEnvelope = (payload: unknown): payload is CustomNodeSchemaEnvelope =>
  typeof payload === 'object' && payload !== null && Array.isArray((payload as { namespaces?: unknown }).namespaces);

/** 校验并收窄 schema 载荷；支持信封（优先）与裸数组两种形态，非法结构抛错由调用方决定回退策略 */
export function parseCustomNodeSchemaPayload(payload: unknown): CustomNodeNamespace[] {
  if (isEnvelope(payload)) {
    return payload.namespaces as CustomNodeNamespace[];
  }
  if (!Array.isArray(payload)) {
    throw new Error('schema response is not an array or envelope');
  }
  return payload as CustomNodeNamespace[];
}

export async function fetchCustomNodeSchema(
  source: CustomNodeSchemaSource = DEFAULT_SCHEMA_URL,
): Promise<CustomNodeNamespace[]> {
  try {
    let payload: unknown;
    if (typeof source === 'function') {
      payload = await source();
    } else {
      const response = await fetch(source, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`schema request failed: ${response.status}`);
      }
      payload = await response.json();
    }
    return parseCustomNodeSchemaPayload(payload);
  } catch (error) {
    console.warn('[custom-node] fetch schema failed, using bundled fallback', error);
    return fallbackSchema as CustomNodeNamespace[];
  }
}
