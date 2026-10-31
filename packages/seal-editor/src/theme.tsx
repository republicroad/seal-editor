import React, { useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Toaster } from 'sonner';

import { App, ConfirmHost } from './components/primitives';
import { useWasmReady } from './helpers/wasm';
import { computeTheme } from './theming/compute';
import type { ThemeSeeds } from './theming/derive';
import { I18nProvider } from './theming/i18n';
import { SealContainerProvider } from './theming/portal-context';

export { MODE_EXTRAS, darkTokens, lightTokens } from './theming/presets';

export type ThemeConfig = {
  mode?: 'light' | 'dark';
  token?: Record<string, unknown>;
  [key: string]: unknown;
};

export type DictionaryMap = Record<string, { label: string; value: string }[]>;

const ThemeModeContext = React.createContext<'light' | 'dark'>('light');

/** Active color scheme set by <JdmConfigProvider mode>. */
export const useThemeMode = (): 'light' | 'dark' => useContext(ThemeModeContext);

const DictionaryContext = React.createContext<DictionaryMap>({});

export const useDictionaries = (): DictionaryMap => useContext(DictionaryContext);

export const DictionaryProvider: React.FC<React.PropsWithChildren<{ value: DictionaryMap }>> = ({
  value,
  children,
}) => <DictionaryContext.Provider value={value}>{children}</DictionaryContext.Provider>;

export type JdmConfigProviderProps = {
  theme?: ThemeConfig;
  /**
   * Brand seed colors (roadmap P0, one-click retheming). Both modes derive
   * brand families; explicit `theme.token` entries always win.
   */
  seeds?: ThemeSeeds;
  /** BCP 47 locale tag (e.g. `'en'`, `'zh-CN'`). Defaults to `'en'`. */
  locale?: string;
  /** Consumer i18n overrides — highest priority in the resolution chain. */
  messages?: Record<string, string>;
  prefixCls?: string;
  dictionaries?: DictionaryMap;
  children?: React.ReactNode;
  /**
   * chrome 门（2.1.0 主题透传口，ADR-025 M1）：嵌套内层 Provider（如 kernel
   * DecisionGraph theme 透传）置 false——只供给 ThemeModeContext/token 注入/
   * data-mode 写入，跳过 Toaster+ConfirmHost（confirmState 全局单源，双挂=
   * 确认弹窗双渲染回归）。缺省 true 保持既有宿主形态。
   */
  chrome?: boolean;
};

export const JdmConfigProvider: React.FC<JdmConfigProviderProps> = ({
  theme: { mode = 'light' as const, token = {} } = {},
  seeds,
  locale = 'en',
  messages,
  dictionaries,
  chrome = true,
  children,
}) => {
  useWasmReady();

  const dicts = useMemo(() => dictionaries ?? {}, [dictionaries]);

  /* ── Scoped injection (roadmap P3) ─────────────────────────────────────────
   * When the provider mounts inside a `.seal-root` island, tokens become inline
   * properties on THAT container and `data-mode` lives there too — multiple
   * independently-themed islands can coexist, and Radix portals (via
   * SealContainerProvider) stay inside the island's variable scope, which also
   * brings the scoped preflight over portaled nodes (HK-14).
   * 2.0 (ADR-023 D2 step 2): the `:root` fallback is retired. No `.seal-root`
   * ancestor → nothing is injected and document is untouched; a dev warning
   * points the host at the wrapper requirement (tokens cannot resolve
   * outside the island by construction). */
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined);

  const exposedTokens = useMemo(() => computeTheme(mode, seeds, token), [mode, seeds, token]);

  useLayoutEffect(() => {
    const root = (anchorRef.current?.closest?.('.seal-root') as HTMLElement | null) ?? undefined;
    setContainer(root);
  }, []);

  useLayoutEffect(() => {
    if (!container) {
      return;
    }
    container.dataset.mode = mode;
    return () => {
      delete container.dataset.mode;
    };
  }, [container, mode]);

  // 2.0 LEGACY 退役（ADR-023 D2 step 2）：无岛 = token 注入跳过 + 开发告警
  // （token 只在 .seal-root 作用域解析，岛外注入无消费点）。effect 内告警——
  // 渲染体告警违 react-compiler 纯度（popover 前科）。
  useLayoutEffect(() => {
    if (!container) {
      console.warn(
        '[seal-editor] No .seal-root wrapper found — token injection skipped since v2.0. ' +
          'Wrap your app in .seal-root (island scope). See ADR-023.',
      );
    }
  }, [container]);

  useLayoutEffect(() => {
    if (container) {
      const keys = Object.keys(exposedTokens);
      for (const key of keys) {
        container.style.setProperty(key, exposedTokens[key]);
      }
      // Text color must be scoped alongside the variables: nothing else in the
      // cascade sets `color`, so in dark mode
      // every input/editor would inherit UA black-on-dark and go invisible.
      container.style.setProperty('color', 'var(--foreground)');
      return () => {
        for (const key of keys) {
          container.style.removeProperty(key);
        }
        container.style.removeProperty('color');
      };
    }
  }, [container, exposedTokens]);

  return (
    <ThemeModeContext.Provider value={mode}>
      <DictionaryContext.Provider value={dicts}>
        <App>
          <span ref={anchorRef} style={{ display: 'none' }} data-seal-anchor='' />

          <SealContainerProvider container={container}>
            <I18nProvider locale={locale} overrides={messages}>
              {chrome && <Toaster theme={mode} position='bottom-right' richColors />}
              {chrome && <ConfirmHost />}
              {children}
            </I18nProvider>
          </SealContainerProvider>
        </App>
      </DictionaryContext.Provider>
    </ThemeModeContext.Provider>
  );
};
