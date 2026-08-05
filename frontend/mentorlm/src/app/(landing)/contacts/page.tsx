/**
 * Страница «Контакты» (/contacts).
 * Каналы связи и юридические реквизиты. Реквизиты оставлены плейсхолдерами в
 * квадратных скобках — заполняются после регистрации юрлица/ИП. Обёртка DocPage.
 */

import type { Metadata } from "next";
import { DocPage } from "@/components/landing/DocPage";

// SEO-метаданные страницы.
export const metadata: Metadata = {
  title: "Контакты",
  description:
    "Каналы связи, юридическая информация и реквизиты Mentor LM для пользователей и партнёров.",
};

// Контент страницы «Контакты».
export default function ContactsPage() {
  return (
    <DocPage
      showMascot
      mascotExpression="calm"
      eyebrow="Контакты"
      title="Связаться с Mentor LM"
      description="Каналы связи, юридическая информация и реквизиты Mentor LM для пользователей и партнёров."
    >
      <h2>Написать нам</h2>
      <ul>
        <li>
          Общие вопросы и поддержка:{" "}
          <a href="mailto:arttaranovbusiness@gmail.com">arttaranovbusiness@gmail.com</a>
        </li>
        <li>
          Сотрудничество и партнёрство:{" "}
          <a href="mailto:arttaranovbusiness@gmail.com">arttaranovbusiness@gmail.com</a>
        </li>
        <li>
          Вопросы по обработке персональных данных:{" "}
          <a href="mailto:arttaranovbusiness@gmail.com">arttaranovbusiness@gmail.com</a>
        </li>
        <li>
          Оплата, счета и возвраты:{" "}
          <a href="mailto:arttaranovbusiness@gmail.com">arttaranovbusiness@gmail.com</a>
        </li>
      </ul>

      <h2>Время работы поддержки</h2>
      <p>
        Поддержка отвечает по будням с 10:00 до 19:00 по московскому времени
        (МСК). Мы стараемся отвечать в течение одного рабочего дня.
      </p>

      <h2>Юридические сведения</h2>
      <p>
        Услуги Сервиса оказывает ИП Таранов Артём Игоревич⁠.
      </p>
      <p>
        <strong>Полное наименование:</strong> Индивидуальный предприниматель Таранов Артём Игоревич
        <br />
        <strong>Сокращённое наименование:</strong> ИП Таранов А.И.
        <br />
        <strong>ОГРН / ОГРНИП:</strong> 325650000017843
        <br />
        <strong>ИНН:</strong> 650302923331
        <br />
        <strong>Юридический адрес:</strong> 693020, Южно-Сахалинск гор., Карла Маркса ул. 14,
      </p>

      <h2>Регуляторные сведения</h2>
      <p>
        Оператор персональных данных зарегистрирован в реестре Роскомнадзора,
        регистрационный номер [номер записи]. Порядок обработки персональных
        данных описан в{" "}
        <a href="/legal/privacy">
          Политике конфиденциальности и обработки персональных данных
        </a>
        . Условия оказания платных услуг — в{" "}
        <a href="/legal/offer">Публичной оферте</a>.
      </p>
    </DocPage>
  );
}
