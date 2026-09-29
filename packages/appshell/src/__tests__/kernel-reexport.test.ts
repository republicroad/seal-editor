// @vitest-environment jsdom
// 内核根索引自 helpers/monaco.ts 触碰 self——jsdom 才有（组件测试同此约定）
import * as kernel from '@republicroad/seal-editor';
import { describe, expect, test } from 'vitest';

import * as appshell from '../index';

/** appshell 首行 `export * from '@republicroad/seal-editor'` 的单入口契约（2026-09-29） */
describe('kernel re-export（宿主单入口）', () => {
  test('内核值符号经 appshell 出口可达且同一实例', () => {
    const names = [
      'DecisionGraph',
      'GraphSimulator',
      'JdmConfigProvider',
      'createJdmNode',
      'DictionaryProvider',
    ] as const;
    for (const name of names) {
      expect((appshell as Record<string, unknown>)[name]).toBe((kernel as Record<string, unknown>)[name]);
    }
  });

  test('appshell 自有导出未被透传遮蔽（显式导出本地优先）', () => {
    expect(appshell.SkinnedDecisionGraph).toBeDefined();
    expect(appshell.useTheme).toBeDefined(); // appshell 皮肤主题版
    expect(appshell.useThemeMode).toBe(kernel.useThemeMode); // 内核主题版并存
  });
});
