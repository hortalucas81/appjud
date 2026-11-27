import { notFound } from "next/navigation";
import { usuarioAtual } from "@/lib/supabase/server";
import { iaConfigurada } from "@/lib/ia";
import type { Anotacao, Dispositivo, Norma } from "@/lib/tipos";
import Leitor from "./Leitor";

export default async function PaginaLei({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, user } = await usuarioAtual();
  const { data: norma } = await supabase
    .from("normas")
    .select("id, slug, titulo, apelido, ementa, fonte_url")
    .eq("slug", slug)
    .maybeSingle();
  if (!norma) notFound();

  const [{ data: dispositivos }, { data: anotacoes }] = await Promise.all([
    supabase
      .from("dispositivos")
      .select("id, caminho, pai_id, tipo, rotulo, artigo, texto, notas, estrutura, ordem")
      .eq("norma_id", norma.id)
      .order("ordem"),
    supabase
      .from("anotacoes")
      .select("id, dispositivo_id, caminho, conteudo, fonte, origem, criado_em, atualizado_em")
      .eq("norma_id", norma.id)
      .eq("user_id", user!.id)
      .order("criado_em"),
  ]);

  return (
    <Leitor
      norma={norma as Norma}
      dispositivos={(dispositivos ?? []) as Dispositivo[]}
      anotacoesIniciais={(anotacoes ?? []) as Anotacao[]}
      iaAtiva={iaConfigurada()}
    />
  );
}
