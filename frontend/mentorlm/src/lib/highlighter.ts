/**
 * Подсветка синтаксиса для блоков кода в ответах ИИ (см. CodeBlock.tsx).
 *
 * Здесь нет React и нет копирайтинга — только работа с Shiki, поэтому модуль
 * лежит в `lib/`.
 *
 * Три решения, которые стоит понимать, прежде чем менять этот файл:
 *
 *  • **JS-движок, а не WASM.** У Shiki движок по умолчанию — Oniguruma на
 *    WebAssembly, а наш CSP (`src/middleware.ts`) не содержит `wasm-unsafe-eval`,
 *    так что он бы просто не запустился. `createJavaScriptRegexEngine`
 *    транспилирует те же грамматики в нативные `RegExp`, а конструктор `RegExp`
 *    под CSP не подпадает. Менять движок = править CSP, а ослаблять `script-src`
 *    ради подсветки в блоке, где рендерится вывод модели, — плохой размен.
 *
 *  • **Токены, а не HTML.** Отдаём `codeToTokens`, а не `codeToHtml`: строку
 *    HTML пришлось бы вставлять через `dangerouslySetInnerHTML`, чего в
 *    Markdown-ветке мы не делаем принципиально (см. шапку Markdown.tsx). Плюс
 *    своя разметка строк — это опора для нумерации и цитирования.
 *
 *  • **Две темы за один проход.** `defaultColor: false` заставляет Shiki
 *    положить в каждый токен обе переменные (`--shiki-light` / `--shiki-dark`),
 *    а какую показать — решает CSS по `data-theme`. Переключение темы после
 *    этого не требует ни повторной токенизации, ни ререндера.
 */

import type { ThemedToken } from "shiki";

/** Одна строка кода — массив раскрашенных токенов. */
export type TokenLine = ThemedToken[];

