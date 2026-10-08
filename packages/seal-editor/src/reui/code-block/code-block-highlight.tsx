import type { ReactNode } from 'react';
import type { ShikiTransformer } from 'shiki';

/**
 * One themed slice of a line. `color`/`colorDark` emit as `--cb-c`/`--cb-cd`
 * custom properties, so one rule pair on the `<pre>` theme-switches the whole
 * block. An uncoloured token keeps both undefined and renders as a bare text
 * node with no wrapper.
 */
export type CodeBlockToken = {
  content: string;
  color?: string;
  colorDark?: string;
  fontStyle?: CodeBlockFontStyle;
  word?: boolean;
};

export type CodeBlockFontStyle = 'italic' | 'bold' | 'underline';

export type CodeBlockDiffKind = 'add' | 'remove';

export type CodeBlockLevel = 'error' | 'warning' | 'info';

/**
 * Per-line presentation state, resolved once at highlight time.
 *
 * Two sources merge here: the props on the root, and the classes a shiki
 * transformer put on the line, so `@shikijs/transformers` notation such as
 * `[!code ++]` reaches the same place without the renderer knowing shiki
 * exists. Props win on conflict, because notation lives in the source string,
 * which a consumer often does not control.
 */
export type CodeBlockLineState = {
  highlighted?: boolean;
  diff?: CodeBlockDiffKind;
  focused?: boolean;
  level?: CodeBlockLevel;
};

/**
 * A rendered line. `number` is the DISPLAYED number (offset by `startLine`);
 * line specs address source lines, so changing `startLine` never invalidates
 * them. Instances are reused across passes when unchanged, which is what lets
 * the row be a plain `React.memo` and a streamed chunk cost one re-render.
 */
export type CodeBlockLine = {
  tokens: CodeBlockToken[];
  number: number;
  text: string;
  state?: CodeBlockLineState;
  /**
   * Replaces the counter-driven gutter number for this row - a unified patch
   * shows "old new" pairs, a hunk header shows dots. Rendered verbatim.
   */
  gutter?: string;
};

/** Source lines, as `[2, 3, 4]` or as a range string such as `"2-4,7"`. */
export type CodeBlockLineSpec = number[] | string;

export type CodeBlockDiffSpec = {
  added?: CodeBlockLineSpec;
  removed?: CodeBlockLineSpec;
};

export type CodeBlockLevelSpec = Partial<Record<CodeBlockLevel, CodeBlockLineSpec>>;

/** A word to mark, optionally restricted to some source lines. */
export type CodeBlockWordSpec = string | { word: string; lines?: CodeBlockLineSpec };

export type CodeBlockThemes = { light: string; dark: string };

/**
 * shiki's own transformer type, imported type-only so it erases at compile
 * time and costs the bundle nothing. The previous structural stand-in
 * (`Record<string, unknown>`) rejected every real `ShikiTransformer`: an
 * interface without an index signature is not assignable to it.
 */
export type CodeBlockTransformer = ShikiTransformer;

export type CodeBlockHighlightOptions = {
  language?: string;
  themes?: CodeBlockThemes;
  transformers?: CodeBlockTransformer[];
  startLine?: number;
  /**
   * Distinguishes same-signature blocks in the line-reuse cache. Without it,
   * two identically-configured streams evict each other's previous document.
   * The root passes its own instance id.
   */
  instanceKey?: string;
  highlightedLines?: CodeBlockLineSpec;
  highlightedWords?: CodeBlockWordSpec[];
  focusedLines?: CodeBlockLineSpec;
  diff?: CodeBlockDiffSpec;
  lineLevels?: CodeBlockLevelSpec;
};

/** What a `CodeBlockLineActions` render prop receives. */
export type CodeBlockLineActionContext = {
  line: number;
  text: string;
  state?: CodeBlockLineState;
};

export type CodeBlockLineActionsRender = (context: CodeBlockLineActionContext) => ReactNode;

/* -------------------------------------------------------------------------- */
/*                                  Languages                                  */
/* -------------------------------------------------------------------------- */

