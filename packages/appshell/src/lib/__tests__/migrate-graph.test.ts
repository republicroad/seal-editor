import { describe, expect, test } from 'vitest';

import type { CustomNodeNamespace } from '../custom-node-types';
import { type MigrationChain, migrateGraph } from '../migrate-graph';

const customNode = (id: string, kind: string, expressions: unknown[], packVersion?: string) => ({
  id,
  type: 'customNode',
  name: id,
  content: {
    kind,
    config: {
      // 真实契约形状：CustomNodeExpression[] = { id, key, value }（value 为三形态之一）
      expressions: expressions.map((value, i) => ({ id: `${id}-e${i}`, key: kind, value })),
      ...(packVersion ? { __meta__: { packVersion } } : {}),
    },
  },
});

const schema: CustomNodeNamespace[] = [
  {
    type: 'namespace',
    name: 'http',
    title: 'http',
    tools: [
      {
        name: 'http_request',
        title: 'http_request',
        type: 'function',
        parameters: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string' } } },
        returns: { type: 'object' },
        namespace: 'http',
        kind: 'http',
      },
    ],
  } as CustomNodeNamespace,
];

describe('migrateGraph（轨道 B M5b：版本迁移器）', () => {
  const chain: MigrationChain = {
    kind: 'http_request',
    from: '0.7.0',
    describe: 'http_request 参数从 path 迁移为 url + method',
    migrate: (config) =>
      ({
        ...config!,
        expressions: (config!.expressions as Array<{ id: string; key: string; value: unknown }>).map((expr) =>
          Array.isArray(expr.value) && expr.value[0] === 'http_request'
            ? { ...expr, value: ['http_request', expr.value[1], 'GET'] }
            : expr,
        ),
      }) as typeof config,
  };

  test('有锚 + 有当前版本：链式执行迁移并推进锚，报告 migrated', () => {
    const graph = { nodes: [customNode('n1', 'http_request', [['http_request', '/p']], '0.6.0')] };
    const { graph: next, report } = migrateGraph({
      graph,
      schema,
      currentVersions: { http_request: '0.8.0' },
      chains: [chain],
    });

    expect(report).toEqual([{ nodeId: 'n1', kind: 'http_request', severity: 'migrated', message: chain.describe }]);
    const config = next.nodes![0].content!.config!;
    expect(config.__meta__!.packVersion).toBe('0.8.0');
    expect((config.expressions as Array<{ value: unknown }>)[0].value).toEqual(['http_request', '/p', 'GET']);
  });

  test('锚已最新：不执行迁移链，但绑定漂移仍报告（旧形状绑定 vs 当前契约）', () => {
    const graph = { nodes: [customNode('n1', 'http_request', [['http_request', '/p']], '0.8.0')] };
    const { report } = migrateGraph({ graph, schema, currentVersions: { http_request: '0.8.0' }, chains: [chain] });
    expect(report).toHaveLength(1);
    expect(report[0].severity).toBe('warning');
    expect(report[0].message).toContain('位置参数数不匹配');
  });

  test('缺锚存量图：validate-only（不迁移），报告警告', () => {
    const graph = { nodes: [customNode('n1', 'http_request', [['http_request', '/p']])] };
    const { graph: next, report } = migrateGraph({
      graph,
      schema,
      currentVersions: { http_request: '0.8.0' },
      chains: [chain],
    });

    expect(next.nodes![0].content!.config!.expressions).toHaveLength(1);
    expect(report.some((r) => r.severity === 'warning' && r.message.includes('validate-only'))).toBe(true);
    expect(report.some((r) => r.severity === 'warning' && r.message.includes('位置参数数不匹配'))).toBe(true);
  });

  test('绑定漂移：位置参数数不匹配 → warning；函数不在目录 → error', () => {
    const graph = {
      nodes: [
        customNode('a', 'http_request', [['http_request', '/p', 'GET', 'extra']]),
        customNode('b', 'UDF', [['gone_fn', 'x']]),
      ],
    };
    const { report } = migrateGraph({ graph, schema });

    expect(report.some((r) => r.nodeId === 'a' && r.severity === 'warning' && r.message.includes('3 个'))).toBe(true);
    expect(report.some((r) => r.nodeId === 'b' && r.severity === 'error' && r.message.includes('gone_fn'))).toBe(true);
  });

  test('非 customNode 节点不进入报告', () => {
    const graph = { nodes: [{ id: 'in', type: 'inputNode', name: 'Request' }] };
    const { report } = migrateGraph({ graph, schema });
    expect(report).toHaveLength(0);
  });
});
