/**
 * Блок кода в ответе ИИ: подсветка, шапка с языком и именем файла, копирование,
 * номера строк, сворачивание длинных листингов и цитирование выделенного.
 *
 * Подключается в Markdown.tsx как замена `pre` — почему именно `pre`, а не
 * `code`, объяснено там же.
 *
 * Вёрстка — утилитами Tailwind прямо здесь, как и у остальных компонентов
 * mainapp/. В globals.css уезжает ровно одно правило — цвет токена из
 * переменных темы (`.md .cb-code span`): его нельзя выразить утилитой, потому
 * что спаны токенов генерируются на лету. Если это правило почему-то не
 * доедет, код останется читаемым — просто без раскраски.
 *
 * Номер строки — настоящий элемент с `data-line`, а не `::before`: по нему
 * работает цитирование выделенного фрагмента в композер.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  ChevronDown,
  Copy,
  MessageSquareQuote,
  Wrench,
} from "lucide-react";
import { createPortal } from "react-dom";
import type { ExtraProps } from "react-markdown";
import { codeBlockCopy } from "@/content/app";
import { cn } from "@/lib/cn";
import { requestQuote } from "@/lib/composer-quote";
import {
  highlight,
  peekTokens,
  resolveLang,
  type CodeLang,
  type TokenLine,
} from "@/lib/highlighter";

// Узел hast, который react-markdown отдаёт в пропе `node`. Берём тип через
// ExtraProps, а не импортом из "hast": пакет типов лежит внутри react-markdown
// и на верхнем уровне не разрешается.
type HastNode = NonNullable<ExtraProps["node"]>;

// Пока модель дописывает блок, его текст меняется десятки раз в секунду.
// Подсвечивать каждую версию бессмысленно — результат выбросит следующая
// дельта, а main thread встанет. Ждём паузы и подсвечиваем устоявшийся код.
const DEBOUNCE_MS = 120;

// Сворачиваем по числу строк, а не по измеренной высоте: без ResizeObserver
// ничего не дёргается на каждой дельте стрима.
const COLLAPSE_LINES = 25;

// Габариты панели цитирования: нужны, чтобы решить, показывать её снизу
// или сверху, и не дать ей уехать за правый край окна.
const PANEL_WIDTH = 240;
const PANEL_HEIGHT = 40;

/** Достать текст и инфостроку фенса из hast-узла `pre`. */
function readCode(node?: HastNode): { code: string; info: string } {
  const codeEl = node?.children.find(
    (child) => child.type === "element" && child.tagName === "code",
  );
  if (!codeEl || codeEl.type !== "element") return { code: "", info: "" };

  const text = codeEl.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("");

  const classes = codeEl.properties?.className;
  const list = Array.isArray(classes) ? classes.map(String) : [];
  const info = list.find((c) => c.startsWith("language-"))?.slice(9) ?? "";

  // remark оставляет у фенса завершающий перевод строки — без обрезки он дал бы
  // лишнюю пустую строку с номером.
  return { code: text.replace(/\n$/, ""), info };
}

/**
 * Разобрать инфостроку: `python` или `python:solution.py`.
 *
 * Имя файла может содержать двоеточие, поэтому режем только по первому.
 */
function parseInfo(info: string): { lang: string; filename: string | null } {
  const at = info.indexOf(":");
  if (at === -1) return { lang: info, filename: null };
  return { lang: info.slice(0, at), filename: info.slice(at + 1) || null };
}

/** Тип строки диффа по первому символу — для окраски всей строки. */
function diffKind(line: string): "add" | "del" | "meta" | undefined {
  if (line.startsWith("+++") || line.startsWith("---")) return "meta";
  if (line.startsWith("@@")) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return undefined;
}

// Подложка строки диффа. Через color-mix, а не чистый зелёный/красный: на
// стеклянном фоне и в тёмной теме насыщенные цвета дают «светофор».
const DIFF_BG: Record<string, string> = {
  add: "bg-[color-mix(in_srgb,#16a34a_14%,transparent)]",
  del: "bg-[color-mix(in_srgb,#dc2626_14%,transparent)]",
  meta: "text-muted",
};

