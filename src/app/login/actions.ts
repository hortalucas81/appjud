"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { criarClienteServidor } from "@/lib/supabase/server";

function destino(form: FormData) {
  const v = String(form.get("voltar") || "/leis");
  return v.startsWith("/") && !v.startsWith("//") ? v : "/leis";
}

export async function entrar(form: FormData) {
  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") || ""),
    password: String(form.get("senha") || ""),
  });
  if (error) redirect(`/login?erro=${encodeURIComponent("E-mail ou senha incorretos (ou e-mail ainda não confirmado).")}`);
  redirect(destino(form));
}

export async function criarConta(form: FormData) {
  const supabase = await criarClienteServidor();
  const h = await headers();
  const origem = h.get("origin") ?? `https://${h.get("host")}`;
  const { data, error } = await supabase.auth.signUp({
    email: String(form.get("email") || ""),
    password: String(form.get("senha") || ""),
    options: { emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) redirect(`/login?erro=${encodeURIComponent(error.message)}`);
  if (!data.session) {
    redirect(`/login?aviso=${encodeURIComponent("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.")}`);
  }
  redirect(destino(form));
}
