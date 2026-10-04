import { createApp } from './app';
import { assertZenUdfEnvelopeSupport, installedZenUdfVersion } from './typed-values';

const port = Number(process.env.PORT ?? 8787);

// Typed Input 信封语义最低引擎版 fail fast（ADR-016 评审补充发现 1）
assertZenUdfEnvelopeSupport(installedZenUdfVersion());

const server = Bun.serve({
  port,
  fetch: createApp().fetch,
});

console.log(`[demo-server] listening on http://localhost:${port} (demo only — no auth, no storage)`);

process.on('SIGINT', () => server.stop(true));
process.on('SIGTERM', () => server.stop(true));
