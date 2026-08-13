import type { NextConfig } from "next";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Адреса фронта и API берём из общего файла проекта infra/env/.env, чтобы они
 * задавались в одном месте, а не дублировались в .env.local.
 *
 * Next читает .env* только из своей папки, поэтому подтягиваем файл здесь.
 * Разбираем сами, без dotenv: нужны ровно строки вида KEY=value, и заводить
 * ради этого зависимость незачем.
 *
 * ⚠️ Берём ТОЛЬКО ключи NEXT_PUBLIC_*. Загружать файл целиком нельзя: в нём
 * пароль от базы и ключи провайдеров, а всё, что попадёт в окружение сборки,
 * окажется доступно серверу Next — которому эти секреты не нужны. Значения
 * NEXT_PUBLIC_* и так публичные: они вшиваются в браузерный бандл.
 */
function sharedPublicEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), "../../infra/env/.env"), "utf8");
  } catch {
    // Файла нет — это норма: в прод-образе его и не должно быть, значения
    // приходят из build args (frontend/Dockerfile.prod).
    return result;
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("NEXT_PUBLIC_")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    // Комментарий в конце строки (`URL=http://... # прод: ...`) и кавычки.
    const value = trimmed
      .slice(eq + 1)
      .replace(/\s+#.*$/, "")
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) result[key] = value;
  }
  return result;
}

// Приоритет у настоящего окружения: build args прод-образа и локальный
// .env.local должны перекрывать общий файл, а не наоборот.
const publicEnv: Record<string, string> = {};
for (const key of ["NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"] as const) {
  // Пустую строку не пропускаем: в api.ts запасное значение подставляется
  // через ??, который пустую строку НЕ ловит, и адрес API оказался бы пустым.
  const value = process.env[key] || sharedPublicEnv()[key];
  if (value) publicEnv[key] = value;
}

const nextConfig: NextConfig = {
  // Прод-сборка кладёт в .next/standalone самодостаточный сервер вместе с
  // минимальным набором node_modules — из него собирается образ
  // (frontend/Dockerfile.prod). На `pnpm dev` не влияет.
  output: "standalone",

  // Передаём значения в бандл явно: Next инлайнит NEXT_PUBLIC_* по своему
  // загрузчику env, который отрабатывает ДО этого файла, поэтому просто
  // положить их в process.env здесь недостаточно.
  env: publicEnv,
};

export default nextConfig;
