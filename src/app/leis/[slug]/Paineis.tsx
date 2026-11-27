"use client";

import { useState, useTransition } from "react";
import type { Anotacao, Dispositivo, Norma, Sugestao } from "@/lib/tipos";
import { criarAnotacoes, editarAnotacao, excluirAnotacao, sugerirDispositivos } from "./actions";

/* ------------------------------------------------------------------ */
/* Painel lateral (gaveta) que abre por cima da página                 */
/* ------------------------------------------------------------------ */
export function Gaveta({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-30 bg-stone-900/20 md:hidden" onClick={onFechar} />
      <aside className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85vh] flex-col rounded-t-xl border border-stone-200 bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:max-h-none md:w-[26rem] md:rounded-none md:border-y-0 md:border-r-0">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <p className="font-semibold text-stone-800">{titulo}</p>
          <button onClick={onFechar} className="rounded px-2 py-1 text-stone-500 hover:bg-stone-100" aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Anotações de um dispositivo                                         */
/* ------------------------------------------------------------------ */
export function PainelDispositivo({
  d,
  referencia,
  normaId,
  anotacoes,
  onCriadas,
  onEditada,
  onExcluida,
}: {
  d: Dispositivo;
  referencia: string;
  normaId: string;
  anotacoes: Anotacao[];
  onCriadas: (a: Anotacao[]) => void;
  onEditada: (a: Anotacao) => void;
  onExcluida: (id: string) => void;
}) {
  const [novo, setNovo] = useState(anotacoes.length === 0);
  return (
    <div className="space-y-4">
      <div className="rounded border border-stone-200 bg-stone-50 p-3 font-serif text-[15px] leading-relaxed">
        <p className="mb-1 font-sans text-xs font-semibold uppercase tracking-wide text-stone-500">{referencia}</p>
        <p className="whitespace-pre-line">{d.texto}</p>
        {d.notas.length > 0 && <p className="mt-1 font-sans text-xs text-stone-500">({d.notas.join("; ")})</p>}
      </div>
      {anotacoes.length > 0 && (
        <div>
          <p className="text-sm font-semibold text-stone-700">Minhas anotações ({anotacoes.length})</p>
          {anotacoes.map((a) => (
            <CartaoAnotacao key={a.id} a={a} onEditada={onEditada} onExcluida={onExcluida} />
          ))}
        </div>
      )}
      {novo ? (
        <EditorAnotacao
          titulo="Nova anotação"
          onCancelar={anotacoes.length ? () => setNovo(false) : undefined}
          onSalvar={async (conteudo, fonte) => {
            const r = await criarAnotacoes({ normaId, dispositivoIds: [d.id], conteudo, fonte, origem: "manual" });
            if (!r.ok) return r.erro;
            onCriadas(r.dados);
            setNovo(false);
            return null;
          }}
        />
      ) : (
        <button onClick={() => setNovo(true)} className="rounded border border-emerald-700 px-3 py-1.5 text-sm text-emerald-800 hover:bg-emerald-50">
          ＋ Nova anotação
        </button>
      )}
    </div>
  );
}

export function EditorAnotacao({
  titulo,
  onSalvar,
  onCancelar,
  conteudoInicial = "",
  fonteInicial = "",
}: {
  titulo: string;
  onSalvar: (conteudo: string, fonte: string) => Promise<string | null>;
  onCancelar?: () => void;
  conteudoInicial?: string;
  fonteInicial?: string;
}) {
  const [conteudo, setConteudo] = useState(conteudoInicial);
  const [fonte, setFonte] = useState(fonteInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="mt-2 rounded border border-emerald-200 bg-white p-3">
      <p className="text-xs font-semibold text-stone-500">{titulo}</p>
      <textarea
        autoFocus
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={5}
        className="mt-2 w-full rounded border border-stone-300 p-2 text-sm"
        placeholder="Sua anotação, um trecho de julgado, doutrina..."
      />
      <input
        value={fonte}
        onChange={(e) => setFonte(e.target.value)}
        className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm"
        placeholder="Fonte (opcional): ex.: STJ, REsp 1.234.567/SP"
      />
      {erro && <p className="mt-2 text-sm text-red-700">{erro}</p>}
      <div className="mt-2 flex gap-2">
        <button
          disabled={pendente || !conteudo.trim()}
          onClick={() => iniciar(async () => setErro(await onSalvar(conteudo, fonte)))}
          className="rounded bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {pendente ? "Salvando..." : "Salvar"}
        </button>
        {onCancelar && (
          <button onClick={onCancelar} className="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100">
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export function CartaoAnotacao({
  a,
  onEditada,
  onExcluida,
}: {
  a: Anotacao;
  onEditada: (a: Anotacao) => void;
  onExcluida: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [pendente, iniciar] = useTransition();
  if (editando) {
    return (
      <EditorAnotacao
        titulo="Editar anotação"
        conteudoInicial={a.conteudo}
        fonteInicial={a.fonte ?? ""}
        onCancelar={() => setEditando(false)}
        onSalvar={async (c, f) => {
          const r = await editarAnotacao(a.id, c, f);
          if (!r.ok) return r.erro;
          onEditada(r.dados);
          setEditando(false);
          return null;
        }}
      />
    );
  }
  return (
    <div className="mt-2 rounded-r border-l-4 border-amber-400 bg-amber-50 px-3 py-2 text-sm">
      <p className="whitespace-pre-wrap text-stone-800">{a.conteudo}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-500">
        {a.fonte && <span>Fonte: {a.fonte}</span>}
        {a.origem === "ia" && <span title="Dispositivo sugerido pela IA e confirmado por você">sugerido por IA</span>}
        <span>{new Date(a.atualizado_em).toLocaleDateString("pt-BR")}</span>
        <button onClick={() => setEditando(true)} className="underline hover:text-stone-800">
          editar
        </button>
        <button
          disabled={pendente}
          onClick={() => {
            if (!confirm("Excluir esta anotação?")) return;
            iniciar(async () => {
              const r = await excluirAnotacao(a.id);
              if (r.ok) onExcluida(a.id);
              else alert(r.erro);
            });
          }}
          className="underline hover:text-red-700"
        >
          excluir
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sumário: capítulos/seções e grade de artigos                        */
/* ------------------------------------------------------------------ */
export type SecaoSumario = { estrutura: string; artigos: { id: string; numero: string; anotado: boolean }[] };

export function PainelSumario({ secoes, onIr }: { secoes: SecaoSumario[]; onIr: (id: string) => void }) {
  return (
    <div className="space-y-5">
      {secoes.map((s) => (
        <div key={s.artigos[0]?.id ?? s.estrutura}>
          <button onClick={() => s.artigos[0] && onIr(s.artigos[0].id)} className="text-left text-sm font-semibold text-stone-800 hover:text-emerald-800">
            {s.estrutura.split(" › ").map((p) => (
              <span key={p} className="block">
                {p}
              </span>
            ))}
          </button>
          <div className="mt-2 flex flex-wrap gap-1">
            {s.artigos.map((a) => (
              <button
                key={a.id}
                onClick={() => onIr(a.id)}
                title={`Art. ${a.numero}`}
                className={`min-w-9 rounded border px-1.5 py-0.5 text-xs tabular-nums hover:border-emerald-700 hover:text-emerald-800 ${
                  a.anotado ? "border-amber-400 bg-amber-50" : "border-stone-200"
                }`}
              >
                {a.numero}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-stone-500">Artigos com fundo amarelo têm anotações suas.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Colar e sugerir                                                     */
/* ------------------------------------------------------------------ */
export function PainelSugestao({
  norma,
  iaAtiva,
  onSalvo,
  onVer,
}: {
  norma: Norma;
  iaAtiva: boolean;
  onSalvo: (a: Anotacao[]) => void;
  onVer: (id: string) => void;
}) {
  const [trecho, setTrecho] = useState("");
  const [fonte, setFonte] = useState("");
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const [salvando, iniciarSalvar] = useTransition();

  function sugerir() {
    setMensagem(null);
    setSugestoes(null);
    iniciarBusca(async () => {
      const r = await sugerirDispositivos(norma.id, trecho);
      if (!r.ok) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      setSugestoes(r.dados.sugestoes);
      setMarcados(new Set());
      if (r.dados.sugestoes.length === 0) {
        setMensagem({ tipo: "erro", texto: "Nenhum dispositivo pertinente encontrado. Você pode anotar manualmente clicando no texto da lei." });
      }
    });
  }

  function salvar() {
    setMensagem(null);
    iniciarSalvar(async () => {
      const r = await criarAnotacoes({ normaId: norma.id, dispositivoIds: [...marcados], conteudo: trecho, fonte, origem: "ia" });
      if (!r.ok) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      onSalvo(r.dados);
      setMensagem({ tipo: "ok", texto: `Anotação salva em ${r.dados.length} dispositivo(s).` });
      setTrecho("");
      setFonte("");
      setSugestoes(null);
      setMarcados(new Set());
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-stone-600">
        Cole um julgado, trecho de doutrina ou nota. A IA indica onde anotar e você confirma antes de salvar.
      </p>
      <textarea
        value={trecho}
        onChange={(e) => setTrecho(e.target.value)}
        rows={6}
        className="w-full rounded border border-stone-300 p-2 text-sm"
        placeholder="Cole aqui o trecho."
      />
      <input
        value={fonte}
        onChange={(e) => setFonte(e.target.value)}
        className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
        placeholder="Fonte (opcional): ex.: STJ, AgRg no REsp 1.234.567/SP"
      />
      <button
        onClick={sugerir}
        disabled={buscando || trecho.trim().length < 15}
        className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
      >
        {buscando ? "Procurando dispositivos..." : "Sugerir dispositivos"}
      </button>
      {!iaAtiva && <p className="text-xs text-amber-700">IA não configurada: sugestões só por semelhança de termos.</p>}

      {sugestoes && sugestoes.length > 0 && (
        <div className="rounded border border-stone-200 bg-stone-50 p-3">
          <p className="text-sm font-semibold">Marque onde a anotação deve ser salva:</p>
          <ul className="mt-2 space-y-2">
            {sugestoes.map((s) => (
              <li key={s.dispositivo_id} className="rounded bg-white p-2 text-sm">
                <label className="flex gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={marcados.has(s.dispositivo_id)}
                    onChange={(e) => {
                      const n = new Set(marcados);
                      if (e.target.checked) n.add(s.dispositivo_id);
                      else n.delete(s.dispositivo_id);
                      setMarcados(n);
                    }}
                  />
                  <span className="flex-1">
                    <span className="font-semibold">{s.referencia}</span>
                    <span className="block font-serif text-stone-700">{s.texto.length > 220 ? s.texto.slice(0, 220) + "…" : s.texto}</span>
                    <span className="mt-1 block text-xs text-emerald-800">Por quê: {s.justificativa}</span>
                  </span>
                </label>
                <button onClick={() => onVer(s.dispositivo_id)} className="ml-7 mt-1 text-xs text-stone-500 underline">
                  ver na lei
                </button>
              </li>
            ))}
          </ul>
          <button
            onClick={salvar}
            disabled={salvando || marcados.size === 0}
            className="mt-3 rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {salvando ? "Salvando..." : `Confirmar e salvar (${marcados.size})`}
          </button>
        </div>
      )}
      {mensagem && <p className={`text-sm ${mensagem.tipo === "erro" ? "text-red-700" : "text-emerald-800"}`}>{mensagem.texto}</p>}
    </div>
  );
}
