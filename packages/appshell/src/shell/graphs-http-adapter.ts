import type { TabSnapshot } from '@republicroad/seal-editor';
import axios from 'axios';

import { type GraphPersistenceAdapter, GraphPersistenceError, type GraphRecordMeta } from './persistence';

interface HttpGraphMeta {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  tags?: string[];
  extensions?: Record<string, unknown>;
  revision: string;
  auto?: boolean;
  versionName?: string;
  pinned?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface HttpGraph extends HttpGraphMeta {
  content: Record<string, unknown>;
  session?: TabSnapshot;
}

/**
 * 将 /api/graphs 参考实现封装为 GraphPersistenceAdapter。
 * 宿主可原样复用，或照此实现自己的后端(契约见 persistence.ts)。
 * 404 → load 返回 null / delete 返回 false；409 CONFLICT → 抛 GraphPersistenceError。
 */
export const createGraphsHttpAdapter = (baseUrl = '/api/graphs'): GraphPersistenceAdapter => {
  const toMeta = (m: HttpGraphMeta): GraphRecordMeta => ({
    id: m.id,
    name: m.name,
    description: m.description,
    owner: m.owner,
    tags: m.tags,
    extensions: m.extensions,
    revision: m.revision,
    auto: m.auto,
    versionName: m.versionName,
    pinned: m.pinned,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  });

  return {
    async list(query) {
      const { data } = await axios.get<HttpGraphMeta[]>(baseUrl, { params: query });
      return data.map(toMeta);
    },

    async load(id, opts) {
      try {
        const { data } = await axios.get<HttpGraph>(`${baseUrl}/${encodeURIComponent(id)}`, {
          params: opts?.revision ? { revision: opts.revision } : undefined,
        });
        const record = { ...toMeta(data), content: data.content };
        // 旧记录无 session —— 契约降级语义（宿主跳过 restore）
        return data.session === undefined ? record : { ...record, session: data.session };
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) return null;
        throw e;
      }
    },

    async save(record, opts) {
      const { id, ...body } = record;
      const url = id ? `${baseUrl}/${encodeURIComponent(id)}` : baseUrl;
      const method = id ? 'PUT' : 'POST';
      try {
        // fetch（非 axios）：save 是唯一需要 keepalive 的调用——auto-persist 的
        // pagehide 冲刷依赖它存活于页面卸载；sendBeacon 会破坏 CORS 契约。
        const response = await fetch(url, {
          method,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, baseRevision: opts?.baseRevision }),
          keepalive: opts?.keepalive === true,
        });
        if (!response.ok) {
          let code: string | undefined;
          try {
            code = (await response.json())?.error?.code;
          } catch {
            // 非 JSON 错误体——仅按状态码判定
          }
          if (response.status === 409 || code === 'CONFLICT') {
            throw new GraphPersistenceError(
              'CONFLICT',
              `base revision ${opts?.baseRevision ?? '(none)'} does not match head`,
            );
          }
          throw new Error(`graphs api save failed: ${response.status}`);
        }
        return (await response.json()) as { id: string; revision: string };
      } catch (e) {
        // GraphPersistenceError(CONFLICT) 原样上抛；网络错误由调用方（auto-persist 重试策略）处置
        throw e;
      }
    },

    async delete(id) {
      try {
        await axios.delete(`${baseUrl}/${encodeURIComponent(id)}`);
        return true;
      } catch (e) {
        if (axios.isAxiosError(e) && e.response?.status === 404) return false;
        throw e;
      }
    },

    async listVersions(id) {
      const { data } = await axios.get<
        Array<{
          revision: string;
          versionName?: string;
          pinned?: boolean;
          updatedAt?: string;
          auto?: boolean;
        }>
      >(`${baseUrl}/${encodeURIComponent(id)}/versions`);
      return data;
    },

    // 契约：PATCH /graphs/{id}/versions/{revision}，body { pinned?, versionName? }。
    // 参考后端未实现时宿主不应暴露对应入口（方法存在性即 UI 特性检测）。
    async updateVersionMeta(id, revision, meta) {
      await axios.patch(`${baseUrl}/${encodeURIComponent(id)}/versions/${encodeURIComponent(revision)}`, meta);
    },

    async renameVersion(id, revision, versionName) {
      await this.updateVersionMeta!(id, revision, { versionName });
    },
  };
};
