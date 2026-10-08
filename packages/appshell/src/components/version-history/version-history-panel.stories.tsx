import { type Meta, type StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';

import { type VersionHistoryEntry, VersionHistoryPanel } from './version-history-panel';

const meta: Meta<typeof VersionHistoryPanel> = {
  title: 'Appshell/VersionHistoryPanel',
  component: VersionHistoryPanel,
};

export default meta;

type Story = StoryObj<typeof VersionHistoryPanel>;

const entry = (revision: string, extra: Partial<VersionHistoryEntry> = {}): VersionHistoryEntry => ({
  revision,
  updatedAt: '2026-10-08T10:0' + revision + '0.000Z',
  ...extra,
});

const graphV1 = { nodes: [{ id: 'n1', type: 'decisionTableNode', name: 'Pricing' }], edges: [] };
const graphV2 = {
  nodes: [
    { id: 'n1', type: 'decisionTableNode', name: 'Pricing v2' },
    { id: 'n2', type: 'functionNode', name: 'Enrich' },
  ],
  edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }],
};

/** 行级差异视图（ADR-017 同批）：diffContents 喂相邻两版 JSON，展开条目出 unified patch */
export const WithLineDiff: Story = {
  render: () => (
    <div style={{ height: 560 }}>
      <VersionHistoryPanel
        open
        onOpenChange={() => {}}
        versions={[entry('v1'), entry('v2', { versionName: 'release' })]}
        currentRevision='v2'
        diffs={{
          v2: {
            addedNodes: [{ id: 'n2', name: 'Enrich' }],
            removedNodes: [],
            modifiedNodes: [{ id: 'n1', name: 'Pricing', fields: ['name'] }],
            addedEdges: [{ id: 'e1' }],
            removedEdges: [],
            modifiedEdges: [],
            unchanged: false,
          },
        }}
        diffContents={{
          v2: { before: JSON.stringify(graphV1, null, 2), after: JSON.stringify(graphV2, null, 2) },
        }}
        onRestore={() => {}}
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    // Sheet 门户内容挂在 #storybook-root 之外，test-runner 的 testing-library
    // 管道跨 portal 不可靠——断言用原生 querySelector + waitFor 轮询；
    // interactions 自动跑可能与 play 竞争展开态——点击须幂等（已展开则跳过）
    const doc = canvasElement.ownerDocument;
    await waitFor(() => {
      const toggle = doc.querySelector('button[aria-expanded="false"]');
      if (toggle) (toggle as HTMLElement).click();
      if (!doc.querySelector('[data-testid="vh-line-diff"]')) {
        throw new Error('vh-line-diff not ready');
      }
      // 头部徽标（parseUnifiedDiff 计数）与变更行同屏
      const diff = doc.querySelector('[data-testid="vh-line-diff"]');
      expect(diff?.textContent).toContain('graph.json');
      expect(diff?.textContent).toContain('Enrich');
    });
  },
};

/** 两版无行级差异（结构摘要仍非 unchanged）→ noLineChanges 提示 */
export const NoLineChanges: Story = {
  render: () => {
    const same = JSON.stringify(graphV1, null, 2);
    return (
      <div style={{ height: 480 }}>
        <VersionHistoryPanel
          open
          onOpenChange={() => {}}
          versions={[entry('v1'), entry('v2')]}
          diffs={{
            v2: {
              addedNodes: [],
              removedNodes: [],
              modifiedNodes: [],
              addedEdges: [],
              removedEdges: [],
              modifiedEdges: [],
              unchanged: false,
            },
          }}
          diffContents={{ v2: { before: same, after: same } }}
          onRestore={() => {}}
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    await waitFor(() => {
      const toggle = doc.querySelector('button[aria-expanded="false"]');
      if (toggle) (toggle as HTMLElement).click();
      if (!doc.body?.textContent?.includes('No line-level changes')) {
        throw new Error('noLineChanges hint not ready');
      }
    });
  },
};
