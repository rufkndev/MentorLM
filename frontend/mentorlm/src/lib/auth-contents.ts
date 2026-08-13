/**
 * Тексты экранов входа и регистрации.
 * Копирайт держим отдельно от компонентов — как в остальных *-contents.ts.
 */

export const authContents = {
  signIn: {
    title: "С возвращением",
    subtitle: "Войдите, чтобы продолжить работу с MentorLM.",
    submit: "Войти",
    submitting: "Входим…",
    footerText: "Ещё нет аккаунта?",
    footerLink: { label: "Зарегистрироваться", href: "/sign-up" },
  },
  signUp: {
    title: "Создать аккаунт",
    subtitle: "Начните учиться с MentorLM.",
    submit: "Зарегистрироваться",
    submitting: "Создаём аккаунт…",
    footerText: "Уже есть аккаунт?",
    footerLink: { label: "Войти", href: "/sign-in" },
  },
  fields: {
    email: { label: "Почта", placeholder: "student@vuz.ru" },
    password: { label: "Пароль", placeholder: "••••••••" },
    passwordNew: {
      label: "Пароль",
      placeholder: "Минимум 8 символов",
      hint: "Минимум 8 символов. Не используйте распространённые пароли.",
    },
    passwordRepeat: { label: "Повторите пароль", placeholder: "••••••••" },
  },
  errors: {
    passwordMismatch: "Пароли не совпадают.",
    consentRequired:
      "Чтобы зарегистрироваться, нужно согласиться на обработку персональных данных.",
    unknown: "Что-то пошло не так. Попробуйте ещё раз.",
  },
  // Текст обязательного согласия (152-ФЗ). Ссылки подставляет компонент формы:
  // {terms} → /legal/terms, {privacy} → /legal/privacy.
  consent: {
    before: "Я даю согласие на обработку моих персональных данных и принимаю ",
    terms: { label: "Пользовательское соглашение", href: "/legal/terms" },
    middle: " и ",
    privacy: { label: "Политику конфиденциальности", href: "/legal/privacy" },
    after: "",
  },
} as const;
