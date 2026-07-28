/*
 * Оркестрация диалога: состояние сообщений, жизненный цикл диалога, загрузка
 * истории с кэшем, стриминг ответа и обработка ошибок/лимитов.
 * Отделено от рендера — ChatScreen остаётся чисто презентационным и берёт готовое состояние.
 *
 * Идущий ответ живёт НЕ здесь, а в реестре lib/chat-stream: экран чата может
 * размонтироваться посреди генерации (уход в другой режим, /billing), а ответ
 * от этого прерываться не должен — экран лишь подписывается на него.
 */

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import type { ComposerSubmit } from "@/components/mainapp/ChatComposer";
import type {
  Message,
  MessageAttachment,
} from "@/components/mainapp/ChatMessage";
import { useConversations } from "@/components/mainapp/ConversationsProvider";
import { useSubscription } from "@/components/mainapp/SubscriptionProvider";
import { ApiError, useApi } from "@/lib/api";
import {
  loadMessages,
  loadScenario,
  saveMessages,
  saveScenario,
} from "@/lib/chat-cache";
import {
  appendDelta,
  beginReply,
  dropReply,
  endReply,
  getReply,
  patchReply,
  subscribeReply,
} from "@/lib/chat-stream";
import type { Scenario } from "@/lib/mainapp-contents";

/** Ответ бэка на GET /api/conversations/{id}/ (см. ConversationDetailSerializer). */
type ApiConversationDetail = {
  scenario_id?: string;
  messages: ApiMessage[];
  generating?: boolean;
};

/** Сообщение из истории диалога (см. MessageSerializer на бэке). */
type ApiMessage = {
  id: number;
  role: "user" | "assistant";
  kind?: "text" | "notice";
  content: string;
  meta?: {
    code?: string;
    can_upgrade?: boolean;
    degraded?: boolean;
    stopped?: boolean;
  };
  attachments?: MessageAttachment[];
};

// Коды лимитов, которые бэк сохраняет в диалог сообщением-уведомлением
// (см. PERSISTED_LIMIT_CODES в apps/conversations/views.py).
const PERSISTED_LIMIT_CODES = new Set(["mode_quota_exceeded", "feature_locked"]);

// Ожидание ответа, который пишется на сервере без нашего стрима (страницу
// перезагрузили посреди генерации). Потолок попыток нужен на случай, когда лок
// генерации «завис» после смерти воркера: ждать его до TTL бессмысленно.
const GENERATION_POLL_MS = 4000;
const MAX_GENERATION_POLLS = 150; // ~10 минут, с запасом на долгий research

// Сообщение с бэка → сообщение треда. Плашки (лимит тарифа, упрощённая модель,
// остановленный ответ) хранятся в meta, поэтому переживают возврат в чат.
function toMessage(m: ApiMessage): Message {
  const meta = m.meta ?? {};
  return {
    id: String(m.id),
    role: m.role,
    content: m.content,
    attachments: m.attachments,
    notice: m.kind === "notice" ? meta.code || "limit" : undefined,
    degraded: meta.degraded || undefined,
    canUpgrade: meta.can_upgrade || undefined,
    stopped: meta.stopped || undefined,
  };
}

