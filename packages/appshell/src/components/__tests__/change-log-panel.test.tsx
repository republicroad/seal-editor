// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import { type ChangeLogEntry, ChangeLogPanel, changeLogEntryFromPersistEvent } from '../governance/change-log-panel';

afterEach(cleanup);

describe('changeLogEntryFromPersistEvent（auto-persist 事件映射）', () => {
  test('saved → 保存条目（versionName 优先于耗时）', () => {
    const at = '2026-09-30T08:00:00.000Z';
    expect(changeLogEntryFromPersistEvent({ type: 'saved', micros: 1500, revision: 'r9' }, at)).toEqual({
      at,
      kind: 'save',
      message: '已保存（r r9）',
      detail: '1500µs',
    });
    expect(
      changeLogEntryFromPersistEvent({ type: 'saved', micros: 1500, revision: 'r9', versionName: '自动版本 10' }, at),
    ).toEqual({ at, kind: 'save', message: '已保存（r r9）', detail: '自动版本 10' });
  });

  test('conflict → 冲突条目（带 base）', () => {
    expect(changeLogEntryFromPersistEvent({ type: 'conflict', localBaseRevision: 'v7' }, at0())).toEqual({
      at: at0(),
      kind: 'conflict',
      message: '保存冲突：head 已被其他编辑者推进',
      detail: 'base v7',
    });
  });

  test('error → 错误条目；retry → null（高频低价值不入日志）', () => {
    expect(changeLogEntryFromPersistEvent({ type: 'error', code: 'NETWORK', message: 'down' }, at0())).toEqual({
      at: at0(),
      kind: 'error',
      message: 'down',
      detail: 'NETWORK',
    });
    expect(changeLogEntryFromPersistEvent({ type: 'retry', attempt: 1, message: 'x' }, at0())).toBeNull();
  });
});

const at0 = () => '2026-09-30T08:00:00.000Z';

describe('ChangeLogPanel（设计时变更日志面板）', () => {
  const entries: ChangeLogEntry[] = [
    { at: '2026-09-30T08:00:01.000Z', kind: 'conflict-resolved', message: '覆盖（我的胜出）' },
    { at: '2026-09-30T08:00:00.000Z', kind: 'conflict', message: '保存冲突：head 已被其他编辑者推进' },
    { at: '2026-09-30T08:00:02.000Z', kind: 'migration', message: 'http_request 参数从 path 迁移为 url + method' },
  ];

  test('按时间降序渲染 + kind 徽标', () => {
    const { container } = render(<ChangeLogPanel entries={entries} />);

    const rows = Array.from(container.querySelectorAll('[data-kind]'));
    expect(rows.map((r) => r.getAttribute('data-kind'))).toEqual(['migration', 'conflict-resolved', 'conflict']);
    expect(screen.getByText('迁移')).toBeDefined();
    expect(screen.getByText('冲突裁决')).toBeDefined();
  });

  test('空态', () => {
    render(<ChangeLogPanel entries={[]} />);
    expect(screen.getByTestId('change-log-empty')).toBeDefined();
  });
});
