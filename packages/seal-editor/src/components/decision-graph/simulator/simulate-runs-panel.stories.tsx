import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, fireEvent, waitFor, within } from 'storybook/test';

import { type SimulateRunEntry } from '../context/dg-store.context';
import { SimulateRunsPanel } from './simulate-runs-panel';

const meta: Meta<typeof SimulateRunsPanel> = {
  title: 'Decision Graph/Simulator/SimulateRunsPanel',
  component: SimulateRunsPanel,
};

export default meta;

type Story = StoryObj<typeof SimulateRunsPanel>;

const run = (id: string, ok: boolean, result?: unknown): SimulateRunEntry => ({
  id,
  ts: '2026-10-07T08:30:0' + (ok ? '0' : '5') + '.000Z',
  ok,
  performance: ok ? '270.4µs' : undefined,
  error: ok ? undefined : 'E_HTTP: upstream 500',
  snapshot: (ok
    ? { result: { performance: '270.4µs', result, snapshot: {}, trace: {} } }
    : { error: { title: 'upstream 500', code: 'E_HTTP', data: {} } }) as never,
});

export const Empty: Story = {
  render: () => <SimulateRunsPanel runs={[]} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByText(/No runs yet/i)).toBeTruthy();
  },
};

export const WithRuns: Story = {
  render: () => (
    <div style={{ width: 480, height: 400 }}>
      <SimulateRunsPanel
        runs={[
          run('ok-1', true, { discount: { rate: 0.85 } }),
          run('err-1', false),
          run('ok-2', true, { discount: { rate: 0.9 } }),
        ]}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // 三条时间线 + 徽章形态
    expect(canvas.getAllByText('OK')).toHaveLength(2);
    expect(canvas.getByText('ERR')).toBeTruthy();
    expect(canvas.getByText('E_HTTP: upstream 500')).toBeTruthy();
    // 点行展开该次输出 JSON（回看不重跑）
    fireEvent.click(canvas.getAllByTestId('simulate-run-row')[0]);
    await waitFor(() => {
      expect(canvas.getByTestId('simulate-run-detail').textContent).toContain('0.85');
    });
    // code-block 懒 chunk 就绪：高亮 + 折叠 + copy 一体化渲染接管
    await waitFor(
      () => {
        expect(canvas.getByLabelText('Copy JSON')).toBeTruthy();
      },
      { timeout: 5000 },
    );
  },
};