// Языки, которые грузим по требованию. Ключи статические: `import()` с
// шаблонной строкой заставил бы сборщик положить в бандл ВСЕ грамматики Shiki.
// Пути — из @shikijs/langs напрямую (пакет в зависимостях): подпути вида
// `shiki/langs/*.mjs` идут через wildcard-экспорт, и сборщик разбирает их
// не так, как Node.
const LANGS = {
  python: () => import("@shikijs/langs/python"),
  javascript: () => import("@shikijs/langs/javascript"),
  typescript: () => import("@shikijs/langs/typescript"),
  java: () => import("@shikijs/langs/java"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  go: () => import("@shikijs/langs/go"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  bash: () => import("@shikijs/langs/bash"),
  json: () => import("@shikijs/langs/json"),
  yaml: () => import("@shikijs/langs/yaml"),
  html: () => import("@shikijs/langs/html"),
  css: () => import("@shikijs/langs/css"),
  php: () => import("@shikijs/langs/php"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  swift: () => import("@shikijs/langs/swift"),
} as const;

/** Язык, который мы умеем подсвечивать. */
export type CodeLang = keyof typeof LANGS;

// Псевдонимы, которыми модели реально размечают фенсы.
const ALIASES: Record<string, CodeLang> = {
  py: "python",
  python3: "python",
  js: "javascript",
  mjs: "javascript",
  jsx: "javascript",
  node: "javascript",
  ts: "typescript",
  tsx: "typescript",
  "c++": "cpp",
  cc: "cpp",
  "c#": "csharp",
  cs: "csharp",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  golang: "go",
  rs: "rust",
  kt: "kotlin",
  yml: "yaml",
  postgres: "sql",
  postgresql: "sql",
  psql: "sql",
  mysql: "sql",
  sqlite: "sql",
};

/** Известен ли нам язык; неизвестный показываем без подсветки. */
export function resolveLang(raw: string): CodeLang | null {
  const key = raw.trim().toLowerCase();
  if (key in LANGS) return key as CodeLang;
  return ALIASES[key] ?? null;
}

// Длинные листинги не подсвечиваем вовсе: каждая строка — это десяток span'ов
// с инлайновым стилем, а виртуализации ленты у нас нет. На ответе в тысячу
// строк цена подсветки — заметно просевший скролл всего чата.
const MAX_HIGHLIGHT_LINES = 600;

// Кэш подсветок: ключ — язык плюс код, значение — готовые строки токенов.
// Потолок обязателен, иначе длинный диалог с большими листингами течёт.
const CACHE_LIMIT = 120;
const cache = new Map<string, TokenLine[]>();

function cacheKey(lang: CodeLang, code: string): string {
  return `${lang}:${code}`;
}

function cacheGet(key: string): TokenLine[] | undefined {
  const hit = cache.get(key);
  // Перекладываем в конец: Map хранит порядок вставки, и вытеснять мы будем
  // первый ключ — то есть самый давно не использованный.
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: TokenLine[]): void {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// Хайлайтер один на вкладку: его создание грузит движок и обе темы, и делать
// это на каждый блок кода означало бы мегабайты мусора в длинном чате.
type Highlighter = Awaited<
  ReturnType<typeof import("shiki/core").createHighlighterCore>
>;
let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  highlighterPromise ??= (async () => {
    const [
      { createHighlighterCore },
      { createJavaScriptRegexEngine },
      light,
      dark,
    ] = await Promise.all([
      import("shiki/core"),
      import("shiki/engine/javascript"),
      import("@shikijs/themes/vitesse-light"),
      import("@shikijs/themes/vitesse-dark"),
    ]);
    return createHighlighterCore({
      themes: [light.default, dark.default],
      langs: [],
      // forgiving: на редком паттерне грамматики строгий движок бросает
      // исключение, а нам лучше потерять раскраску одного токена, чем блок.
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  })();
  return highlighterPromise;
}

// Загрузку грамматики держим промисом: пять блоков на python в одном ответе
// иначе стартуют пять параллельных загрузок одного и того же чанка.
const langLoads = new Map<CodeLang, Promise<void>>();

function loadLang(hl: Highlighter, lang: CodeLang): Promise<void> {
  let load = langLoads.get(lang);
  if (!load) {
    load = LANGS[lang]().then((mod) => hl.loadLanguage(mod.default));
    langLoads.set(lang, load);
  }
  return load;
}

/**
 * Готовая подсветка из кэша — синхронно, без ожидания.
 *
 * Нужна, чтобы при возврате к прочитанному сообщению блоки не мигали сначала
 * серым текстом, а сразу показывались раскрашенными.
 */
export function peekTokens(lang: CodeLang, code: string): TokenLine[] | null {
  return cacheGet(cacheKey(lang, code)) ?? null;
}

/**
 * Подсветить код. `null` — подсветки не будет (слишком длинно или сбой),
 * и блок останется обычным текстом: это нормальный исход, а не ошибка.
 */
export async function highlight(
  lang: CodeLang,
  code: string,
): Promise<TokenLine[] | null> {
  const key = cacheKey(lang, code);
  const cached = cacheGet(key);
  if (cached) return cached;

  if (code.split("\n").length > MAX_HIGHLIGHT_LINES) return null;

  try {
    const hl = await getHighlighter();
    await loadLang(hl, lang);
    const { tokens } = hl.codeToTokens(code, {
      lang,
      themes: { light: "vitesse-light", dark: "vitesse-dark" },
      // Цвет по умолчанию не проставляем: обе темы едут в CSS-переменных
      // токена, выбор делает CSS. Заодно снимается фон темы — подложку блока
      // рисуем своей, на брендовых токенах.
      defaultColor: false,
    });
    cacheSet(key, tokens);
    return tokens;
  } catch (error) {
    // Грамматика не загрузилась или движок споткнулся — отдаём текст без
    // раскраски: ронять из-за этого весь ответ незачем. Но молчать нельзя,
    // иначе «подсветки нет» не отличить от «язык не поддерживается».
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[highlighter] не удалось подсветить ${lang}:`, error);
    }
    return null;
  }
}
