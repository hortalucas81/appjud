import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { usuarioAtual } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "e-luminatti · Legislação anotável",
  description: "Leis prontas para anotar, com sugestão de dispositivos por IA.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { user } = await usuarioAtual();
  return (
    <html lang="pt-BR">
      <body>
        <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href={user ? "/leis" : "/"} className="font-serif text-lg font-semibold">
              e-luminatti <span className="font-sans text-sm font-normal text-stone-500">legislação anotável</span>
            </Link>
            {user ? (
              <form action="/auth/sair" method="post" className="flex items-center gap-3 text-sm">
                <span className="hidden text-stone-500 sm:inline">{user.email}</span>
                <button className="rounded border border-stone-300 px-3 py-1 hover:bg-stone-100">Sair</button>
              </form>
            ) : (
              <Link href="/login" className="text-sm underline">
                Entrar
              </Link>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
