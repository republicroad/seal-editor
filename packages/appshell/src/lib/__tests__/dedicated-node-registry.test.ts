// @vitest-environment jsdom
// 注册表导入四专用节点 → 内核 spec 链自 monaco loader 触碰 self（BP-09 约定）
import { describe, expect, test } from 'vitest';

import type { CustomFunctionTool, CustomNodeNamespace } from '../custom-node-types';
import {
  dedicatedFunctionRegistry,
  dedupeByDedicatedRegistry,
  unsupportedDedicatedNodes,
} from '../dedicated-node-registry';

const tool = (name: string, props: string[] = []): CustomFunctionTool =>
  ({
    name,
    title: name,
    type: 'function',
    parameters: { type: 'object', properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])) },
    returns: { type: 'object' },
    namespace: name,
    kind: name,
  }) as CustomFunctionTool;

const ns = (name: string, tools: CustomFunctionTool[]): CustomNodeNamespace =>
  ({ type: 'namespace', name, title: name, tools }) as CustomNodeNamespace;

describe('dedicatedFunctionRegistry（轨道 B M5：去硬编码接管）', () => {
  test('形状匹配的接管工具被剔除，其余工具保留在通用容器', () => {
    const payload = [ns('http', [tool('http_request', ['method', 'url', 'headers']), tool('webhook', ['url'])])];
    const { schema, takenOver } = dedupeByDedicatedRegistry(payload, dedicatedFunctionRegistry);

    expect(takenOver).toEqual(['http_request']);
    expect(schema).toHaveLength(1);
    expect(schema[0].tools.map((t) => t.name)).toEqual(['webhook']);
  });

  test('形状漂移的接管工具回落通用容器（能力校验取代按名遮蔽）', () => {
    const payload = [ns('http', [tool('http_request', ['path'])])]; // method/url 消失 = 漂移
    const { schema, takenOver } = dedupeByDedicatedRegistry(payload, dedicatedFunctionRegistry);

    expect(takenOver).toEqual([]);
    expect(schema[0].tools.map((t) => t.name)).toEqual(['http_request']);
  });

  test('无参工具（current_date）按名称接管', () => {
    const payload = [ns('debugui', [tool('current_date', [])])];
    const { takenOver } = dedupeByDedicatedRegistry(payload, dedicatedFunctionRegistry);
    expect(takenOver).toEqual(['current_date']);
  });

  test('unsupportedDedicatedNodes：被过滤函数的专用节点 kind 诊断', () => {
    const payload = [ns('crypto', [tool('crypto', ['algorithm', 'encoding'])])]; // http/roster/current_date 不在载荷
    expect(unsupportedDedicatedNodes(payload, dedicatedFunctionRegistry).sort()).toEqual([
      'current_date',
      'http_request',
      'roster',
    ]);
  });
});
