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

  taskChooseOrganization: {
    ...ruRU.taskChooseOrganization,
    createOrganization: {
      ...ruRU.taskChooseOrganization?.createOrganization,
      formFieldLabel__slug: "Идентификатор",
    },
  },
};