export function useChatSession(
  defaultScenarioId: string,
  scenarios: readonly Scenario[],
) {
  const api = useApi();
  const { userId: clerkUserId } = useAuth();
  const userId = clerkUserId ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, create, refresh } = useConversations();
  const { refreshUsage } = useSubscription();

  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  // Выбранный сценарий держим здесь (а не в композере), чтобы он сохранялся на
  // весь диалог и не сбрасывался при переходе hero→dock композера.
  const [scenarioId, setScenario] = useState(defaultScenarioId);
  const threadRef = useRef<HTMLDivElement>(null);

  // id диалога из URL — источник правды о том, какой чат сейчас на экране.
  const urlConvId = searchParams.get("c");

  // id активного диалога; ref — чтобы сравнивать с URL без перезагрузки истории.
  const [convId, setConvId] = useState<string | null>(null);
  const convIdRef = useRef<string | null>(null);
  convIdRef.current = convId;

  // Диалог только что создан первым сообщением: id у нас уже есть, а навигация
  // на ?c=<id> ещё не применилась. Единственный случай, когда URL отстаёт от
  // состояния законно, — и его нельзя путать с уходом на пустой новый чат.
  const creatingRef = useRef(false);

  // Сценарий — свойство чата, а не режима: у каждого диалога он свой и держится,
  // пока пользователь сам его не сменит; новый чат начинается с дефолта режима.
  // Читаем в эффекте (а не в initial state), чтобы не разойтись с SSR-рендером.
  // Незнакомое значение (сценарий переименовали/убрали) игнорируем.
  useEffect(() => {
    const saved = loadScenario(urlConvId);
    const next =
      saved && scenarios.some((s) => s.id === saved) ? saved : defaultScenarioId;
    setScenario((prev) => (prev === next ? prev : next));
  }, [urlConvId, scenarios, defaultScenarioId]);

  // Смена сценария пользователем — запоминаем её за этим чатом. У ещё не
  // созданного диалога id нет: его сценарий сохраним сразу после создания.
  const setScenarioId = useCallback((id: string) => {
    setScenario(id);
    const current = convIdRef.current;
    if (current) saveScenario(current, id);
  }, []);

  // Идущий (или только что дописанный) ответ этого диалога из реестра. При
  // возврате в чат подписка находит его живым и тред продолжается с того же
  // места, даже если генерацию запускал уже размонтированный экран.
  const live = useSyncExternalStore(
    useCallback((cb) => subscribeReply(convId, cb), [convId]),
    useCallback(() => getReply(convId), [convId]),
    () => null,
  );

  // История с сервера — источник правды. Живой ответ показываем поверх неё,
  // пока история его не догнала (после done бэк уже сохранил сообщение).
  const applyHistory = useCallback(
    (id: string, msgs: Message[]) => {
      saveMessages(userId, id, msgs);
      // Пока история летела, пользователь мог уйти в другой чат — тогда её
      // место только в кэше: подставить её в тред значило бы показать чужие
      // сообщения поверх открытого диалога.
      if (convIdRef.current !== id) return;
      setMessages(msgs);
      const reply = getReply(id);
      if (!reply || reply.streaming) return;
      // Дописанный ответ снимаем с наложения, как только он есть в истории: по
      // id, а если id нет (остановлен, ошибка посреди стрима) — по тому, что
      // последним в диалоге лежит ответ ассистента, т.е. бэк его сохранил.
      const last = msgs[msgs.length - 1];
      const saved =
        reply.messageId !== null
          ? msgs.some((m) => m.id === String(reply.messageId))
          : last?.role === "assistant";
      if (saved) dropReply(id);
    },
    [userId],
  );

  // Ответ пишется на сервере, но живого стрима в этой вкладке нет (страницу
  // перезагрузили посреди генерации) — тогда историю перечитываем по таймеру.
  const [generating, setGenerating] = useState(false);

  // Загрузка истории диалога с бэка (при входе в чат и после конца генерации).
  const fetchHistory = useCallback(
    async (id: string) => {
      const data = await api.get<ApiConversationDetail>(
        `/api/conversations/${id}/`,
      );
      applyHistory(id, data.messages.map(toMessage));
      if (convIdRef.current !== id) return; // чат уже сменили — не трогаем экран
      setGenerating(!!data.generating);
      // Сценарий диалога с бэка применяем, только если локально пользователь его
      // в этом чате не менял: свежий выбор на этом устройстве — важнее.
      const remote = data.scenario_id;
      if (remote && !loadScenario(id) && scenarios.some((s) => s.id === remote)) {
        setScenario(remote);
      }
    },
    [api, applyHistory, scenarios],
  );

  // Прокручиваем вниз только при ПОЯВЛЕНИИ нового сообщения (отправка, загрузка
  // истории), а не на каждый токен ответа — иначе экран дёргается вниз при
  // стриминге. Во время стрима меняется content последнего сообщения, а их
  // количество — нет, поэтому вид остаётся на месте.
  // Смена диалога тоже опускает ленту вниз — но мгновенно, без прокрутки:
  // открытый чат должен сразу показать конец переписки.
  useEffect(() => {
    threadRef.current?.scrollTo({
      top: threadRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [convId]);

  // Подгрузка истории при переходе на /<mode>?c=<id> (в т.ч. из сайдбара).
  // Сначала мгновенно показываем кэш, параллельно тянем свежую историю —
  // переход в чат происходит без пустого экрана и задержки.
  useEffect(() => {
    if (!urlConvId) {
      // Ждём навигации на только что созданный чат — это не переход на пустой.
      if (creatingRef.current) return;
      setConvId(null);
      setMessages([]);
      setGenerating(false);
      setSending(false);
      return;
    }
    if (urlConvId === convIdRef.current) {
      creatingRef.current = false; // URL догнал состояние
      return; // диалог уже активен (напр. только что создан)
    }

    // Сначала переключаем активный диалог, и только потом подставляем его
    // сообщения: пока id не сменился, любая пришедшая история считается чужой.
    setConvId(urlConvId);
    convIdRef.current = urlConvId;
    // Флаги предыдущего чата к новому отношения не имеют: идёт ли генерация,
    // подскажет ответ бэка (лок общий на пользователя), а не старое состояние.
    setGenerating(false);
    setSending(false);
    setMessages(loadMessages(userId, urlConvId) ?? []);

    fetchHistory(urlConvId).catch(() => {});
  }, [urlConvId, userId, fetchHistory]);

  // На жёстком обновлении страницы userId от Clerk появляется не сразу. Как
  // только он готов — подставляем кэш, если история ещё не показана (не трогаем
  // активный стрим: там messages уже непустой).
  useEffect(() => {
    if (!urlConvId || !userId) return;
    setMessages((prev) =>
      prev.length ? prev : loadMessages(userId, urlConvId) ?? prev,
    );
  }, [userId, urlConvId]);

  // Генерация закончилась — ответ уже сохранён на бэке: подтягиваем историю,
  // чтобы у сообщения появился настоящий id и оно попало в кэш. Это же
  // закрывает случай, когда ответ дописался, пока экран был размонтирован.
  const liveStreaming = live?.streaming ?? false;
  useEffect(() => {
    if (!convId || !live || liveStreaming || live.messageId === null) return;
    fetchHistory(convId).catch(() => {});
  }, [convId, live, liveStreaming, fetchHistory]);

  // Ответ дописывается на сервере, а стрима у нас нет (перезагрузили страницу
  // посреди генерации): ждём и перечитываем историю, пока ответ не появится.
  // Опрос прекращается, когда бэк снимает лок генерации, и в любом случае — по
  // счётчику попыток: если воркер умер, лок доживёт до TTL, и ждать его нечего.
  const pollsLeft = useRef(MAX_GENERATION_POLLS);
  const [pollTick, setPollTick] = useState(0);
  useEffect(() => {
    if (!convId || !generating || live) return;
    if (pollsLeft.current <= 0) {
      setGenerating(false); // сдались — разблокируем композер
      return;
    }
    const timer = setTimeout(() => {
      // В фоновой вкладке сеть не дёргаем — просто ждём следующего круга.
      if (!document.hidden) {
        pollsLeft.current -= 1;
        fetchHistory(convId).catch(() => {});
      }
      setPollTick((t) => t + 1); // перезапускаем эффект на следующий круг
    }, GENERATION_POLL_MS);
    return () => clearTimeout(timer);
  }, [convId, generating, live, pollTick, fetchHistory]);

  // Новый диалог — счётчик попыток опроса начинается заново.
  useEffect(() => {
    pollsLeft.current = MAX_GENERATION_POLLS;
  }, [convId]);

  // Кэшируем сообщения активного чата, когда стрим завершён.
  useEffect(() => {
    if (!convId || sending || liveStreaming) return;
    const real = messages.filter((m) => !m.thinking);
    if (real.length) saveMessages(userId, convId, real);
  }, [convId, sending, liveStreaming, messages, userId]);

  // Один прогон генерации: регистрирует живой ответ и разбирает исход. Общий
  // для обычной отправки и для «Повторить» — они отличаются только телом
  // запроса (во втором случае бэк отвечает на уже сохранённый вопрос).
  const runStream = useCallback(
    async (id: string, body: unknown) => {
      // Ответ регистрируем в реестре: с этого момента он переживёт уход с
      // экрана — тред просто снова подпишется на него при возврате.
      const controller = new AbortController();
      const placeholderId = crypto.randomUUID();
      beginReply(
        id,
        { id: placeholderId, role: "assistant", content: "", thinking: true },
        () => {
          // Просим бэк остановиться: он сохранит написанную часть, спишет расход
          // и сразу снимет лок — следующее сообщение можно слать тут же.
          api.post("/api/conversations/stop/", {}).catch(() => {});
          controller.abort();
        },
      );

      try {
        const result = await api.stream(
          `/api/conversations/${id}/messages/`,
          body,
          {
            signal: controller.signal,
            onDelta: (delta) => appendDelta(id, delta),
          },
        );
        // Квота исчерпана — ответ пришёл на упрощённой модели: помечаем
        // сообщение, чтобы показать плашку деградации.
        if (result.degraded) {
          patchReply(id, { degraded: true, canUpgrade: result.canUpgrade });
        }
        // Модель не выдала ни слова — честно говорим об этом и даём повторить,
        // иначе в треде остался бы пустой пузырёк.
        if (result.messageId === null && !getReply(id)?.message.content) {
          patchReply(id, {
            error: "Модель не вернула ответ.",
            canRetry: true,
          });
        }
        endReply(id, result.messageId);
      } catch (err) {
        // Остановлено пользователем — это не ошибка: оставляем уже написанную
        // часть ответа (бэк сохранил её же) и помечаем сообщение.
        if (controller.signal.aborted) {
          patchReply(id, { stopped: true });
          endReply(id, null);
          // Сохранённую бэком часть подтянем из истории — там она с настоящим
          // id. Повтор через паузу: бэк дописывает её уже после обрыва
          // соединения, и первый запрос может успеть раньше сохранения.
          fetchHistory(id).catch(() => {});
          setTimeout(() => fetchHistory(id).catch(() => {}), 1200);
          return;
        }
        // Упор в лимит тарифа бэк сохраняет в диалог отдельным уведомлением —
        // просто перечитываем историю, чтобы плашка осталась и после ухода
        // на /billing и возврата.
        const failure = err instanceof ApiError ? err : null;
        if (failure?.code && PERSISTED_LIMIT_CODES.has(failure.code)) {
          dropReply(id);
          fetchHistory(id).catch(() => {});
          return;
        }
        // Остальные сбои (сеть, лимит частоты, отказ провайдера) НЕ затирают
        // уже написанный текст: показываем его вместе с пояснением и
        // предложением повторить.
        patchReply(id, {
          thinking: false,
          error: failure
            ? failure.message
            : "Не удалось получить ответ. Проверьте связь и попробуйте снова.",
          canRetry: true,
        });
        endReply(id, null);
      } finally {
        setSending(false);
        // Обновляем сайдбар: заголовок чата и порядок по последней активности.
        refresh();
        // И расход: бэк списывает его до конца стрима, поэтому к этому моменту
        // цифры в «Подписке» уже актуальны — пользователь видит остаток сразу,
        // без перезагрузки страницы.
        refreshUsage();
      }
    },
    [api, fetchHistory, refresh, refreshUsage],
  );

  const handleSubmit = useCallback(
    async ({ text, scenarioId, files }: ComposerSubmit) => {
      if (sending || liveStreaming) return;

      setSending(true);

      // Сразу показываем сообщение пользователя (с чипсами файлов) — без
      // ожидания сети, чтобы переход в чат и индикация были мгновенными.
      const attachments = files.map((f) => ({
        filename: f.name,
        size: f.size,
        content_type: f.type,
      }));
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: text,
          attachments: attachments.length ? attachments : undefined,
        },
      ]);

      // Создаём диалог при первом сообщении и фиксируем его в URL.
      let id = convIdRef.current;
      if (!id) {
        try {
          id = await create(mode);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: "Не удалось создать чат.",
            },
          ]);
          setSending(false);
          return;
        }
        setConvId(id);
        convIdRef.current = id;
        creatingRef.current = true; // до применения ?c=<id> URL законно отстаёт
        // Сценарий, выбранный до первой отправки, закрепляем за новым чатом.
        saveScenario(id, scenarioId);
        router.replace(`/${mode}?c=${id}`);
      }

      // С файлами — multipart (FormData), иначе JSON. Промпт сценария выбирает
      // бэк по scenario_id — клиент его не задаёт.
      let body: unknown;
      if (files.length) {
        const fd = new FormData();
        fd.append("content", text);
        fd.append("scenario_id", scenarioId);
        for (const f of files) fd.append("files", f);
        body = fd;
      } else {
        body = { content: text, scenario_id: scenarioId };
      }
      await runStream(id, body);
    },
    [create, liveStreaming, mode, router, runStream, sending],
  );

  // «Повторить» после сбоя: бэк отвечает на последний сохранённый вопрос, не
  // создавая его копию, и убирает неудачный хвост диалога.
  const retry = useCallback(() => {
    const id = convIdRef.current;
    if (!id || sending || liveStreaming) return;
    setSending(true);
    dropReply(id); // старое сообщение с ошибкой убираем — его заменит новый ответ
    runStream(id, { retry: true, scenario_id: scenarioId });
  }, [liveStreaming, runStream, scenarioId, sending]);

  // Остановить генерацию (кнопка «Стоп» на месте отправки). Если стрим начал
  // не этот экран (страницу перезагрузили) — просто просим бэк остановиться,
  // сохранённую часть подтянет опрос истории.
  const stop = useCallback(() => {
    if (live) {
      live.abort();
      return;
    }
    api.post("/api/conversations/stop/", {}).catch(() => {});
  }, [live, api]);

  // Состояние отстаёт от URL ровно один кадр: navigation происходит при
  // рендере, а переключение диалога — в эффекте после него. Без этой проверки
  // в этот кадр на экране оставался бы ПРЕДЫДУЩИЙ чат — при быстрых переходах
  // по сайдбару это и выглядело как «мигает старый чат». Показываем вместо него
  // кэш нужного диалога (или ничего, если его ещё нет).
  const stale =
    convId !== null && urlConvId !== convId && !creatingRef.current;
  const settled = stale
    ? (urlConvId && loadMessages(userId, urlConvId)) || []
    : messages;

  // Тред = история с сервера + живой ответ поверх неё (пока история его не
  // догнала). Пользовательское сообщение в наложение не входит: бэк сохраняет
  // его сразу, и оно приходит в истории.
  const liveMessage = stale ? null : live?.message;
  const visibleMessages = useMemo(
    () => (liveMessage ? [...settled, liveMessage] : settled),
    [settled, liveMessage],
  );

  // Если в URL есть ?c=<id> — это открытый чат: сразу показываем тред (без
  // вспышки приветствия и анимации empty→thread), даже пока грузится история.
  const isEmpty = !urlConvId && visibleMessages.length === 0;

  return {
    messages: visibleMessages,
    // Ответ пишется (в этой вкладке или на сервере после перезагрузки) —
    // композер показывает «Стоп», отправка заблокирована. В кадр рассинхрона с
    // URL состояние прошлого чата не учитываем — оно уже не про этот экран.
    sending: !stale && (sending || liveStreaming || (generating && !live)),
    scenarioId,
    setScenarioId,
    threadRef,
    handleSubmit,
    stop,
    retry,
    isEmpty,
  };
}