// Блок кода: шапка, тело, кнопка разворота, панель цитирования.
export function CodeBlock({ node }: ExtraProps) {
  const { code, info } = useMemo(() => readCode(node), [node]);
  const { lang, filename } = useMemo(() => parseInfo(info), [info]);

  const isDiff = lang.toLowerCase() === "diff";
  // Диффы красим сами: смысл здесь в знаке строки, а не в синтаксисе, и своя
  // ветка избавляет от загрузки ещё одной грамматики.
  const shikiLang: CodeLang | null = isDiff ? null : resolveLang(lang);

  const [tokens, setTokens] = useState<TokenLine[] | null>(null);
  // Две дельты подряд дают две гонящиеся подсветки; поздний ответ не должен
  // затирать результат более свежего запроса.
  const runRef = useRef(0);

  useEffect(() => {
    if (!shikiLang || !code) {
      setTokens(null);
      return;
    }

    // Синхронный кэш-хит: при возврате к прочитанному сообщению блок не должен
    // сначала мигать серым текстом.
    const cached = peekTokens(shikiLang, code);
    if (cached) {
      setTokens(cached);
      return;
    }

    setTokens(null);
    const run = ++runRef.current;
    const timer = setTimeout(() => {
      void highlight(shikiLang, code).then((result) => {
        if (runRef.current === run) setTokens(result);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [shikiLang, code]);

  const lines = useMemo(() => code.split("\n"), [code]);
  const total = lines.length;
  const collapsible = total > COLLAPSE_LINES;
  const [expanded, setExpanded] = useState(false);
  const gutter = String(total).length;

  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      // Копируем исходную строку, а не текст из DOM: там теперь есть номера
      // строк, и они уехали бы в буфер вместе с кодом.
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Буфер недоступен (нет разрешения/http) — молча ничего не делаем.
    }
  }, [code]);

  // ── Выделение строк и цитирование ───────────────────────────────────────
  // Панель рисуется fixed-порталом в body, а не внутри блока: у фигуры
  // overflow-hidden (иначе скруглённые углы не работают с прокручиваемым pre),
  // и любая всплывашка внутри неё обрезалась бы. Тот же приём, что у меню
  // строки чата в сайдбаре (sidebar/useChatRowMenu.ts).
  const figureRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<{
    from: number;
    to: number;
    top: number;
    left: number;
  } | null>(null);

  const readSelection = useCallback(() => {
    const selection = window.getSelection();
    const figure = figureRef.current;
    if (!selection || selection.isCollapsed || !figure) {
      setPicked(null);
      return;
    }
    const range = selection.getRangeAt(0);
    // Выделение, начатое в другом сообщении, к этому блоку отношения не имеет.
    if (!figure.contains(range.commonAncestorContainer)) {
      setPicked(null);
      return;
    }
    const lineOf = (node: Node | null): number | null => {
      const el = node instanceof Element ? node : (node?.parentElement ?? null);
      const n = Number(el?.closest<HTMLElement>("[data-line]")?.dataset.line);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const a = lineOf(range.startContainer);
    const b = lineOf(range.endContainer);
    if (!a || !b) {
      setPicked(null);
      return;
    }
    // Координаты экранные: панель в портале, к блоку не привязана.
    const rect = range.getBoundingClientRect();
    const below = rect.bottom + 6;
    setPicked({
      from: Math.min(a, b),
      to: Math.max(a, b),
      // Не помещается снизу — показываем над выделением.
      top:
        below + PANEL_HEIGHT > window.innerHeight
          ? rect.top - PANEL_HEIGHT - 6
          : below,
      left: Math.min(
        Math.max(8, rect.left),
        window.innerWidth - PANEL_WIDTH - 8,
      ),
    });
  }, []);

  // Клик мимо блока снимает панель — тем же приёмом, что меню аккаунта.
  useEffect(() => {
    if (!picked) return;
    const close = () => setPicked(null);
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Панель лежит вне фигуры, поэтому проверяем обе: без этого mousedown по
      // кнопке снимал бы панель раньше, чем срабатывал click.
      if (
        !figureRef.current?.contains(target) &&
        !panelRef.current?.contains(target)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [picked]);

  const quote = useCallback(
    (suffix: string) => {
      if (!picked) return;
      const body = lines.slice(picked.from - 1, picked.to).join("\n");
      const where = filename ?? (lang || codeBlockCopy.plain);
      const span =
        picked.from === picked.to
          ? codeBlockCopy.quoteLine(picked.from)
          : codeBlockCopy.quoteRange(picked.from, picked.to);
      requestQuote(
        `${codeBlockCopy.quoteHeader(where, span)}\n\`\`\`${lang}\n${body}\n\`\`\`\n${suffix}`,
      );
      setPicked(null);
      window.getSelection()?.removeAllRanges();
    },
    [picked, lines, filename, lang],
  );

  // ── Тело ────────────────────────────────────────────────────────────────
  // Мемоизируем: Markdown пересоздаёт дерево на каждую дельту стрима, и без
  // этого уже написанные блоки перерисовывались бы вместе с текущим.
  const body = useMemo(() => {
    const limit = collapsible && !expanded ? COLLAPSE_LINES : Infinity;

    const render = (i: number, content: React.ReactNode, diff?: string) => (
      <span
        key={i}
        data-line={i + 1}
        className={cn(
          "flex min-h-[1.55em] w-max min-w-full",
          diff && DIFF_BG[diff],
        )}
      >
        <span
          aria-hidden
          // sticky: при горизонтальной прокрутке номера остаются на месте.
          // select-none — чтобы они не попадали в буфер при выделении мышью.
          // bg-surface-2 повторяет фон блока: колонка должна перекрывать код,
          // уезжающий под неё при горизонтальной прокрутке.
          className="sticky left-0 shrink-0 select-none bg-surface-2 pl-4 pr-5 text-right text-muted/50"
          style={{ width: `calc(${gutter}ch + 2.25rem)` }}
        >
          {i + 1}
        </span>
        <span className="whitespace-pre pr-4">{content}</span>
      </span>
    );

    return tokens
      ? tokens.slice(0, limit).map((line, i) =>
          render(
            i,
            line.map((token, j) => (
              <span key={j} style={token.htmlStyle as CSSProperties}>
                {token.content}
              </span>
            )),
          ),
        )
      : lines
          .slice(0, limit)
          .map((line, i) =>
            render(i, line, isDiff ? diffKind(line) : undefined),
          );
  }, [tokens, lines, isDiff, gutter, collapsible, expanded]);

  const label = filename ?? (info || codeBlockCopy.plain);

  return (
    <figure
      ref={figureRef}
      className="relative my-3 overflow-hidden rounded-xl border border-line bg-surface-2"
    >
      {/* Шапка: имя файла, язык, копирование */}
      <figcaption className="flex items-center gap-2.5 border-b border-line bg-[color-mix(in_srgb,var(--brand-ink)_4%,var(--brand-surface-2))] py-1.5 pl-3.5 pr-1.5">
        <span className="min-w-0 truncate font-mono text-[11.5px] text-ink-soft">
          {label}
        </span>
        {filename && lang && (
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
            {lang}
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? codeBlockCopy.copied : codeBlockCopy.copy}
          title={copied ? codeBlockCopy.copied : codeBlockCopy.copy}
          className="ml-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
        >
          {copied ? (
            <Check className="h-[14px] w-[14px]" strokeWidth={2} />
          ) : (
            <Copy className="h-[14px] w-[14px]" strokeWidth={1.7} />
          )}
        </button>
      </figcaption>

      {/* Тело: в свёрнутом виде в него отрисованы только первые строки */}
      <pre
        onMouseUp={readSelection}
        className="cb-pre thin-scroll m-0 overflow-x-auto bg-transparent py-3 leading-[1.55]"
      >
        <code className="cb-code block bg-transparent p-0 font-mono">
          {body}
        </code>
      </pre>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2 text-[12px] text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_5%,transparent)]"
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              expanded && "rotate-180",
            )}
            strokeWidth={2}
          />
          {expanded ? codeBlockCopy.collapse : codeBlockCopy.expand(total)}
        </button>
      )}

      {/* Панель цитирования — порталом, чтобы её не обрезал блок */}
      {picked &&
        createPortal(
          <div
            ref={panelRef}
            className="glass-strong fixed z-[100] flex items-center gap-0.5 rounded-xl p-1 shadow-[0_10px_30px_-12px_rgba(9,15,31,0.45)]"
            style={{ top: picked.top, left: picked.left }}
          >
            <QuoteButton
              icon={MessageSquareQuote}
              label={codeBlockCopy.quoteAsk}
              onClick={() => quote(codeBlockCopy.quoteAskSuffix)}
            />
            <span aria-hidden className="h-4 w-px bg-line" />
            <QuoteButton
              icon={Wrench}
              label={codeBlockCopy.quoteFix}
              onClick={() => quote(codeBlockCopy.quoteFixSuffix)}
            />
          </div>,
          document.body,
        )}
    </figure>
  );
}

// Кнопка панели цитирования.
function QuoteButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Wrench;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium text-ink-soft transition-colors hover:bg-[color-mix(in_srgb,var(--brand-ink)_8%,transparent)] hover:text-ink"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
      {label}
    </button>
  );
}
