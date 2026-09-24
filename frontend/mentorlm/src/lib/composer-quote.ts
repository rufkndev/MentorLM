/**
 * Канал «блок кода → композер»: вставить цитату выделенных строк в поле ввода.
 *
 * Текст композера — его собственное состояние (ChatComposer), наружу он не
 * поднят, а между ним и блоком кода в ответе лежат ChatScreen, лента сообщений
 * и Markdown. Протаскивать колбэк через всю эту цепочку ради одной кнопки
 * дороже, чем завести маленькую шину — тем же приёмом, каким живой ответ
 * хранится вне React-дерева (lib/chat-stream.ts).
 *
 * Это событие, а не состояние: снапшота нет, подписчик получает только новые
 * цитаты. Подписчик ровно один — композер на экране.
 */

type Listener = (quote: string) => void;

const listeners = new Set<Listener>();

/** Попросить композер дописать цитату к тексту вопроса. */
export function requestQuote(quote: string): void {
  for (const listener of listeners) listener(quote);
}

/** Подписаться на цитаты; возвращает функцию отписки. */
export function subscribeQuote(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
