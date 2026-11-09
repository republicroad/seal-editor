import type { DecisionGraphRef } from '@republicroad/seal-editor';
import { type Meta, type StoryObj } from '@storybook/react-vite';

import { DefaultShellHeader } from './default-shell-header';

const meta: Meta<typeof DefaultShellHeader> = {
  title: 'Appshell/DefaultShellHeader',
  component: DefaultShellHeader,
  // 独立渲染无 .seal-root 祖先（皮肤 token 未定义）——补底色便于验收
  decorators: [
    (Story) => (
      <div className='seal-root h-full' data-mode='light'>
        <Story />
      </div>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof DefaultShellHeader>;

const graph = {
  enabled: true,
  nodes: [
    { id: 'n1', type: 'inputNode', position: { x: 0, y: 0 }, name: 'Input' },
    { id: 'n2', type: 'functionNode', position: { x: 200, y: 0 }, name: 'Enrich' },
  ],
  edges: [{ id: 'e1', sourceId: 'n1', targetId: 'n2' }],
};

const graphRef = {
  setActivePanel: () => {},
  serialize: () => graph,
} as unknown as DecisionGraphRef;

/** navbar-5 全形态：back + Switch + 标题 + History + Test Run 主钮 + more 全菜单 */
export const Full: Story = {
  render: () => (
    <DefaultShellHeader
      graph={graph}
      graphRef={graphRef}
      onEnabledChange={() => {}}
      onBack={() => window.alert('宿主返回导航')}
      title='Loan Approval'
      onOpenHistory={() => window.alert('宿主 version-history 入口')}
      onTestRun={() => window.alert('独立使用：宿主自定义 run 动作（完整链路见 Integration/DefaultHeaderNavbar5）')}
      onDuplicate={() => window.alert('宿主 Duplicate 语义')}
      onDelete={() => window.alert('宿主 Delete 语义')}
      syncBadge={<span className='text-xs text-muted-foreground'>Saved</span>}
    />
  ),
};

/** 最小形态：仅 Switch + Test Run（无宿主导航/历史/治理回调） */
export const Minimal: Story = {
  render: () => <DefaultShellHeader graph={graph} graphRef={graphRef} onTestRun={() => {}} />,
};

/** 只读禁用态：disabled 全局 + Switch 只读 + Test Run 不可用 */
export const ReadOnly: Story = {
  render: () => <DefaultShellHeader graph={graph} graphRef={graphRef} disabled />,
};

/** enabled=false：Switch 关闭态回显 */
export const DisabledGraph: Story = {
  render: () => (
    <DefaultShellHeader graph={{ ...graph, enabled: false }} graphRef={graphRef} onEnabledChange={() => {}} />
  ),
};
