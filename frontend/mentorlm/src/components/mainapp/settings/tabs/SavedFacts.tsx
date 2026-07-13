"use client";

import { X } from "lucide-react";
import { useMemoryFacts } from "../hooks";

export function SavedFacts() {
  const { facts, clearAll, removeOne } = useMemoryFacts();
  const count = facts?.length ?? 0;

  return (
    <div className="rounded-xl border border-line bg-paper-2/30 p-4">
      <div className="flex items-center justify-between">
        <p className="text-[13.5px] font-medium text-ink">
          Сохранённые факты{count > 0 && ` · ${count}`}
        </p>
        <button
          type="button"
          onClick={clearAll}
          disabled={count === 0}
          className="text-[12.5px] text-muted transition-colors hover:text-ink disabled:opacity-50 disabled:hover:text-muted"
        >
          Очистить все
        </button>
      </div>

      {facts === null ? (
        <p className="mt-2 text-[12.5px] text-muted">Загрузка…</p>
      ) : count === 0 ? (
        <p className="mt-1 text-[12.5px] text-muted">
          Пока ничего не сохранено. Если включена автоматическая память, модель
          будет добавлять сюда устойчивые факты о вас из диалогов.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {facts.map((f) => (
            <li
              key={f.id}
              className="group flex items-start justify-between gap-2 rounded-lg bg-surface/60 px-2.5 py-1.5"
            >
              <span className="text-[12.5px] leading-snug text-ink-soft">
                {f.content}
              </span>
              <button
                type="button"
                onClick={() => removeOne(f.id)}
                aria-label="Удалить факт"
                className="mt-0.5 shrink-0 text-muted opacity-0 transition-opacity hover:text-ink group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.7} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
