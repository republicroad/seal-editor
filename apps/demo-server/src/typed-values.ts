/**
 * Typed Input 信封退役注记（2026-10-07，批 9）：zen-udf 1.2.0 已原生三模式
 * 双读（literal 原样绑定 / reference 路径解析 / expression 求值）——此前的
 * expression-only 展开层（expandTypedValues）整体退役，模型直通引擎。
 * 保留运行时版本断言（≥ 1.2.0，含嵌套 kwargs 信封双读）。
 */
import { readFileSync } from 'node:fs';

/**
 * 运行时版本断言（信封语义要求引擎 ≥ 1.2.0）——demo-server 启动时 fail fast；
 * 其他宿主执行存图前应做同款断言。
 */
export const assertZenUdfEnvelopeSupport = (installedVersion: string): void => {
  const [major, minor] = installedVersion.split('.').map(Number);
  if (!(major > 1 || (major === 1 && minor >= 2))) {
    throw new Error(
      `[typed-values] zen-udf >= 1.2.0 required for Typed Input envelope semantics; found ${installedVersion}`,
    );
  }
};

/** 读取本包安装的 zen-udf 版本（bun/node 的 node_modules 解析，src 相对上探一层） */
export const installedZenUdfVersion = (): string => {
  const url = new URL('../node_modules/@republicroad/zen-udf/package.json', import.meta.url);
  return String((JSON.parse(readFileSync(url, 'utf8')) as { version: string }).version);
};
