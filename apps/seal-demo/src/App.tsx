import { SkinnedDecisionGraph, ThemeContextProvider, createExecuteSimulate } from '@republicroad/seal-appshell';
import {
  DecisionGraph,
  type DecisionGraphType,
  GraphSimulator,
  JdmConfigProvider,
  type Simulation,
} from '@republicroad/seal-editor';
import React, { useMemo, useState } from 'react';

import { DEFAULT_REQUEST, DEMO_MODEL } from './demo-model';

type ExecuteOk = { result: unknown; performance: string; trace?: Record<string, never> };
type ExecuteError = { error: string; details?: string };

const EXECUTE_URL = 'http://localhost:8787/v1/execute';

/** Kernel-tab engine: POST demo-server /v1/execute and map onto the kernel Simulation shape. */
const execute = async (graph: unknown, input: unknown): Promise<Simulation> => {
  try {
    const response = await fetch(EXECUTE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: graph, input, trace: true }),
    });
    const body = (await response.json()) as ExecuteOk & ExecuteError;
    if (!response.ok) {
      return { error: { code: 'EXEC_ERROR', title: body.error, message: body.details, data: {} } };
    }
    return {
      result: {
        performance: body.performance,
        result: body.result,
        snapshot: graph as never,
        trace: (body.trace ?? {}) as never,
      },
    };
  } catch (e) {
    return { error: { code: 'SERVER_DOWN', title: 'demo-server unreachable', message: String(e), data: {} } };
  }
};

const KernelTab: React.FC = () => {
  const [value, setValue] = useState<DecisionGraphType>(DEMO_MODEL);
  const [simulate, setSimulate] = useState<Simulation>();

  const panels = useMemo(
    () => [
      {
        id: 'simulator',
        title: 'Simulator',
        icon: '▶',
        hideHeader: true,
        renderPanel: () => (
          <GraphSimulator
            defaultRequest={DEFAULT_REQUEST}
            onRun={({ graph, context }) => {
              void execute(graph, context).then(setSimulate);
            }}
            onClear={() => setSimulate(undefined)}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 'none', padding: '4px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type='button'
          onClick={() =>
            setSimulate({
              error: {
                code: 'EVAL_ERROR',
                title: 'Expression evaluation failed',
                message: 'Undefined variable: customer.risk (R7 badge demo)',
                data: { nodeId: 'sw-1' },
              },
            })
          }
        >
          Inject EVAL_ERROR badge (R7)
        </button>
        <button type='button' onClick={() => setSimulate(undefined)}>
          Clear
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DecisionGraph value={value} onChange={setValue} panels={panels} simulate={simulate} />
      </div>
    </div>
  );
};

const ShellTab: React.FC = () => {
  const [value, setValue] = useState<DecisionGraphType>(DEMO_MODEL);

  return (
    <ThemeContextProvider>
      {/* simulateHandler: appshell's ready-made demo-server adapter (shell/execute-simulate) */}
      <SkinnedDecisionGraph
        value={value}
        onChange={setValue}
        simulateHandler={createExecuteSimulate('http://localhost:8787')}
      />
    </ThemeContextProvider>
  );
};

export const App: React.FC = () => {
  const [tab, setTab] = useState<'kernel' | 'shell'>('kernel');

  return (
    <JdmConfigProvider>
      <div className='seal-root seal-demo'>
        <div className='seal-demo__bar'>
          <button
            type='button'
            className='seal-demo__tab'
            data-active={tab === 'kernel'}
            onClick={() => setTab('kernel')}
          >
            Kernel — DecisionGraph
          </button>
          <button
            type='button'
            className='seal-demo__tab'
            data-active={tab === 'shell'}
            onClick={() => setTab('shell')}
          >
            Shell — SkinnedDecisionGraph
          </button>
          <span className='seal-demo__hint'>
            consumed from npm @1.4.0 · R6 auto-layout in the sidebar · R4 path-name on switch cases · engine: `pnpm
            demo-server` on :8787
          </span>
        </div>
        <div className='seal-demo__stage'>{tab === 'kernel' ? <KernelTab /> : <ShellTab />}</div>
      </div>
    </JdmConfigProvider>
  );
};