/**
 * A STATIC map, never ``import(`shiki/langs/${lang}.mjs`)``: a template import
 * makes bundlers bundle all ~200 grammars. Written out, each entry is its own
 * lazy chunk. To add a language, add a line: that is the intended extension
 * point of this file.
 */
export const codeBlockLanguages: Record<string, () => Promise<unknown>> = {
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  shell: () => import('shiki/langs/shellscript.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
};

/** Spellings a consumer is likely to pass, mapped onto the map above. */
const LANGUAGE_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  'cs': 'csharp',
  'dockerfile': 'docker',
  'htm': 'html',
  'js': 'javascript',
  'jsonc': 'json',
  'md': 'markdown',
  'mdx': 'markdown',
  'py': 'python',
  'rb': 'ruby',
  'rs': 'rust',
  'sh': 'shell',
  'shellscript': 'shell',
  'ts': 'typescript',
  'yml': 'yaml',
  'zsh': 'shell',
};

export const codeBlockThemes: Record<string, () => Promise<unknown>> = {
  'github-light': () => import('shiki/themes/github-light.mjs'),
  'github-dark': () => import('shiki/themes/github-dark.mjs'),
  /**
   * Design-token theming: every token colour becomes a `var(--code-token-*)`
   * reference, so the palette lives in the consumer's stylesheet and follows
   * their themes. Pass as BOTH sides. Variables consumed (prefix `--code-`):
   * foreground, token-constant, token-string, token-comment, token-keyword,
   * token-parameter, token-function, token-string-expression,
   * token-punctuation, token-link.
   */
  'css-variables': async () => {
    const { createCssVariablesTheme } = await import('shiki/core');
    return createCssVariablesTheme({
      name: 'css-variables',
      variablePrefix: '--code-',
      fontStyle: true,
    });
  },
};

export const DEFAULT_CODE_BLOCK_THEMES: CodeBlockThemes = {
  light: 'github-light',
  dark: 'github-dark',
};

/** Resolves an alias and reports whether the grammar is actually available. */
export function resolveCodeBlockLanguage(language?: string): string | undefined {
  if (!language) return undefined;
  const normalized = language.trim().toLowerCase();
  const resolved = LANGUAGE_ALIASES[normalized] ?? normalized;
  return resolved in codeBlockLanguages ? resolved : undefined;
}

/* -------------------------------------------------------------------------- */
/*                                Pure helpers                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turns `[2, 3]` or `"2-4,7"` into a set of source line numbers.
 *
 * Deliberately total: a reversed range, a negative bound or outright garbage
 * yields an empty set rather than throwing. These values often come from user
 * content or from a model, and a code viewer that crashes on a bad range is
 * worse than one that shows no highlight.
 */
export function parseLineSpec(spec?: CodeBlockLineSpec): Set<number> {
  const out = new Set<number>();
  if (!spec) return out;

  if (Array.isArray(spec)) {
    for (const value of spec) {
      if (Number.isInteger(value) && value > 0) out.add(value);
    }
    return out;
  }

  for (const part of spec.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > 0 && end >= start) {
        for (let line = start; line <= end; line += 1) out.add(line);
      }
      continue;
    }

    if (/^\d+$/.test(trimmed)) {
      const single = Number(trimmed);
      if (single > 0) out.add(single);
    }
  }

  return out;
}

/** Normalises line endings so every downstream offset is LF-based. */
export function normalizeCode(code: string): string {
  return code.replace(/\r\n?/g, '\n');
}

/**
 * Character ranges for `highlightedWords`, as shiki `decorations`.
 *
 * shiki rejects overlapping decorations, so a later match that would overlap an
 * earlier one is dropped rather than passed through to throw.
 */
