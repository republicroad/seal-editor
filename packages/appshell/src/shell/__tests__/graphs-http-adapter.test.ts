import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createGraphsHttpAdapter } from '../graphs-http-adapter';
import { GraphPersistenceError } from '../persistence';

/**
 * 契约语义通过参考 HTTP 适配器验证（GraphPersistenceAdapter 唯一的可执行实现面）：
 * 404 → load null / delete false；409 → GraphPersistenceError('CONFLICT')；其余错误原样上抛。
 * save 走 fetch（keepalive 支持，auto-persist pagehide 冲刷依赖）——list/load/delete 走 axios。
 */
const http = vi.hoisted(() => {
  const axiosError = (status: number, data?: unknown) => ({
    isAxiosError: true,
    response: { status, data },
  });

  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    axiosError,
    isAxiosError: (e: unknown): boolean =>
      Boolean(e && typeof e === 'object' && (e as { isAxiosError?: boolean }).isAxiosError === true),
  };
});

const fetchMock = vi.fn();
const jsonResponse = (ok: boolean, status: number, body: unknown) => ({
  ok,
  status,
  json: async () => body,
});

vi.mock('axios', () => ({ default: http }));

const meta = {
  id: 'g1',
  name: 'demo',
  description: 'd',
  owner: 'u1',
  tags: ['t'],
  extensions: { k: 'v' },
  revision: 'v7',
  auto: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('createGraphsHttpAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('list：GET baseUrl 携带 query，元数据原样映射', async () => {
    http.get.mockResolvedValueOnce({ data: [meta] });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    const list = await adapter.list!({ q: 'de' });

    expect(http.get).toHaveBeenCalledWith('/api/graphs', { params: { q: 'de' } });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'g1', name: 'demo', owner: 'u1', revision: 'v7', tags: ['t'] });
  });

  test('load：head 路径返回 meta+content，缺 session 键时不携带', async () => {
    http.get.mockResolvedValueOnce({ data: { ...meta, content: { nodes: [], edges: [] } } });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    const record = await adapter.load('g1');

    expect(http.get).toHaveBeenCalledWith('/api/graphs/g1', { params: undefined });
    expect(record?.content).toEqual({ nodes: [], edges: [] });
    expect('session' in (record ?? {})).toBe(false);
  });

  test('load：session 兄弟字段随记录返回', async () => {
    const session = { viewport: { x: 1 }, tabs: {} };
    http.get.mockResolvedValueOnce({ data: { ...meta, content: {}, session } });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    expect(await adapter.load('g1')).toMatchObject({ session });
  });

  test('load：revision 查询参数透传', async () => {
    http.get.mockResolvedValueOnce({ data: { ...meta, content: {} } });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await adapter.load('g1', { revision: 'v3' });

    expect(http.get).toHaveBeenCalledWith('/api/graphs/g1', { params: { revision: 'v3' } });
  });

  test('load：404 语义 → null（不暴露存在性）', async () => {
    http.get.mockRejectedValueOnce(http.axiosError(404));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    expect(await adapter.load('ghost')).toBeNull();
  });

  test('load：非 404 的 axios 错误原样上抛', async () => {
    const err = http.axiosError(500);
    http.get.mockRejectedValueOnce(err);
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await expect(adapter.load('g1')).rejects.toBe(err);
  });

  test('save：有 id 走 PUT，body 含 baseRevision 与 session', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, 200, { id: 'g1', revision: 'v8' }));
    const adapter = createGraphsHttpAdapter('/api/graphs');
    const session = { tabs: {} };

    const saved = await adapter.save(
      { ...meta, content: { nodes: [] }, session, revision: 'v7' },
      { baseRevision: 'v7' },
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/graphs/g1');
    expect(init.method).toBe('PUT');
    expect(init.keepalive).toBe(false);
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      name: 'demo',
      description: 'd',
      owner: 'u1',
      tags: ['t'],
      extensions: { k: 'v' },
      revision: 'v7',
      auto: false,
      content: { nodes: [] },
      session,
      baseRevision: 'v7',
    });
    expect(saved).toEqual({ id: 'g1', revision: 'v8' });
  });

  test('save：无 id 走 POST（新建），baseRevision 缺省不进 body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, 200, { id: 'new', revision: 'v1' }));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    const saved = await adapter.save({ id: '', name: 'n', content: {}, revision: '' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/graphs');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ name: 'n', content: {}, revision: '' });
    expect(saved).toEqual({ id: 'new', revision: 'v1' });
  });

  test('save：HTTP 409 → GraphPersistenceError(CONFLICT)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, 409, { error: { code: 'CONFLICT' } }));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    try {
      await adapter.save({ id: 'g1', name: 'n', content: {}, revision: '' }, { baseRevision: 'stale' });
      expect.unreachable('save should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(GraphPersistenceError);
      expect((e as GraphPersistenceError).code).toBe('CONFLICT');
      expect((e as GraphPersistenceError).message).toContain('stale');
    }
  });

  test('save：响应体 error.code=CONFLICT 同样映射为 CONFLICT', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(false, 400, { error: { code: 'CONFLICT' } }));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await expect(adapter.save({ id: 'g1', name: 'n', content: {}, revision: '' })).rejects.toMatchObject({
      name: 'GraphPersistenceError',
      code: 'CONFLICT',
    });
  });

  test('save：非 JSON 错误体的非 2xx → 通用错误（重试策略可辨识）', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => {
        throw new Error('not json');
      },
    });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await expect(adapter.save({ id: 'g1', name: 'n', content: {}, revision: '' })).rejects.toThrow(
      'graphs api save failed: 503',
    );
  });

  test('save：keepalive 选项透传 fetch（pagehide 冲刷路径）', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, 200, { id: 'g1', revision: 'v8' }));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await adapter.save({ id: 'g1', name: 'n', content: {}, revision: '' }, { keepalive: true });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.keepalive).toBe(true);
  });

  test('delete：成功 true；404 false；其余上抛', async () => {
    const adapter = createGraphsHttpAdapter('/api/graphs');

    http.delete.mockResolvedValueOnce({ data: {} });
    expect(await adapter.delete!('g1')).toBe(true);

    http.delete.mockRejectedValueOnce(http.axiosError(404));
    expect(await adapter.delete!('ghost')).toBe(false);

    const err = http.axiosError(403);
    http.delete.mockRejectedValueOnce(err);
    await expect(adapter.delete!('g1')).rejects.toBe(err);
  });

  test('listVersions：versions 端点载荷透传（含 versionName）', async () => {
    const versions = [
      { revision: 'v1', versionName: 'baseline', updatedAt: '2026-01-01T00:00:00.000Z', auto: false },
      { revision: 'v2', updatedAt: '2026-01-02T00:00:00.000Z', auto: true },
    ];
    http.get.mockResolvedValueOnce({ data: versions });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    expect(await adapter.listVersions!('g1')).toEqual(versions);
    expect(http.get).toHaveBeenCalledWith('/api/graphs/g1/versions');
  });

  test('save：versionName 随保存 body 透传', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(true, 200, { id: 'g1', revision: 'v8' }));
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await adapter.save({ ...meta, content: {}, revision: 'v7', versionName: 'release-candidate' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toMatchObject({ versionName: 'release-candidate' });
  });

  test('renameVersion：PATCH versions 端点携带新命名，null 表示清除', async () => {
    http.patch.mockResolvedValue({ data: {} });
    const adapter = createGraphsHttpAdapter('/api/graphs');

    await adapter.renameVersion!('g1', 'v3', 'hotfix');
    expect(http.patch).toHaveBeenCalledWith('/api/graphs/g1/versions/v3', { versionName: 'hotfix' });

    await adapter.renameVersion!('g1', 'v3', null);
    expect(http.patch).toHaveBeenLastCalledWith('/api/graphs/g1/versions/v3', { versionName: null });
  });
});
