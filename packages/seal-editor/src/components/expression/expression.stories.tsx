import { VariableType } from '@gorules/zen-engine-wasm';
import type { Meta, StoryObj } from '@storybook/react-vite';
import React, { useEffect, useState } from 'react';
import { fn } from 'storybook/test';

import { ensureWasmLoaded } from '../../helpers/wasm';
import type { ExpressionEntry } from './context/expression-store.context';
import { Expression } from './expression';

const expressionDefault: ExpressionEntry[] = [
  { id: '1', key: 'customer.fullName', value: 'customer.firstName + " " + customer.lastName' },
  { id: '2', key: 'customer.isPremium', value: 'contains(customer.tags, "premium")' },
  { id: '3', key: 'customer.purchaseTotals', value: 'sum(map(customer.purchases, #.amount))' },
];

const meta: Meta<typeof Expression> = {
  /* 👇 The title prop is optional.
   * See https://storybook.js.org/docs/react/configure/overview#configure-story-loading
   * to learn how to generate automatic titles
   */
  title: 'Expression',
  component: Expression,
  args: {
    disabled: false,
    defaultValue: expressionDefault,
    onChange: fn(),
    permission: 'edit:full',
  },
  argTypes: {
    permission: {
      control: 'select',
      options: ['edit:full', 'edit:values', 'view'],
    },
    value: { table: { disable: true } },
    debug: { table: { disable: true }, control: false },
    inputVariableType: { table: { disable: true }, control: false },
  },
};

export default meta;

type Story = StoryObj<typeof Expression>;

const StoryWrapper: React.FC<React.PropsWithChildren<any>> = ({ children }) => (
  <div style={{ maxWidth: 900 }}>{children}</div>
);

export const Uncontrolled: Story = {
  render: (args) => {
    return (
      <StoryWrapper>
        <Expression {...args} />
      </StoryWrapper>
    );
  },
};

export const Controlled: Story = {
  render: (args) => {
    const [value, setValue] = useState(expressionDefault);

    return (
      <StoryWrapper>
        <Expression value={value} onChange={setValue} {...args} />
      </StoryWrapper>
    );
  },
};

// $ 误用提示 demo（zen-reference §1.5）：C1 静默丢行建议 / C3 行键同名三义。
// 需 wasm 就绪后构建 VariableType——提示面在缺 wasm 时静默关闭（宁漏勿误报）。
const dollarHintsDefault = [
  { id: '1', key: 'grandTotal', value: '$.tax * 2' },
  { id: '2', key: 'total', value: 'total + 1' },
  { id: '3', key: 'customerName', value: '$.customer.name' },
  { id: '4', key: 'purchaseCount', value: 'len(customer.purchases)' },
];

export const DollarHints: Story = {
  render: () => {
    const [inputVariableType, setInputVariableType] = useState<VariableType>();

    useEffect(() => {
      ensureWasmLoaded().then(() => {
        setInputVariableType(
          VariableType.fromJson({
            Object: { customer: { Object: {} }, total: { Object: {} }, tax: { Object: {} } },
          } as any),
        );
      });
    }, []);

    return (
      <StoryWrapper>
        <Expression
          inputVariableType={inputVariableType}
          defaultValue={dollarHintsDefault}
          onChange={fn()}
          permission='edit:full'
        />
      </StoryWrapper>
    );
  },
};
