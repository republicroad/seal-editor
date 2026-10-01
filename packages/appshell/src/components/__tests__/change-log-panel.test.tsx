// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
  type ChangeLogEntry,
  ChangeLogPanel,
  changeLogEntryFromContractEvent,
  changeLogEntryFromPersistEvent,
} from '../governance/change-log-panel';

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

  describe('changeLogEntryFromContractEvent（ADR-013 批次三 M2：契约漂移事件映射）', () => {
    test('detected → drift 条目（名称 + 计数明细）', () => {
      expect(
        changeLogEntryFromContractEvent(
          {
            at: '2026-10-01T09:00:00.000Z',
            nodeId: 'in-1',
            nodeName: 'Request',
            kind: 'drift-detected',
            exampleNames: ['GOLD', '边界'],
            counts: { missing: 2, extra: 1, conflicts: 0, constraints: 3 },
          },
          '2026-10-01T09:00:05.000Z',
        ),
      ).toEqual({
        at: '2026-10-01T09:00:00.000Z',
        kind: 'drift',
        message: '检测到漂移：Request · GOLD、边界',
        detail: '缺 2 · 多 1 · 约束 3',
      });
    });

    test('confirmed → 无计数则无明细', () => {
      const entry = changeLogEntryFromContractEvent(
        { at: '2026-10-01T09:01:00.000Z', nodeId: 'in-1', kind: 'drift-confirmed', exampleNames: ['GOLD'] },
        'x',
      );
      expect(entry.message).toBe('确认有效：in-1 · GOLD');
      expect(entry.detail).toBeUndefined();
    });

    test('面板渲染 drift 徽标', () => {
      const { container } = render(
        <ChangeLogPanel
          entries={[{ at: '2026-10-01T09:00:00.000Z', kind: 'drift', message: '检测到漂移：Request · GOLD' }]}
        />,
      );
      expect(screen.getByText('契约漂移')).toBeDefined();
      expect(container.querySelector('[data-kind=drift]')).not.toBeNull();
    });
  });
});