export function buildWordDecorations(
  code: string,
  words?: CodeBlockWordSpec[],
): { start: number; end: number; properties: { class: string } }[] {
  if (!words?.length) return [];

  const lineStarts: number[] = [0];
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === '\n') lineStarts.push(index + 1);
  }

  const lineAt = (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineStarts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  };

  const taken: { start: number; end: number }[] = [];
  const out: { start: number; end: number; properties: { class: string } }[] = [];

  for (const entry of words) {
    const word = typeof entry === 'string' ? entry : entry.word;
    if (!word) continue;
    const limit = typeof entry === 'string' ? undefined : parseLineSpec(entry.lines);

    let from = code.indexOf(word);
    while (from !== -1) {
      const to = from + word.length;
      const withinLimit = !limit || limit.size === 0 || limit.has(lineAt(from));
      const overlaps = taken.some((r) => from < r.end && to > r.start);

      if (withinLimit && !overlaps) {
        taken.push({ start: from, end: to });
        out.push({ start: from, end: to, properties: { class: 'cb-word' } });
      }
      from = code.indexOf(word, from + word.length);
    }
  }

  return out.sort((a, b) => a.start - b.start);
}

/**
 * Strips `[!code ...]` notation from a copy payload: the transformer already
 * drops it from RENDERED output, but the raw `code` string would paste the
 * comment into someone's editor.
 */
export function stripNotationComments(code: string): string {
  return code
    .split('\n')
    .map((line) => line.replace(/\s*(?:\/\/|#|--|;|%|<!--|\/\*)\s*\[!code[^\]]*\]\s*(?:-->|\*\/)?\s*$/, ''))
    .join('\n');
}

/**
 * Plain, unhighlighted lines. One token per line, no colour.
 *
 * This is both the `highlight={false}` renderer and the first paint of a
 * streaming block, so the tail of a stream is readable before its grammar pass
 * lands and no frame is ever blank.
 */
export function toPlainLines(code: string, startLine = 1): CodeBlockLine[] {
  return normalizeCode(code)
    .split('\n')
    .map((text, index) => ({
      tokens: text ? [{ content: text }] : [],
      number: startLine + index,
      text,
    }));
}

/* -------------------------------------------------------------------------- */
/*                                   Engine                                    */
/* -------------------------------------------------------------------------- */

type HighlighterLike = {
  codeToHast: (code: string, options: Record<string, unknown>) => unknown;
  getLoadedLanguages: () => string[];
  loadLanguage: (lang: unknown) => Promise<void>;
  loadTheme: (theme: unknown) => Promise<void>;
};

let highlighterPromise: Promise<HighlighterLike> | null = null;
const loadedLanguages = new Set<string>();
const loadedThemes = new Set<string>();

/**
 * One highlighter per page, on the JavaScript regex engine: oniguruma needs
 * WebAssembly, which forces `'wasm-unsafe-eval'` into every consumer's CSP.
 * `forgiving` keeps an inexpressible grammar pattern from taking the block
 * down.
 */
async function loadHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
      ]);

      return (await createHighlighterCore({
        themes: [],
        langs: [],
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      })) as unknown as HighlighterLike;
    })();
  }

  return highlighterPromise;
}

/**
 * Themes register per name, on demand, exactly like languages.
 *
 * Baking the FIRST caller's pair into the singleton looks correct until a page
 * holds two blocks with different `themes` props: the second silently renders
 * in the first one's colours, because the singleton never learns about the
 * request. Loading by name makes every block's prop actually mean something.
 */
const warnedThemes = new Set<string>();

async function ensureTheme(highlighter: HighlighterLike, name: string, side: 'light' | 'dark' = 'light') {
  /* Falls back to the MATCHING side (an unknown dark theme used to fall back
     to github-light, silently rendering light colours in dark mode). */
  const resolved = name in codeBlockThemes ? name : DEFAULT_CODE_BLOCK_THEMES[side];
  if (resolved !== name && process.env.NODE_ENV !== 'production' && !warnedThemes.has(name)) {
    warnedThemes.add(name);
    console.warn(
      `[code-block] Unknown theme "${name}" - falling back to "${resolved}". ` +
        'Register it in codeBlockThemes to use it.',
    );
  }
  if (loadedThemes.has(resolved)) return resolved;
  await highlighter.loadTheme(await codeBlockThemes[resolved]());
  loadedThemes.add(resolved);
  return resolved;
}

async function ensureLanguage(highlighter: HighlighterLike, language: string) {
  if (loadedLanguages.has(language)) return;
  const loader = codeBlockLanguages[language];
  if (!loader) return;
  await highlighter.loadLanguage(await loader());
  loadedLanguages.add(language);
}

