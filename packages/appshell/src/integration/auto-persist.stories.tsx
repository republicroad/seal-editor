import type { DecisionGraphType } from '@republicroad/seal-editor';
import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useRef, useState } from 'react';

import { SkinnedDecisionGraph } from '../components/skinned-decision-graph';
import { Button } from '../components/ui/button';
import { useCustomNodes } from '../hooks/useCustomNodes';
import type { AutoPersistController } from '../shell/auto-persist';
import { type GraphPersistenceAdapter, GraphPersistenceError, type GraphRecord } from '../shell/persistence';

/**
 * 模式 D 自动持久化端到端演示（docs/design/appshell-auto-persist.md）：
 * 编辑画布 → 防抖自动保存（右上 Saving…/Saved 徽标）；「模拟他端保存」抬走 head →
 * 下一轮保存 CONFLICT 停轮 → 三选（覆盖 / 另存副本 / 加载 head）。
 */
const meta: Meta = {
  title: 'Integration/AutoPersist',
  parameters: {
    controls: { disable: true },
    docs: { disable: true },
  },
};

export default meta;

type Story = StoryObj;

/** 内存版乐观锁适配器：baseRevision 不匹配 → GraphPersistenceError('CONFLICT') */
const createConflictMemoryAdapter = () => {
  const store = new Map<string, { record: GraphRecord; revision: string; versions: string[] }>();
  const adapter: GraphPersistenceAdapter = {
    async load(id) {
      const hit = store.get(id);
      return hit ? { ...hit.record, revision: hit.revision } : null;
    },
    async save(record, opts) {
      const id = record.id;
      const hit = store.get(id);
      if (opts?.baseRevision && hit && hit.revision !== opts.baseRevision) {
        throw new GraphPersistenceError('CONFLICT', `base ${opts.baseRevision} != head ${hit.revision}`);
      }
      const revision = `r${(hit?.versions.length ?? 0) + 1}`;
      store.set(id, { record, revision, versions: [...(hit?.versions ?? []), revision] });
      return { id, revision };
    },
    async listVersions(id) {
      return (store.get(id)?.versions ?? []).map((revision) => ({ revision, auto: true }));
    },
  };
  return {
    adapter,
    /** 模拟另一编辑者/tab 先保存——抬走 head，制造下一轮 CONFLICT */
    bumpRemoteHead: () => {
      const hit = store.get('auto-persist-demo');
      if (hit) {
        const revision = `r${hit.versions.length + 1}-remote`;
        store.set('auto-persist-demo', { ...hit, revision, versions: [...hit.versions, revision] });
      }
    },
    headRevision: () => store.get('auto-persist-demo')?.revision,
  };
};

const AutoPersistDemo: React.FC = () => {
  const { customNodes, ready } = useCustomNodes();
  const [graph, setGraph] = useState<DecisionGraphType>(() => ({
    id: 'auto-persist-demo',
    name: 'auto-persist-demo',
    nodes: [
      { id: 'in-1', type: 'inputNode', position: { x: 60, y: 220 }, name: 'Request' },
      { id: 'out-1', type: 'outputNode', position: { x: 700, y: 220 }, name: 'Response' },
    ],
    edges: [],
  }));
  const [banner, setBanner] = useState<'none' | 'conflict'>('none');
  const controllerRef = useRef<AutoPersistController | null>(null);
  const remote = useRef(createConflictMemoryAdapter());

  if (!ready) {
    return <div style={{ padding: 24 }}>loading custom nodes…</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 8, padding: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant='outline' size='sm' onClick={() => remote.current.bumpRemoteHead()}>
          模拟他端保存（抬走 head）
        </Button>
        <Button variant='outline' size='sm' onClick={() => controllerRef.current?.flush()}>
          立即保存
        </Button>
        {banner === 'conflict' && (
          <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
            <strong style={{ color: 'var(--seal-color-warning)' }}>CONFLICT</strong>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                controllerRef.current?.resolveConflict('overwrite');
                setBanner('none');
              }}
            >
              覆盖（我的胜出）
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                controllerRef.current?.resolveConflict('saveCopy');
                setBanner('none');
              }}
            >
              另存副本
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                controllerRef.current?.resolveConflict('loadHead');
                void remote.current.adapter.load('auto-persist-demo').then((record) => {
                  if (record) {
                    setGraph(record.content as DecisionGraphType);
                    controllerRef.current?.adopt({
                      baseRevision: remote.current.headRevision(),
                      snapshot: { content: record.content },
                    });
                  }
                });
                setBanner('none');
              }}
            >
              加载 head（对方胜出）
            </Button>
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <SkinnedDecisionGraph
          value={graph}
          customNodes={customNodes}
          onChange={(next) => setGraph(next)}
          autoPersist={{
            adapter: remote.current.adapter,
            documentId: 'auto-persist-demo',
            recordMeta: { name: 'auto-persist-demo' },
            baseRevision: remote.current.headRevision(),
            onEvent: (event) => {
              if (event.type === 'conflict') setBanner('conflict');
            },
            onController: (controller) => {
              controllerRef.current = controller;
            },
          }}
        />
      </div>
    </div>
  );
};

export const AutoPersistFlow: Story = {
  render: () => <AutoPersistDemo />,
};
