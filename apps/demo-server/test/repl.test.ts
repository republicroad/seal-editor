import { describe, expect, it } from 'bun:test';

import { createApp } from '../src/app';

// A3a：单函数执行端点（REPL）——契约见 docs/design/repl-panel-plan.md §1。
// demo 注册表的 roster UDF（demo_block/demo_vip 名单夹具）作离线执行对象。
describe('POST /v1/functions/:name/execute', () => {
  const app = createApp();

  it('合法位置参数：result + micros + 绑定后的 kwargs', async () => {
    const res = await app.request('/v1/functions/roster/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args: ['demo_block', '1.2.3.4'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kwargs).toEqual({ roster: 'demo_block', value: '1.2.3.4' });
    expect(typeof body.micros).toBe('number');
    // roster UDF：命中封禁名单 → true（demo_block 夹具含 1.2.3.4）
    expect(body.result).toMatchObject({ hit: true, roster: 'demo_block', value: '1.2.3.4' });
  });

  it('缺必填位置参数：400 + issues 明细', async () => {
    const res = await app.request('/v1/functions/roster/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('invalid args');
    expect(Array.isArray(body.details)).toBe(true);
    expect(body.details.length).toBeGreaterThan(0);
  });

  it('未知函数：404（view 驱动的显式判定，先于调用）', async () => {
    const res = await app.request('/v1/functions/no_such_fn/execute', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ args: [] }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('no_such_fn');
  });

  it('非 JSON 体：按空 args 处理（走 400 缺参路径）', async () => {
    const res = await app.request('/v1/functions/roster/execute', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});
