"use server";

import { usuarioAtual } from "@/lib/supabase/server";
import { escolherDispositivos, iaConfigurada, type Candidato, type Escolha, LIMITE_TRECHO_IA } from "@/lib/ia";
import { validarDestaque } from "@/lib/destaque";
import { artigosMencionados, referencia } from "@/lib/referencia";
import type { Anotacao, Sugestao } from "@/lib/tipos";

type Resultado<T> = { ok: true; dados: T } | { ok: false, erro: string };

const CAMPOS_ANOTACAO = "id, dispositivo_id, caminho, conteudo, destaque, fonte, origem, criado_em, atualizado_em";

async function exigirUsuario() {
  const { supabase, user } = await usuarioAtual();
  if (!user) throw new Error("Sessão expirada. Entre novamente.");
  return { supabase, user };
}

export async function criarAnotacoes(entrada: {
  normaId: string;
  dispositivoIds: string[];
  conteudo: string;
  /** Trecho em destaque por dispositivo (vindo da sugestão da IA). */
  destaques?: Record<string, string | null>;
  fonte?: string;
  origem: "manual" | "ia";
}): Promise<Resultado<Anotacao[]>> {
  try {
    const { supabase, user } = await exigirUsuario();
    const conteudo = entrada.conteudo.trim();
    if (!conteudo) return { ok: false, erro: "A anotação está vazia." };
    if (entrada.dispositivoIds.length === 0) return { ok: false, erro: "Escolha ao menos um dispositivo." };
    await supabase.from("minhas_normas").upsert({ norma_id: entrada.normaId, user_id: user.id });
    const linhas = entrada.dispositivoIds.slice(0, 10).map((id) => ({
      user_id: user.id,
      norma_id: entrada.normaId,
      dispositivo_id: id,
      caminho: "", // preenchido pelo banco
      conteudo,
      destaque: validarDestaque(entrada.destaques?.[id], conteudo),
      fonte: entrada.fonte?.trim() || null,
      origem: entrada.origem,
    }));
    const { data, error } = await supabase.from("anotacoes").insert(linhas).select(CAMPOS_ANOTACAO);
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: data as Anotacao[] };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function editarAnotacao(id: string, conteudo: string, fonte: string): Promise<Resultado<Anotacao>> {
  try {
    const { supabase } = await exigirUsuario();
    if (!conteudo.trim()) return { ok: false, erro: "A anotação está vazia." };
    const { data: atual } = await supabase.from("anotacoes").select("destaque").eq("id", id).maybeSingle();
    const destaque = validarDestaque(atual?.destaque ?? null, conteudo.trim());
    const { data, error } = await supabase
      .from("anotacoes")
      .update({ conteudo: conteudo.trim(), destaque, fonte: fonte.trim() || null })
      .eq("id", id)
      .select(CAMPOS_ANOTACAO)
      .single();
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: data as Anotacao };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function excluirAnotacao(id: string): Promise<Resultado<null>> {
  try {
    const { supabase } = await exigirUsuario();
    const { error } = await supabase.from("anotacoes").delete().eq("id", id);
    if (error) return { ok: false, erro: error.message };
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

type LinhaDisp = { id: string; pai_id: string | null; rotulo: string; artigo: string; tipo: string; texto: string; estrutura: string | null; ordem: number };

/**
 * Colar e sugerir:
 * 1) pré-filtro barato no banco (busca textual + artigos citados no trecho);
 * 2) só os ~15 melhores candidatos vão para o modelo, que escolhe 1 a 3.
 * Nada é salvo aqui: o usuário confirma na tela.
 */
export async function sugerirDispositivos(normaId: string, trecho: string): Promise<Resultado<{ sugestoes: Sugestao[]; viaIa: boolean }>> {
  try {
    const { supabase, user } = await exigirUsuario();
    const texto = trecho.trim();
    if (texto.length < 15) return { ok: false, erro: "Cole um trecho um pouco maior (mínimo 15 caracteres)." };

    const limite = Number(process.env.LIMITE_SUGESTOES_DIA || 50);
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("uso_ia")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("criado_em", inicioDia.toISOString());
    if ((count ?? 0) >= limite) return { ok: false, erro: `Limite diário de ${limite} sugestões atingido.` };

    // Todos os dispositivos da norma (leve: ~300 linhas) para montar referências completas.
    const { data: todos, error: e1 } = await supabase
      .from("dispositivos")
      .select("id, pai_id, rotulo, artigo, tipo, texto, estrutura, ordem")
      .eq("norma_id", normaId)
      .order("ordem");
    if (e1) return { ok: false, erro: e1.message };
    const porId = new Map((todos as LinhaDisp[]).map((d) => [d.id, d]));
    const caputs = new Map((todos as LinhaDisp[]).filter((d) => d.tipo === "artigo").map((d) => [d.artigo, d.texto]));

    const { data: busca, error: e2 } = await supabase.rpc("buscar_candidatos", {
      p_norma: normaId,
      p_texto: texto,
      p_limite: 12,
    });
    if (e2) return { ok: false, erro: e2.message };

    const ids: string[] = [];
    const citados = artigosMencionados(texto);
    for (const art of citados) {
      (todos as LinhaDisp[])
        .filter((d) => d.artigo === art)
        .slice(0, 8)
        .forEach((d) => ids.push(d.id));
    }
    for (const b of (busca ?? []) as { id: string }[]) ids.push(b.id);
    const unicos = [...new Set(ids)].filter((id) => !porId.get(id)?.texto.startsWith("(VETADO)")).slice(0, 18);

    if (unicos.length === 0) {
      return { ok: true, dados: { sugestoes: [], viaIa: false } };
    }

    const candidatos: Candidato[] = unicos.map((id) => {
      const d = porId.get(id)!;
      return {
        id,
        referencia: referencia(d, porId),
        texto: d.texto,
        caput: d.tipo === "artigo" ? null : caputs.get(d.artigo) ?? null,
        estrutura: d.estrutura,
      };
    });

    let escolhas: Escolha[];
    let viaIa = false;
    if (iaConfigurada()) {
      escolhas = await escolherDispositivos(texto, candidatos);
      viaIa = true;
      await supabase.from("uso_ia").insert({ user_id: user.id, norma_id: normaId, caracteres: Math.min(texto.length, LIMITE_TRECHO_IA) });
    } else {
      // Sem chave de IA: devolve os 3 mais parecidos pela busca textual.
      escolhas = candidatos.slice(0, 3).map((c) => ({
        id: c.id,
        justificativa: "Semelhança de termos (IA não configurada: defina GEMINI_API_KEY).",
        destaque: null,
      }));
    }

    const sugestoes: Sugestao[] = escolhas.map((e) => {
      const c = candidatos.find((x) => x.id === e.id)!;
      const d = porId.get(e.id)!;
      return {
        dispositivo_id: e.id,
        caminho: "",
        referencia: c.referencia,
        texto: d.texto,
        justificativa: e.justificativa,
        destaque: e.destaque,
      };
    });
    return { ok: true, dados: { sugestoes, viaIa } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}
