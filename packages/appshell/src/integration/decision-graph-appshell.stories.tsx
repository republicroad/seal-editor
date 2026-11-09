import { DecisionGraph, type DecisionGraphType, type Simulation } from '@republicroad/seal-editor';
import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useState } from 'react';

import { SkinnedDecisionGraph } from '../components/skinned-decision-graph';
import { useCustomNodes } from '../hooks/useCustomNodes';
import type { GraphPersistenceAdapter, GraphRecord } from '../shell/persistence';
import type { SimulateHandler } from '../shell/types';

/**
 * Cross-package integration: kernel DecisionGraph + appshell custom nodes
 * (useCustomNodes) + an in-memory GraphPersistenceAdapter — the scheme D
 * kernel/shell contract exercised end to end.
 */
const meta: Meta = {
  title: 'Integration/Kernel + Appshell',
  parameters: {
    controls: { disable: true },
    docs: { disable: true },
  },
};

export default meta;

type Story = StoryObj;

const memoryStore = new Map<string, { record: GraphRecord; revision: string; versions: string[] }>();

const persistence: GraphPersistenceAdapter = {
  async list() {
    return [...memoryStore.entries()].map(([id, v]) => ({
      id,
      name: (v.record.name as string) ?? id,
      revision: v.revision,
    }));
  },
  async load(id: string) {
    const hit = memoryStore.get(id);
    if (!hit) return null;
    return {
      id,
      name: (hit.record.name as string) ?? id,
      revision: hit.revision,
      content: hit.record,
    };
  },
  async save(record: GraphRecord, opts?: { baseRevision?: string }) {
    const id = record.id ?? 'graph-1';
    const hit = memoryStore.get(id);
    if (opts?.baseRevision && hit && hit.revision !== opts.baseRevision) {
      throw new Error('CONFLICT');
    }
    const revision = `r${(hit?.versions.length ?? 0) + 1}`;
    const versions = [...(hit?.versions ?? []), revision];
    memoryStore.set(id, { record, revision, versions });
    return { id, revision };
  },
  async delete(id: string) {
    return memoryStore.delete(id);
  },
  async listVersions(id: string) {
    return (memoryStore.get(id)?.versions ?? []).map((revision) => ({ revision }));
  },
};

const IntegrationGraph: React.FC = () => {
  const { customNodes, ready } = useCustomNodes();
  const [graph, setGraph] = useState<DecisionGraphType>(() => ({
    id: 'integration-demo',
    name: 'integration-demo',
    nodes: [
      { id: 'in-1', type: 'inputNode', position: { x: 60, y: 220 }, name: 'Request' },
      { id: 'out-1', type: 'outputNode', position: { x: 700, y: 220 }, name: 'Response' },
    ],
    edges: [],
  }));
  void persistence;

  if (!ready) {
    return <div style={{ padding: 24 }}>loading custom nodes…</div>;
  }

  return (
    <div style={{ height: '100%' }}>
      <DecisionGraph value={graph} customNodes={customNodes} onChange={(next) => setGraph(next)} />
    </div>
  );
};

export const KernelPlusAppshell: Story = {
  render: () => <IntegrationGraph />,
};

/** 离线假 handler：footer 演示不依赖后端，Run 出空结果即可 */
const offlineSimulate: SimulateHandler = async () => ({ simulation: { result: {} } as Simulation });

/** ADR-008 L3 演示：仿真面板底部宿主条——verdict 的「在调试页打开」联动入口（/debug?ws=&model=） */
const SimulatorFooterGraph: React.FC = () => {
  const { customNodes, ready } = useCustomNodes();

  if (!ready) {
    return <div style={{ padding: 24 }}>loading custom nodes…</div>;
  }

  return (
    <SkinnedDecisionGraph
      value={{ nodes: [], edges: [] }}
      customNodes={customNodes}
      onChange={() => {}}
      simulateHandler={offlineSimulate}
      simulationFooter={
        <a
          href='/debug?ws=demo&model=footer-demo'
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 12,
            color: 'var(--seal-color-primary)',
          }}
        >
          在调试页打开 →
        </a>
      }
    />
  );
};

export const SimulatorFooterHostEntry: Story = {
  render: () => <SimulatorFooterGraph />,
};

/** navbar-5 默认头部演示：defaultHeader opt-in——back + enabled Switch + History + Test Run 主钮 + more 菜单 */
const DefaultHeaderGraph: React.FC = () => {
  const { customNodes, ready } = useCustomNodes();
  const [graph, setGraph] = useState<DecisionGraphType>(() => ({
    enabled: true,
    nodes: [
      { id: 'in-1', type: 'inputNode', position: { x: 60, y: 220 }, name: 'Request' },
      { id: 'out-1', type: 'outputNode', position: { x: 700, y: 220 }, name: 'Response' },
    ],
    edges: [],
  }));

  if (!ready) {
    return <div style={{ padding: 24 }}>loading custom nodes…</div>;
  }

  return (
    <SkinnedDecisionGraph
      value={graph}
      customNodes={customNodes}
      onChange={(next) => setGraph(next)}
      simulateHandler={offlineSimulate}
      defaultHeader
      onBack={() => window.history.back()}
      headerTitle='navbar-5 Demo'
      onOpenHistory={() => window.alert('宿主 version-history 入口（数据属宿主 persistence）')}
      onDuplicate={() => window.alert('宿主 Duplicate 语义')}
      onDelete={() => window.alert('宿主 Delete 语义（已过 AlertDialog 确认）')}
    />
  );
};

export const DefaultHeaderNavbar5: Story = {
  render: () => <DefaultHeaderGraph />,
};
