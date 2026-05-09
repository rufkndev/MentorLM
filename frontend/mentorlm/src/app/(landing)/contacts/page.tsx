import type { Metadata } from "next";
import { DocPage } from "@/components/landing/DocPage";

export const metadata: Metadata = {
  title: "Контакты",
  description:
    "Юридическая информация и контактные данные Mentor LM для пользователей и партнёров.",
};

export default function ContactsPage() {
  return (
    <DocPage
      eyebrow="Контакты"
      title="Связаться с Mentor LM"
      description="Юридическая информация о компании, реквизиты и каналы связи. Это шаблон — окончательные данные будут опубликованы после регистрации юридического лица."
    >
      <h2>Юридические сведения</h2>
      <p>
        <strong>Наименование:</strong> [Полное наименование организации]
        <br />
        <strong>Сокращённое наименование:</strong> [Сокращённое наименование]
        <br />
        <strong>ОГРН/ОГРНИП:</strong> [Номер]
        <br />
        <strong>ИНН:</strong> [Номер]
        <br />
        <strong>КПП:</strong> [Номер]
        <br />
        <strong>Юридический адрес:</strong> [Адрес]
        <br />
        <strong>Фактический адрес:</strong> [Адрес]
      </p>

      <h2>Банковские реквизиты</h2>
      <p>
        <strong>Расчётный счёт:</strong> [Номер]
        <br />
        <strong>Банк:</strong> [Наименование]
        <br />
        <strong>БИК:</strong> [Номер]
        <br />
        <strong>Корр. счёт:</strong> [Номер]
      </p>

      <h2>Связаться с нами</h2>
      <ul>
        <li>
          Общие вопросы и поддержка:{" "}
          <a href="mailto:hello@mentorlm.ru">hello@mentorlm.ru</a>
        </li>
        <li>
          Сотрудничество:{" "}
          <a href="mailto:partners@mentorlm.ru">partners@mentorlm.ru</a>
        </li>
        <li>
          Вопросы по обработке персональных данных:{" "}
          <a href="mailto:privacy@mentorlm.ru">privacy@mentorlm.ru</a>
        </li>
      </ul>

      <h2>Время работы</h2>
      <p>
        Поддержка отвечает по будням с 10:00 до 19:00 по московскому времени.
        Мы стараемся отвечать в течение одного рабочего дня.
      </p>
    </DocPage>
  );
}
