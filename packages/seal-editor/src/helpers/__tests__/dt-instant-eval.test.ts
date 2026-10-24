import { describe, expect, it } from 'vitest';

import { INSTANT_EVAL_ROW_LIMIT, instantEvalStructureSignature, resolveInstantEvalStatus } from '../dt-instant-eval';

const content = (rows: number, inputs: string[], outputs: string[]) => ({
  rows: Array.from({ length: rows }, (_, i) => ({ _id: `r${i}` })),
  inputs: inputs.map((id) => ({ id })),
  outputs: outputs.map((id) => ({ id })),
});

describe('instantEvalStructureSignature（结构签名）', () => {
  it('行数与列 id 序参与签名；单元格值不参与', () => {
    const a = instantEvalStructureSignature(content(3, ['in1', 'in2'], ['out1']));
    const b = instantEvalStructureSignature(content(3, ['in1', 'in2'], ['out1']));
    expect(a).toBe(b);
  });

  it('行增删 / 列增删 / 列重排都翻签名', () => {
    const base = instantEvalStructureSignature(content(3, ['in1', 'in2'], ['out1']));
    expect(instantEvalStructureSignature(content(4, ['in1', 'in2'], ['out1']))).not.toBe(base);
    expect(instantEvalStructureSignature(content(3, ['in1', 'in2', 'in3'], ['out1']))).not.toBe(base);
    expect(instantEvalStructureSignature(content(3, ['in2', 'in1'], ['out1']))).not.toBe(base);
  });
});

describe('resolveInstantEvalStatus（A3 状态裁定）', () => {
  const sig = '3|in1,in2|out1';

  it('无 simulator 结果 → idle（undefined）', () => {
    expect(
      resolveInstantEvalStatus({ rowCount: 3, nextSig: sig, lastRunSig: sig, hasSimulateResult: false }),
    ).toBeUndefined();
  });

  it('签名一致 → active；结构变更 → suspended', () => {
    expect(resolveInstantEvalStatus({ rowCount: 3, nextSig: sig, lastRunSig: sig, hasSimulateResult: true })).toBe(
      'active',
    );
    expect(
      resolveInstantEvalStatus({ rowCount: 4, nextSig: '4|in1,in2|out1', lastRunSig: sig, hasSimulateResult: true }),
    ).toBe('suspended');
  });

  it('行数达降级闸 → degraded（优先于 suspended）', () => {
    const big = INSTANT_EVAL_ROW_LIMIT;
    expect(
      resolveInstantEvalStatus({
        rowCount: big,
        nextSig: 'changed',
        lastRunSig: sig,
        hasSimulateResult: true,
      }),
    ).toBe('degraded');
  });
});
