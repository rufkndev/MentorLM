import type { Metadata } from "next";
import { DocPage } from "@/components/landing/DocPage";

export const metadata: Metadata = {
  title: "Блог",
  description:
    "Блог Mentor LM: гайды по учёбе с AI, разборы возможностей платформы и обновления продукта.",
};

export default function BlogPage() {
  return (
    <DocPage
      eyebrow="Блог"
      title="Скоро здесь появятся материалы"
      description="Мы готовим блог о том, как использовать AI для учёбы по делу: гайды, разборы режимов Mentor LM, истории пользователей и обновления продукта."
    >
      <h2>О чём будем писать</h2>
      <ul>
        <li>Как выстроить рабочее место студента вокруг одного AI-инструмента.</li>
        <li>Разборы режимов Mentor LM: чат, код, конспекты, поиск, разбор задач.</li>
        <li>Практические сценарии: подготовка к экзаменам, работа с PDF-курсом, написание курсовой.</li>
        <li>Обновления и changelog продукта.</li>
      </ul>

      <h2>Хотите получать материалы первыми?</h2>
      <p>
        Напишите нам на{" "}
        <a href="mailto:hello@mentorlm.ru">hello@mentorlm.ru</a> с темой
        «Блог» — мы добавим вас в список ранних читателей и пришлём первые
        статьи, как только они выйдут.
      </p>
    </DocPage>
  );
}
