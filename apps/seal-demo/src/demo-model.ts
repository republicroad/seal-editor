/** Demo JDM model exercising the WS1 feature set: R4 chip (named branch), R6 (toolbar auto-layout), R7 (error badge via injected simulate error). */
export const DEMO_MODEL = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'in-1', name: 'Request', type: 'inputNode', position: { x: 40, y: 180 } },
    {
      id: 'sw-1',
      name: 'riskSwitch',
      type: 'switchNode',
      position: { x: 340, y: 120 },
      content: {
        hitPolicy: 'first',
        statements: [
          { id: 'stmt-1', condition: 'customer.risk > 70', name: 'highRisk', isDefault: false },
          { id: 'stmt-2', condition: '', isDefault: true },
        ],
      },
    },
    {
      id: 'dt-1',
      name: 'pricingTable',
      type: 'decisionTableNode',
      position: { x: 700, y: 20 },
      content: {
        hitPolicy: 'first',
        inputs: [{ id: 'in-risk', field: 'customer.risk', name: 'Risk' }],
        outputs: [{ id: 'out-disc', field: 'discount', name: 'Discount' }],
        rules: [
          { '_id': 'r1', '_description': 'risk above 90 → 30', 'in-risk': '> 90', 'out-disc': '30' },
          { '_id': 'r2', '_description': 'risk above 70 → 20', 'in-risk': '> 70', 'out-disc': '20' },
        ],
      },
    },
    { id: 'out-1', name: 'Response', type: 'outputNode', position: { x: 1080, y: 180 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'in-1', targetId: 'sw-1', type: 'edge' },
    { id: 'e2', sourceId: 'sw-1', sourceHandle: 'stmt-1', targetId: 'dt-1', type: 'edge', name: 'highRisk' },
    { id: 'e3', sourceId: 'sw-1', sourceHandle: 'stmt-2', targetId: 'out-1', type: 'edge' },
    { id: 'e4', sourceId: 'dt-1', targetId: 'out-1', type: 'edge' },
  ],
};

export const DEFAULT_REQUEST = JSON.stringify({ customer: { risk: 85 } }, null, 2);
