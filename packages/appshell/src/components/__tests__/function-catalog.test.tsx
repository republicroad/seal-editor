// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CustomNodeNamespace } from '../../lib/custom-node-types';
import { FunctionCatalog } from '../function-catalog/function-catalog';

afterEach(cleanup);

const schema: CustomNodeNamespace[] = [
  {
    type: 'namespace',
    name: 'crypto',
    title: 'crypto 加解密',
    description: '编解码域',
    meta: { origin: 'reference', version: '0.9.0', license: 'oss' },
    tools: [
      {
        name: 'legacy_hash',
        title: '旧版摘要',
        type: 'function',
        description: 'sha1 摘要',
        deprecated: { since: '0.6.0', note: '请改用 crypto 函数' },
        parameters: {
          type: 'object',
          properties: { input: { type: 'string', description: '原文' } },
          required: ['input'],
        },
        returns: { type: 'string' },
        namespace: 'crypto',
        kind: 'crypto',
      },
      {
        name: 'crypto',
        title: '加解密',
        type: 'function',
        parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'] },
        returns: { type: 'string' },
        namespace: 'crypto',
        kind: 'crypto',
      },
    ],
  },
  {
    type: 'namespace',
    name: 'http',
    title: 'http 出网',
    meta: { origin: 'industry', version: '0.9.0', license: 'proprietary' },
    tools: [
      {
        name: 'http_request',
        title: 'HTTP 请求',
        type: 'function',
        parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
        returns: { type: 'object' },
        namespace: 'http',
        kind: 'http',
      },
    ],
  },
] as CustomNodeNamespace[];

describe('FunctionCatalog（轨道 B A1 产品化）', () => {
  test('namespace 分组渲染 + 签名/参数/返回', () => {
    render(<FunctionCatalog schema={schema} open onClose={vi.fn()} onInsert={vi.fn()} />);

    expect(screen.getByText('crypto 加解密')).toBeDefined();
    expect(screen.getByText('http 出网')).toBeDefined();
    expect(screen.getByText(/legacy_hash\(input\)/)).toBeDefined();
    expect(screen.getAllByText(/返回: string/).length).toBe(2);
  });

  test('A4：弃用工具整卡警示（徽章 + note 行）', () => {
    render(<FunctionCatalog schema={schema} open onClose={vi.fn()} onInsert={vi.fn()} />);

    expect(screen.getByText(/已弃用 0\.6\.0/)).toBeDefined();
    expect(screen.getByText(/⚠ 请改用 crypto 函数/)).toBeDefined();
  });

  test('搜索过滤', () => {
    render(<FunctionCatalog schema={schema} open onClose={vi.fn()} onInsert={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText('搜索函数 / 描述…'), { target: { value: 'legacy' } });

    expect(screen.getByText(/legacy_hash/)).toBeDefined();
    expect(screen.queryByText(/HTTP 请求/)).toBeNull();
  });

  test('ADR-009 #3：origin 徽标（参考域/行业包，license 入 title）', () => {
    render(<FunctionCatalog schema={schema} open onClose={vi.fn()} onInsert={vi.fn()} />);

    expect(screen.getByText('参考域')).toBeDefined();
    expect(screen.getByText('行业包').getAttribute('title')).toContain('proprietary');
  });

  test('ADR-010 catalogFilter origin 维度：按 meta.origin 过滤', () => {
    render(
      <FunctionCatalog
        schema={schema}
        open
        onClose={vi.fn()}
        onInsert={vi.fn()}
        filter={({ origin }) => origin !== 'industry'}
      />,
    );

    expect(screen.queryByText('http 出网')).toBeNull();
    expect(screen.getByText('crypto 加解密')).toBeDefined();
  });

  test('ADR-010 catalogFilter：目录面过滤（http 域整组消失）', () => {
    render(
      <FunctionCatalog
        schema={schema}
        open
        onClose={vi.fn()}
        onInsert={vi.fn()}
        filter={({ namespace }) => namespace !== 'http'}
      />,
    );

    expect(screen.queryByText('http 出网')).toBeNull();
    expect(screen.getByText('crypto 加解密')).toBeDefined();
  });

  test('插入回调 + 空态', () => {
    const onInsert = vi.fn();
    render(<FunctionCatalog schema={schema} open onClose={vi.fn()} onInsert={onInsert} />);
    fireEvent.click(screen.getAllByText('插入画布')[0]);
    expect(onInsert).toHaveBeenCalledTimes(1);

    cleanup();
    render(<FunctionCatalog schema={[]} open onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByText('schema 未加载（目录端点不可达？）')).toBeDefined();
  });
});
