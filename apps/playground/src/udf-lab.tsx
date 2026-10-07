import { CodeBlock } from '#components/reui/code-block/code-block';
import {
  type CustomFunctionTool,
  type DecisionGraphRef,
  EditorShellProvider,
  FunctionCatalog,
  FunctionRepl,
  type GraphPersistenceAdapter,
  type ReplExecuteResult,
  SkinnedDecisionGraph,
  createExecuteSimulate,
  createIndexedDbAdapter,
  useEditorShell,
} from '@republicroad/seal-appshell';
import { LinkIcon, SquareTerminalIcon } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { InstanceShell } from './shared/instance-shell';
import { TrustChainPanel } from './shared/trust-chain-panel';
import { udfFixtures } from './shared/udf-fixtures';

const DEMO_SERVER = import.meta.env.VITE_DEMO_SERVER_URL ?? 'http://localhost:8787';
/** 画布图独立 GRAPH_ID：不与 graph 实例的 playground-graph 版本线互相覆盖 */
const GRAPH_ID = 'udf-lab-graph';
const adapter: GraphPersistenceAdapter = createIndexedDbAdapter();

const UdfLabBody: React.FC = () => {
  const { customNodes, schema, ready, runSimulate } = useEditorShell();
  const [graph, setGraph] = useState<any>(udfFixtures[0]?.model);
  const [activeFixture, setActiveFixture] = useState<string>(udfFixtures[0]?.id ?? '');
  const [status, setStatus] = useState('');
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [replToolName, setReplToolName] = useState<string | undefined>(undefined);
  const graphRef = useRef<DecisionGraphRef>(null);
  // 底部 Trust/REPL 已注册为 kernel panels 底部 dock（批 10）——收起条退役

  // demo-server 健康探针：schema 拉取失败会在 appshell 内静默回退内置样例，
  // 这里显式探测可达性，避免"面板有节点但一执行就失败"的困惑
  useEffect(() => {
    let cancelled = false;
    fetch(`${DEMO_SERVER}/healthz`)
      .then((res) => {
        if (!cancelled) setServerUp(res.ok);
      })
      .catch(() => {
        if (!cancelled) setServerUp(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFixture = udfFixtures.find((f) => f.id === activeFixture) ?? udfFixtures[0];

  const loadFixture = useCallback((id: string) => {
    const fixture = udfFixtures.find((f) => f.id === id);
    if (!fixture) return;
    setGraph(fixture.model);
    setActiveFixture(fixture.id);
    setStatus(`已载入样例：${fixture.label}`);
  }, []);

  // 轨道 B（A1）：目录一键插入——customNode 序列化契约与夹具一致
  // （expressions: key=函数名，value=位置绑定 udf名;;参数名…）
  const insertTool = useCallback((tool: CustomFunctionTool) => {
    setGraph((g: any) => {
      const nodes = g?.nodes ?? [];
      const paramNames = Object.keys(tool.parameters?.properties ?? {});
      const value = paramNames.length ? [tool.name, ...paramNames].join(';;') : tool.name;
      const node = {
        id: crypto.randomUUID(),
        type: 'customNode',
        position: { x: 320, y: 140 + (nodes.length % 6) * 40 },
        name: tool.title ?? tool.name,
        content: {
          kind: 'UDF',
          config: { expressions: [{ id: crypto.randomUUID(), key: tool.name, value }] },
        },
      };
      return { ...g, nodes: [...nodes, node] };
    });
    setCatalogOpen(false);
    setStatus(`已插入 ${tool.name}（连好输入后执行）`);
  }, []);

  // 轨道 B（A3）：目录「试运行」→ REPL 页签预选（onTry 槽位在 A1 已预留）
  const onTryTool = useCallback((tool: CustomFunctionTool) => {
    setReplToolName(tool.name);
    setCatalogOpen(false);
    // 批 13：直通口打开 REPL 面板（ref = store actions 门面）
    graphRef.current?.setActivePanel('repl');
  }, []);

  // A3：demo-server 单函数执行通道（POST /v1/functions/:name/execute）
  const replExecute = useCallback(async (name: string, args: unknown[]): Promise<ReplExecuteResult> => {
    const res = await fetch(`${DEMO_SERVER}/v1/functions/${encodeURIComponent(name)}/execute`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args }),
    });
    const body = await res.json().catch(() => ({ error: 'non-JSON response' }));
    if (!res.ok) {
      const details = Array.isArray(body.details) ? `: ${body.details.join('; ')}` : '';
      throw new Error(String(body.error ?? 'execute failed') + details);
    }
    return body as ReplExecuteResult;
  }, []);

  // 批次一（code-block）：REPL 结果 JSON 高亮（宿主注入渲染插槽）
  const replResultRenderer = useCallback((result: unknown) => {
    return <CodeBlock code={JSON.stringify(result, null, 2)} language='json' variant='ghost' maxLines={20} />;
  }, []);

  const currentRevision = (graph as { revision?: string }).revision;
  const save = useCallback(async () => {
    try {
      // GraphRecord 契约：图文档放 content，meta 平铺 record 顶层
      const { id: _id, revision: _rev, ...doc } = graph;
      const { revision } = await adapter.save(
        { id: GRAPH_ID, name: 'udf-lab', content: doc },
        {
          baseRevision: currentRevision,
        },
      );
      setStatus(`saved ${revision}`);
      setGraph((g: any) => ({ ...g, revision }));
    } catch (err) {
      setStatus(`save failed: ${String(err).slice(0, 80)}`);
    }
  }, [graph, currentRevision]);

  return (
    <InstanceShell
      title='Custom Nodes'
      banner={
        serverUp === false ? (
          <span className='pg-server-down'>
            demo-server 不可达（:8787）—— 自定义节点 schema 已回退内置样例，执行类功能不可用
          </span>
        ) : undefined
      }
      actions={
        <>
          {udfFixtures.map((fixture) => (
            <button
              key={fixture.id}
              className={activeFixture === fixture.id ? 'pg-active' : ''}
              onClick={() => loadFixture(fixture.id)}
              title={fixture.description}
            >
              {fixture.label}
            </button>
          ))}
          <button onClick={() => void save()}>Save (IndexedDB)</button>
          <button onClick={() => setCatalogOpen(true)}>函数目录</button>
          <span className='pg-status'>{status}</span>
        </>
      }
    >
      <SkinnedDecisionGraph
        value={graph}
        onChange={setGraph}
        customNodes={ready ? customNodes : []}
        simulateHandler={runSimulate}
        panels={[
          {
            id: 'trust',
            title: 'Trust Chain',
            icon: <LinkIcon className='size-4' />,
            renderPanel: () => (
              // key = 夹具 id：切换夹具时重挂载面板，默认输入随夹具走
              <TrustChainPanel key={activeFixture} model={graph} defaultInput={currentFixture?.inputText} />
            ),
          },
          {
            id: 'repl',
            title: 'REPL',
            icon: <SquareTerminalIcon className='size-4' />,
            renderPanel: () => (
              <FunctionRepl
                schema={schema ?? []}
                execute={replExecute}
                initialToolName={replToolName}
                renderResult={replResultRenderer}
              />
            ),
          },
        ]}
      />
      <FunctionCatalog
        schema={schema}
        open={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onInsert={insertTool}
        onTry={onTryTool}
      />
    </InstanceShell>
  );
};

/**
 * Custom Nodes 实例（MPA 入口 udf.html）：editor 项目 decision-simple 页的缩小复刻。
 * EditorShellProvider 四项 options 在仓内的演示消费面：schemaSource（demo-server 端点）、
 * simulate（远程全链路执行）、persistence（IndexedDB）、authAdapter（固定演示用户）。
 */
export const UdfLab: React.FC = () => (
  <EditorShellProvider
    options={{
      schemaSource: `${DEMO_SERVER}/v1/custom-nodes/schema`,
      simulate: createExecuteSimulate(DEMO_SERVER),
      persistence: createIndexedDbAdapter(),
      authAdapter: async () => ({ userId: 'demo-user', displayName: 'Demo User' }),
    }}
  >
    <UdfLabBody />
  </EditorShellProvider>
);
