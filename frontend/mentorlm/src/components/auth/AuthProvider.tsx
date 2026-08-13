/**
 * Провайдер сессии пользователя — единственный источник правды о том, кто вошёл.
 *
 * Схема (описана целиком в backend/mentorlm/apps/users/tokens.py):
 * access-токен живёт ТОЛЬКО в памяти вкладки — ни localStorage, ни cookie,
 * поэтому XSS его не украдёт; refresh-токен лежит в httpOnly-cookie, которую
 * JavaScript не видит вовсе. Отсюда два следствия:
 *
 *  1. После перезагрузки страницы токена нет — сессию восстанавливаем запросом
 *     /api/auth/refresh/, и до его ответа состояние честно "loading".
 *  2. Все запросы к /api/auth/ идут с credentials: "include", иначе браузер не
 *     приложит cookie и не сохранит новую.
 *
 * Хук useAuth() намеренно повторяет форму, к которой привык остальной код
 * ({ isLoaded, isSignedIn, userId, getToken }).
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

// Профиль в том виде, в каком его отдаёт UserProfileSerializer.
export type AuthUser = {
  id: number;
  email: string;
  plan: string;
  email_verified: boolean;
  created_at: string;
};

// "loading" — ещё выясняем, есть ли сессия: на этом состоянии нельзя ни
// показывать приложение, ни уводить на вход.
type Status = "loading" | "authed" | "anon";

type AuthContextValue = {
  status: Status;
  user: AuthUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  /** Токен для заголовка Authorization; force — принудительно обновить. */
  getToken: (force?: boolean) => Promise<string | null>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Ошибка формы входа: код от бэкенда (invalid_credentials, weak_password, …)
// плюс готовый к показу текст.
export class AuthError extends Error {
  constructor(
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Разбирает ответ эндпоинтов сессии: {code, message} у ошибок.
async function readError(res: Response): Promise<AuthError> {
  try {
    const data = (await res.json()) as { code?: string; message?: string };
    if (data?.message) return new AuthError(data.message, data.code);
  } catch {
    // тело не JSON — ниже общий текст
  }
  return new AuthError("Не удалось выполнить запрос. Попробуйте ещё раз.");
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  // Токен держим в ref, а не в state: его читает getToken внутри колбэков
  // api.ts, и лишний ререндер всего дерева на каждое обновление токена не нужен.
  const tokenRef = useRef<string | null>(null);
  // Обещание текущего обновления. Refresh-токен одноразовый: два параллельных
  // запроса провернули бы ротацию дважды, второй предъявил бы уже погашенный
  // токен — и бэкенд, приняв это за кражу, сбросил бы все сессии разом.
  const refreshingRef = useRef<Promise<string | null> | null>(null);

  const applySession = useCallback((data: { access: string; user: AuthUser }) => {
    tokenRef.current = data.access;
    setUser(data.user);
    setStatus("authed");
  }, []);

  const clearSession = useCallback(() => {
    tokenRef.current = null;
    setUser(null);
    setStatus("anon");
  }, []);

  // Обмен refresh-cookie на новый access-токен.
  const refresh = useCallback(async (): Promise<string | null> => {
    if (refreshingRef.current) return refreshingRef.current;

    const run = (async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh/`, {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) {
          clearSession();
          return null;
        }
        const data = (await res.json()) as { access: string; user: AuthUser };
        applySession(data);
        return data.access;
      } catch {
        // Сети нет — это не повод объявлять пользователя разлогиненным:
        // иначе кратковременный обрыв выкидывал бы из приложения.
        return null;
      } finally {
        refreshingRef.current = null;
      }
    })();

    refreshingRef.current = run;
    return run;
  }, [applySession, clearSession]);

  // При монтировании выясняем, есть ли живая сессия.
  useEffect(() => {
    let cancelled = false;
    refresh().then((token) => {
      // Сети не было — токена нет, но и сессию не сбрасывали: показываем как
      // анонимного, войти можно будет вручную.
      if (!cancelled && !token) setStatus((s) => (s === "loading" ? "anon" : s));
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const getToken = useCallback(
    async (force = false): Promise<string | null> => {
      if (!force && tokenRef.current) return tokenRef.current;
      return refresh();
    },
    [refresh],
  );

  // Общая часть входа и регистрации: оба возвращают одну и ту же сессию.
  const submit = useCallback(
    async (path: string, body: Record<string, unknown>) => {
      let res: Response;
      try {
        res = await fetch(`${API_URL}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        });
      } catch {
        throw new AuthError("Нет связи с сервером. Проверьте интернет.", "offline");
      }
      if (!res.ok) throw await readError(res);
      applySession((await res.json()) as { access: string; user: AuthUser });
    },
    [applySession],
  );

  const login = useCallback(
    (email: string, password: string) =>
      submit("/api/auth/login/", { email, password }),
    [submit],
  );

  const register = useCallback(
    (email: string, password: string) =>
      // consent проверяется на бэкенде и обязателен: форма не даёт отправить
      // регистрацию без отмеченного чекбокса согласия (152-ФЗ).
      submit("/api/auth/register/", { email, password, consent: true }),
    [submit],
  );

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout/`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Сервер недоступен — локальную сессию всё равно закрываем: пользователь
      // нажал «Выйти», и остаться внутри он не должен.
    }
    clearSession();
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      isLoaded: status !== "loading",
      isSignedIn: status === "authed",
      userId: user ? String(user.id) : null,
      getToken,
      login,
      register,
      logout,
    }),
    [status, user, getToken, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Доступ к сессии. Бросает вне провайдера — это всегда ошибка разметки.
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth вызван вне <AuthProvider>");
  return ctx;
}