/* -------------------------------------------------------------------------- */
/*                            hast to normalised lines                         */
/* -------------------------------------------------------------------------- */

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const FONT_STYLE_BY_DECLARATION: Record<string, CodeBlockFontStyle> = {
  'font-style:italic': 'italic',
  'font-weight:bold': 'bold',
  'text-decoration:underline': 'underline',
};

/** Splits shiki's inline `style` string into the fields a token carries. */
function readTokenStyle(style: unknown): Omit<CodeBlockToken, 'content'> {
  if (typeof style !== 'string') return {};

  const out: Omit<CodeBlockToken, 'content'> = {};
  for (const declaration of style.split(';')) {
    const trimmed = declaration.trim();
    if (!trimmed) continue;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;

    const property = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();

    if (property === 'color') out.color = value;
    else if (property === '--shiki-dark') out.colorDark = value;
    else {
      const fontStyle = FONT_STYLE_BY_DECLARATION[`${property}:${value}`];
      if (fontStyle) out.fontStyle = fontStyle;
    }
  }
  return out;
}

/**
 * shiki emits raw `class` (string or array), not hast's `className`; reading
 * only `className` finds nothing, which looks like a transformer that never
 * ran.
 */
function classListOf(node: HastNode): string[] {
  const value = node.properties?.class ?? node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean);
  return [];
}

/** Maps the classes shiki transformers put on a line onto line state. */
function stateFromClasses(classes: string[]): CodeBlockLineState | undefined {
  const state: CodeBlockLineState = {};
  if (classes.includes('highlighted')) state.highlighted = true;
  if (classes.includes('focused')) state.focused = true;
  if (classes.includes('diff')) {
    if (classes.includes('add')) state.diff = 'add';
    else if (classes.includes('remove')) state.diff = 'remove';
  }
  for (const level of ['error', 'warning', 'info'] as const) {
    if (classes.includes(level)) state.level = level;
  }
  return Object.keys(state).length ? state : undefined;
}

function collectTokens(node: HastNode, out: CodeBlockToken[], inWord: boolean): void {
  for (const child of node.children ?? []) {
    if (child.type === 'text') {
      if (!child.value) continue;
      out.push(inWord ? { content: child.value, word: true } : { content: child.value });
      continue;
    }
    if (child.type !== 'element') continue;

    const classes = classListOf(child);
    const childInWord = inWord || classes.includes('cb-word');
    const style = readTokenStyle(child.properties?.style);
    const hasStyle = Boolean(style.color || style.colorDark || style.fontStyle);

    /* A styled leaf is a token; a wrapper (a decoration span) is descended into
       so its own children keep their individual colours. */
    const onlyText = (child.children ?? []).every((grandChild) => grandChild.type === 'text');

    if (hasStyle && onlyText) {
      const content = (child.children ?? []).map((c) => c.value ?? '').join('');
      if (!content) continue;
      out.push({
        content,
        ...style,
        ...(childInWord ? { word: true } : {}),
      });
      continue;
    }

    collectTokens(child, out, childInWord);
  }
}

function findCodeElement(root: HastNode): HastNode | undefined {
  if (root.type === 'element' && root.tagName === 'code') return root;
  for (const child of root.children ?? []) {
    const found = findCodeElement(child);
    if (found) return found;
  }
  return undefined;
}

/* -------------------------------------------------------------------------- */
/*                              Identity reuse                                 */
/* -------------------------------------------------------------------------- */

const MAX_TRACKED_DOCUMENTS = 24;

/**
 * Previous result per option signature, so a growing stream can reuse lines.
 * Keyed WITH the caller's instanceKey: without it, two same-configured blocks
 * evicted each other's entry on every interleaved pass. Bounded above because
 * module state outlives requests on the server.
 */
const previousDocuments = new Map<string, CodeBlockLine[]>();

