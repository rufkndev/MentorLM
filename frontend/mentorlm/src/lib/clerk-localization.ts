import { ruRU } from "@clerk/localizations";

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
