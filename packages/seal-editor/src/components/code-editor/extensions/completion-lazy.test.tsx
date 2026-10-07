// @vitest-environment jsdom
import { CompletionContext } from '@codemirror/autocomplete';
import { EditorView } from '@codemirror/view';
import { describe, expect, it } from 'vitest';

import { setUdfCompletions } from './completion';
import { makeExpressionCompletion, zenExtensions } from './zen';

// 批 7 回归：补全源惰性取用——setUdfCompletions 在编辑器创建之后注入
// （appshell useCustomNodes 异步拉 schema 的真实时序），补全仍须出现。
// 断言面 = 补全源本体（创建期快照是曾经的缺陷位）。
describe('表达式补全惰性注入（创建期快照回归）', () => {
  it('编辑器先建、UDF 目录晚注入，补全源仍列 UDF 函数', () => {
    setUdfCompletions([]); // 槽位清场：模拟 schema 尚未加载
    const view = new EditorView({
      parent: document.createElement('div'),
      doc: 'fra',
      extensions: [zenExtensions({ type: 'standard', lint: false })],
    });

    // 编辑器已创建（快照时代的缺陷位）→ 此刻才注入 UDF 目录
    setUdfCompletions([{ name: 'fraud_score', title: 'fraud_score', description: 'test tool' }]);
    const result = makeExpressionCompletion()(new CompletionContext(view.state, view.state.doc.length, true)) as {
      options: Array<{ label: string }>;
    } | null;

    const labels = result?.options.map((option) => option.label) ?? [];
    expect(labels).toContain('fraud_score');

    view.destroy();
    setUdfCompletions([]);
  });

  it('槽位清场后不再列出已移除的 UDF', () => {
    setUdfCompletions([{ name: 'temp_tool' }]);
    const view = new EditorView({
      parent: document.createElement('div'),
      doc: 'temp',
      extensions: [zenExtensions({ type: 'standard', lint: false })],
    });
    setUdfCompletions([]);
    const result = makeExpressionCompletion()(new CompletionContext(view.state, view.state.doc.length, true)) as {
      options: Array<{ label: string }>;
    } | null;
    expect(result?.options.map((option) => option.label) ?? []).not.toContain('temp_tool');

    view.destroy();
  });
});