function sameLine(a: CodeBlockLine, b: CodeBlockLine): boolean {
  if (a.number !== b.number || a.text !== b.text) return false;
  if (a.tokens.length !== b.tokens.length) return false;
  if (JSON.stringify(a.state ?? null) !== JSON.stringify(b.state ?? null)) {
    return false;
  }
  for (let index = 0; index < a.tokens.length; index += 1) {
    const left = a.tokens[index];
    const right = b.tokens[index];
    if (
      left.content !== right.content ||
      left.color !== right.color ||
      left.colorDark !== right.colorDark ||
      left.fontStyle !== right.fontStyle ||
      left.word !== right.word
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Swaps freshly built lines for the previous pass's objects where nothing
 * changed. This is why streaming is cheap: the row is a reference-equality
 * `memo`, so without this, appending one token to a 400 line file re-renders
 * 400 subtrees per chunk.
 */
function reuseUnchangedLines(key: string, next: CodeBlockLine[]): CodeBlockLine[] {
  const previous = previousDocuments.get(key);

  if (previous) {
    for (let index = 0; index < next.length; index += 1) {
      const before = previous[index];
      if (before && sameLine(before, next[index])) next[index] = before;
    }
  }

  previousDocuments.set(key, next);
  if (previousDocuments.size > MAX_TRACKED_DOCUMENTS) {
    const oldest = previousDocuments.keys().next().value;
    if (oldest !== undefined) previousDocuments.delete(oldest);
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/*                                highlightCode                                */
/* -------------------------------------------------------------------------- */

function applyPropState(lines: CodeBlockLine[], options: CodeBlockHighlightOptions): void {
  const highlighted = parseLineSpec(options.highlightedLines);
  const focused = parseLineSpec(options.focusedLines);
  const added = parseLineSpec(options.diff?.added);
  const removed = parseLineSpec(options.diff?.removed);
  const levels = {
    error: parseLineSpec(options.lineLevels?.error),
    warning: parseLineSpec(options.lineLevels?.warning),
    info: parseLineSpec(options.lineLevels?.info),
  };

  lines.forEach((line, index) => {
    const source = index + 1;
    const state: CodeBlockLineState = { ...line.state };

    if (highlighted.has(source)) state.highlighted = true;
    if (focused.has(source)) state.focused = true;
    if (added.has(source)) state.diff = 'add';
    else if (removed.has(source)) state.diff = 'remove';
    for (const level of ['error', 'warning', 'info'] as const) {
      if (levels[level].has(source)) state.level = level;
    }

    line.state = Object.keys(state).length ? state : undefined;
  });
}

/**
 * Highlights `code` into the renderer's line shape. Built on `codeToHast` so
 * consumer transformers run and their line classes land in `line.state`,
 * making prop state and `[!code ++]` notation one feature, not two code
 * paths. Safe in a server component: the result is plain JSON.
 */
export async function highlightCode(code: string, options: CodeBlockHighlightOptions = {}): Promise<CodeBlockLine[]> {
  const source = normalizeCode(code);
  const startLine = options.startLine ?? 1;
  const language = resolveCodeBlockLanguage(options.language);

  if (!language) return toPlainLines(source, startLine);

  const themes = options.themes ?? DEFAULT_CODE_BLOCK_THEMES;
  const signature = JSON.stringify([
    options.instanceKey ?? null,
    language,
    themes,
    startLine,
    options.highlightedLines ?? null,
    options.highlightedWords ?? null,
    options.focusedLines ?? null,
    options.diff ?? null,
    options.lineLevels ?? null,
    (options.transformers ?? []).length,
  ]);

  let root: HastNode;
  try {
    const highlighter = await loadHighlighter();
    const [light, dark] = await Promise.all([
      ensureTheme(highlighter, themes.light),
      ensureTheme(highlighter, themes.dark),
    ]);
    await ensureLanguage(highlighter, language);

    root = highlighter.codeToHast(source, {
      lang: language,
      themes: { light, dark },
      defaultColor: 'light',
      cssVariablePrefix: '--shiki-',
      decorations: buildWordDecorations(source, options.highlightedWords),
      ...(options.transformers?.length ? { transformers: options.transformers } : {}),
    }) as HastNode;
  } catch {
    /* A missing grammar, an unloadable theme or a transformer throwing must not
       take the surface down. Plain text is always readable. */
    return toPlainLines(source, startLine);
  }

  const codeElement = findCodeElement(root);
  if (!codeElement) return toPlainLines(source, startLine);

  const lines: CodeBlockLine[] = [];
  for (const child of codeElement.children ?? []) {
    if (child.type !== 'element') continue;
    const tokens: CodeBlockToken[] = [];
    collectTokens(child, tokens, false);
    lines.push({
      tokens,
      number: startLine + lines.length,
      text: tokens.map((token) => token.content).join(''),
      state: stateFromClasses(classListOf(child)),
    });
  }

  if (!lines.length) return toPlainLines(source, startLine);

  applyPropState(lines, options);
  return reuseUnchangedLines(signature, lines);
}

/** Test seam: drops the singleton and every cached document. */
export function resetCodeBlockHighlighter(): void {
  highlighterPromise = null;
  loadedLanguages.clear();
  loadedThemes.clear();
  previousDocuments.clear();
}

/* -------------------------------------------------------------------------- */
/*                                Unified diff                                 */
/* -------------------------------------------------------------------------- */

export type CodeBlockPatchFile = {
  /** New-side path, or the old one for a deletion. */
  file: string;
  /** Unified view: context, removed and added lines with dual gutter labels. */
  lines: CodeBlockLine[];
  added: number;
  removed: number;
  hunks: { header: string; at: number }[];
};

/**
 * A `git diff` / unified patch, as renderable per-file line sets: feed each
 * file's `lines` to the `lines` prop and the diff tints, `+`/`-` glyphs and
 * dual old/new gutter numbers all come from the parse - no `diff` prop
 * arithmetic against a hand-concatenated string. Tokens are plain; patches
 * read by tint, not grammar.
 */
export function parseUnifiedDiff(patch: string): CodeBlockPatchFile[] {
  const files: CodeBlockPatchFile[] = [];
  let current: CodeBlockPatchFile | null = null;
  let oldNumber = 0;
  let newNumber = 0;
  let width = 4;

  const push = (text: string, state: CodeBlockLineState | undefined, gutter: string) => {
    if (!current) return;
    current.lines.push({
      number: current.lines.length + 1,
      text,
      tokens: [{ content: text }],
      state,
      gutter,
    });
  };
  const pad = (value: number | null) => (value === null ? '' : String(value)).padStart(width);

  for (const raw of normalizeCode(patch).split('\n')) {
    const fileHeader = raw.match(/^diff --git a\/(.+) b\/(.+)$/);
    const plusHeader = raw.match(/^\+\+\+ (?:b\/)?(.+)$/);
    if (fileHeader || plusHeader) {
      const name = fileHeader ? fileHeader[2] : plusHeader![1];
      if (name !== '/dev/null' && (!current || current.file !== name)) {
        current = { file: name, lines: [], added: 0, removed: 0, hunks: [] };
        files.push(current);
      }
      continue;
    }
    if (/^(---|index |old mode|new mode|new file|deleted file|similarity|rename |Binary )/.test(raw)) {
      continue;
    }

    const hunk = raw.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunk && current) {
      oldNumber = Number(hunk[1]);
      newNumber = Number(hunk[3]);
      width = Math.max(
        String(oldNumber + Number(hunk[2] ?? 0)).length,
        String(newNumber + Number(hunk[4] ?? 0)).length,
        2,
      );
      current.hunks.push({ header: raw, at: current.lines.length + 1 });
      push(hunk[5].trim() || raw, { level: 'info' }, `${'·'.padStart(width)} ${'·'.padStart(width)}`);
      continue;
    }
    if (!current || (!raw && files.length === 0)) continue;

    if (raw.startsWith('+')) {
      push(raw.slice(1), { diff: 'add' }, `${pad(null)} ${pad(newNumber)}`);
      newNumber += 1;
      current.added += 1;
    } else if (raw.startsWith('-')) {
      push(raw.slice(1), { diff: 'remove' }, `${pad(oldNumber)} ${pad(null)}`);
      oldNumber += 1;
      current.removed += 1;
    } else if (raw.startsWith(' ') || raw === '') {
      if (current.lines.length === 0 && raw === '') continue;
      push(raw.slice(1), undefined, `${pad(oldNumber)} ${pad(newNumber)}`);
      oldNumber += 1;
      newNumber += 1;
    }
  }

  return files;
}
