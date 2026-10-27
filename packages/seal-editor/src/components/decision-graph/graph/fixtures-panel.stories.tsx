import { type Meta, type StoryObj } from '@storybook/react-vite';
import React, { useEffect } from 'react';
import { expect, fireEvent, waitFor, within } from 'storybook/test';

import { writeRequestInputContract } from '../../../helpers/request-schema';
import { DecisionGraphProvider, useDecisionGraphActions, useDecisionGraphRaw } from '../context/dg-store.context';
import type { DecisionGraphType, DecisionNode, FixturesRunner } from '../index';
import { FixturesPanel } from '../index';

const meta: Meta<typeof FixturesPanel> = {
  title: 'Decision Graph/Input Node/FixturesPanel',
  component: FixturesPanel,
};

export default meta;

type Story = StoryObj<typeof FixturesPanel>;

const buildGraph = (
  examples: Array<{ name: string; data: Record<string, unknown>; expectation?: unknown }>,
): DecisionGraphType => {
  const content: Record<string, any> = {};
  writeRequestInputContract(content, {
    contractVersion: 1,
    schema: { type: 'object', properties: { customer: { type: 'string' } } },
    examples: examples.map((example, index) => ({
      id: `ex-${index + 1}`,
      name: example.name,
      data: example.data,
      ...(example.expectation ? { expectation: example.expectation as { mode: 'deep'; value: unknown } } : {}),
    })),
  });

  const inputNode: DecisionNode = {
    id: 'in-1',
    name: 'Request',
    type: 'inputNode',
    position: { x: 0, y: 0 },
    content,
  };

  return { nodes: [inputNode], edges: [] };
};

/** Harness 捕获的 store 句柄（play 断言用） */
let harness: {
  actions: ReturnType<typeof useDecisionGraphActions>;
  stateStore: ReturnType<typeof useDecisionGraphRaw>['stateStore'];
} | null = null;

/** 装载图 + 注入 runner 的探针：把 store 句柄暴露给 play 断言 */
const Harness: React.FC<{ graph: DecisionGraphType; runner: FixturesRunner }> = ({ graph, runner }) => {
  const graphActions = useDecisionGraphActions();
  const { stateStore } = useDecisionGraphRaw();

  useEffect(() => {
    harness = { actions: graphActions, stateStore };
    graphActions.setDecisionGraph(graph);
    graphActions.setFixturesRunner(runner);
  }, []);

  return <FixturesPanel />;
};

const renderPanel = (graph: DecisionGraphType, runner: FixturesRunner) => (
  <DecisionGraphProvider>
    <div style={{ height: 420 }}>
      <Harness graph={graph} runner={runner} />
    </div>
  </DecisionGraphProvider>
);

/**
 * 分层断言演示 runner（非透传 mock）：actual = 用例输入本身；deep 期望与
 * actual 深比对 → 通过 / 断言失败（actual 随结果回填供差异展开）。无期望 = 冒烟。
 */
const layeredDemoRunner: FixturesRunner = async (_graph, fixtures) => {
  const results = fixtures.map((fixture) => {
    const actual = fixture.input;
    if (fixture.expect?.mode === 'deep') {
      const ok = JSON.stringify(fixture.expect.value) === JSON.stringify(actual);
      return {
        name: fixture.name,
        passed: ok,
        outcome: (ok ? 'passed' : 'assertion-failed') as 'passed' | 'assertion-failed',
        actual,
        durationMs: 10,
      };
    }
    return { name: fixture.name, passed: true, outcome: 'passed' as const, actual, durationMs: 6 };
  });

  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
};

export const ReadyAndRun: Story = {
  render: () =>
    renderPanel(
      buildGraph([
        {
          name: '期望命中',
          data: { customer: 'GOLD' },
          expectation: { mode: 'deep', value: { customer: 'GOLD' } },
        },
        {
          name: '期望落空',
          data: { customer: 'SILVER' },
          expectation: { mode: 'deep', value: { customer: 'PLATINUM' } },
        },
        { name: '未设期望', data: { customer: 'GOLD' } },
      ]),
      layeredDemoRunner,
    ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await waitFor(() => expect(canvas.getByText('Request')).not.toBeNull());
    const runButton = canvas.getByRole('button', { name: 'Run all' });
    expect(runButton).not.toBeNull();

    // 注意力跟随动作：点击 → running → 报告矩阵（三态分家：断言通过/断言失败/冒烟）
    await fireEvent.click(runButton);
    await waitFor(() => expect(canvas.getAllByText('期望命中').length).toBeGreaterThan(0));
    await waitFor(() => expect(canvas.getAllByText('passed').length).toBeGreaterThan(0));
    expect(canvas.getAllByText('assertion failed').length).toBeGreaterThan(0);
    expect(canvas.getAllByText('smoke').length).toBeGreaterThan(0);
    // 期望计数徽章：2/3
    expect(canvas.getByTestId('fixtures-expectation-count').textContent).toContain('2/3');

    // B1 差异展开：断言失败行 → 期望（PLATINUM）vs 实际（SILVER）对照
    const diffButton = canvas.getAllByText('Diff')[0]!;
    await fireEvent.click(diffButton);
    await waitFor(() => expect(canvas.getByTestId('expectation-diff')).not.toBeNull());
    expect(canvas.getByTestId('expectation-diff').textContent).toContain('PLATINUM');
    expect(canvas.getByTestId('expectation-diff').textContent).toContain('SILVER');

    // B2 期望编辑器：三模式弹层挂载
    await fireEvent.click(canvas.getAllByText('Expected')[0]!);
    await waitFor(() => expect(canvas.getByTestId('expectation-editor')).not.toBeNull());

    // 调试下钻：装载该示例到 simulator（传选择不传状态）
    const debugButtons = canvas.getAllByText('Debug');
    await fireEvent.click(debugButtons[0]!);
    await waitFor(() => {
      expect(harness?.stateStore.getState().simulatorExampleBinding?.nodeId).toBe('in-1');
    });
    expect(harness!.stateStore.getState().simulatorRequest).toContain('GOLD');
  },
};

export const NoExamples: Story = {
  render: () => renderPanel(buildGraph([]), async () => ({ passed: 0, failed: 0, results: [] })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('The input node has no examples yet')).not.toBeNull();
    const runButton = canvas.getByRole('button', { name: 'Run all' });
    expect((runButton as HTMLButtonElement).disabled).toBe(true);
  },
};

export const NoInputNode: Story = {
  render: () => renderPanel({ nodes: [], edges: [] }, async () => ({ passed: 0, failed: 0, results: [] })),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText('No input node in this graph')).not.toBeNull();
  },
};
