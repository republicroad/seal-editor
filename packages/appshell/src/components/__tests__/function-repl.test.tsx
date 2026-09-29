// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { CustomNodeNamespace } from '../../lib/custom-node-types';
import { FunctionRepl } from '../function-repl/function-repl';

afterEach(cleanup);

const schema: CustomNodeNamespace[] = [
  {
    type: 'namespace',
    name: 'roster',
    title: 'roster 名单',
    tools: [
      {
        name: 'roster',
        title: '名单查询',
        type: 'function',
        description: '按名单名称查值',
        parameters: {
          type: 'object',
          properties: { roster: { type: 'string', description: '名单名称' }, value: { type: 'string' } },
          required: ['roster', 'value'],
        },
        returns: { type: 'boolean' },
        namespace: 'roster',
        kind: 'roster',
      },
      {
        name: 'legacy_hash',
        title: '旧版摘要',
        type: 'function',
        deprecated: { since: '0.6.0', note: '请改用 crypto' },
        parameters: { type: 'object', properties: {} },
        returns: { type: 'string' },
        namespace: 'roster',
        kind: 'roster',
      },
    ],
  },
] as CustomNodeNamespace[];

describe('FunctionRepl（轨道 B A3）', () => {
  test('schema 驱动参数表单：执行时按序组装解析后的 args', async () => {
    const execute = vi.fn().mockResolvedValue({ result: { hit: true }, micros: 94, kwargs: {} });
    render(<FunctionRepl schema={schema} execute={execute} />);

    fireEvent.change(screen.getByLabelText('参数 roster'), { target: { value: 'demo_block' } });
    fireEvent.change(screen.getByLabelText('参数 value'), { target: { value: '1.2.3.4' } });
    fireEvent.click(screen.getByRole('button', { name: '执行' }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith('roster', ['demo_block', '1.2.3.4']));
    await waitFor(() => expect(screen.getByTestId('repl-result').textContent).toContain('hit'));
  });

  test('number 解析 + 类型错误客户端拦截（不发起执行）', async () => {
    const execute = vi.fn();
    const numericSchema = [
      {
        type: 'namespace',
        name: 'calc',
        title: 'calc',
        tools: [
          {
            name: 'add',
            title: 'add',
            type: 'function',
            parameters: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
            returns: { type: 'number' },
            namespace: 'calc',
            kind: 'calc',
          },
        ],
      },
    ] as CustomNodeNamespace[];
    render(<FunctionRepl schema={numericSchema} execute={execute} />);

    fireEvent.change(screen.getByLabelText('参数 x'), { target: { value: 'not-a-number' } });
    fireEvent.click(screen.getByRole('button', { name: '执行' }));

    expect(screen.getByText(/数字无法解析/)).toBeDefined();
    expect(execute).not.toHaveBeenCalled();
  });

  test('initialToolName 预选 + 弃用 note 展示', () => {
    render(<FunctionRepl schema={schema} execute={vi.fn()} initialToolName='legacy_hash' />);
    const select = screen.getByLabelText('REPL 函数选择') as HTMLSelectElement;
    expect(select.value).toBe('legacy_hash');
    expect(screen.getByText(/请改用 crypto/)).toBeDefined();
  });

  test('serverError 展示；冷启动徽标在首调大耗时后出现', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ result: 'ok', micros: 50_100, kwargs: {} });
    render(<FunctionRepl schema={schema} execute={execute} initialToolName='roster' />);

    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    await waitFor(() => expect(screen.getByText(/boom/)).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: '执行' }));
    await waitFor(() => expect(screen.getByText(/冷启动/)).toBeDefined());
  });
});
