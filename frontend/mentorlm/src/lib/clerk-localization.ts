/**
 * Локализация Clerk — русский перевод форм входа/регистрации.
 * Берёт готовый пакет ruRU и точечно переопределяет отдельные подписи.
 * Подключается в корневом ClerkProvider (src/app/layout.tsx).
 */

import { ruRU } from "@clerk/localizations";

// Русская локаль Clerk с нашими правками поверх стандартного перевода.
export const clerkLocalization: typeof ruRU = {
  ...ruRU,

  formFieldLabel__organizationSlug: "Идентификатор",

  // Текст обязательного чекбокса согласия при регистрации (Legal consent).
  // Ссылки берут URL из дашборда Clerk (Terms → /legal/terms, Privacy → /legal/privacy);
  // подпись ссылок задаётся через link("...").
  signUp: {
    ...ruRU.signUp,
    legalConsent: {
      ...ruRU.signUp?.legalConsent,
      checkbox: {
        ...ruRU.signUp?.legalConsent?.checkbox,
        label__termsOfServiceAndPrivacyPolicy:
          'Я даю согласие на обработку моих персональных данных и принимаю {{ termsOfServiceLink || link("Пользовательское соглашение") }} и {{ privacyPolicyLink || link("Политику конфиденциальности") }}',
        label__onlyPrivacyPolicy:
          'Я даю согласие на обработку моих персональных данных в соответствии с {{ privacyPolicyLink || link("Политикой конфиденциальности") }}',
        label__onlyTermsOfService:
          'Я даю согласие на обработку моих персональных данных и принимаю {{ termsOfServiceLink || link("Пользовательское соглашение") }}',
      },
    },
  },

  taskChooseOrganization: {
    ...ruRU.taskChooseOrganization,
    createOrganization: {
      ...ruRU.taskChooseOrganization?.createOrganization,
      formFieldLabel__slug: "Идентификатор",
    },
  },
};
