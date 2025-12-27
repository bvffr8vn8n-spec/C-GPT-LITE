// app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-5xl px-6 py-14">
        {/* top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
            <div>
              <div className="text-sm text-zinc-400">ChatGPT-lite</div>
              <div className="font-semibold">Локальный чат + история</div>
            </div>
          </div>

          <Link
            href="/threads"
            className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-4 py-2 text-sm hover:bg-zinc-900"
          >
            Открыть чаты
          </Link>
        </div>

        {/* hero */}
        <div className="mt-14 grid gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Мини-интерфейс чата с сохранением диалогов и streaming-ответами
            </h1>
            <p className="mt-5 text-base leading-relaxed text-zinc-300">
              Создавай треды, продолжай общение, смотри историю. Ответы ассистента
              приходят в реальном времени (SSE).
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/threads"
                className="inline-flex items-center justify-center rounded-xl bg-indigo-500 px-5 py-3 font-medium text-white hover:bg-indigo-400"
              >
                Начать чат
              </Link>

              <Link
                href="/threads/new"
                className="inline-flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/40 px-5 py-3 font-medium hover:bg-zinc-900"
              >
                Создать новый тред
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
                Next.js App Router
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
                @ai-sdk/react v3
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
                SQLite (bun:sqlite)
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1">
                SSE streaming
              </span>
            </div>
          </div>

          {/* preview card */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">Превью</div>
              <div className="text-xs text-zinc-400">status: ready</div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">user</div>
                <div className="mt-1">Привет! Что умеешь?</div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                <div className="text-xs text-zinc-400">assistant</div>
                <div className="mt-1">
                  Я отвечаю в реальном времени и сохраняю историю тредов 👍
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/30 p-3 text-sm text-zinc-400">
                Подсказка: открой <span className="text-zinc-200">/threads</span>{" "}
                и начни диалог.
              </div>
            </div>
          </div>
        </div>

        {/* footer */}
        <footer className="mt-16 border-t border-zinc-900 pt-8 text-sm text-zinc-500">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>© {new Date().getFullYear()} ChatGPT-lite</div>
            <div className="flex gap-4">
              <Link className="hover:text-zinc-300" href="/threads">
                Чаты
              </Link>
              <Link className="hover:text-zinc-300" href="/api/threads">
                API /threads
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </main>
  );
}

