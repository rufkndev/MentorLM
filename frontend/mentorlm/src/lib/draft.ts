/**
 * Черновик вопроса, введённого на лендинге до входа в приложение.
 * Лендинг (LandingChatTeaser) сохраняет текст в sessionStorage и уводит в чат;
 * пустой экран чата забирает его один раз и подставляет в композер.
 */

const DRAFT_KEY = "mentorlm:draft";

// Сохранить черновик вопроса (перед переходом в чат/на регистрацию).
export function saveDraft(text: string): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, text);
  } catch {
    // sessionStorage может быть недоступен — не блокируем переход
  }
}

// Забрать черновик и сразу удалить его (одноразовое потребление).
export function takeDraft(): string {
  try {
    const v = sessionStorage.getItem(DRAFT_KEY);
    if (v) sessionStorage.removeItem(DRAFT_KEY);
    return v ?? "";
  } catch {
    return "";
  }
}
