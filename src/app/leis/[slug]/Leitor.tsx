"use client";

import { useMemo, useState, useTransition } from "react";
import type { Anotacao, Dispositivo, Norma, Sugestao } from "@/lib/tipos";
import { referencia } from "@/lib/referencia";
import { criarAnotacoes, editarAnotacao, excluirAnotacao, sugerirDispositivos } from "./actions";

const RECUO: Record<Dispositivo["tipo"], string> = {
  artigo: "",
  paragrafo: "pl-4",
  inciso: "pl-8",
  alinea: "pl-12",
  item: "pl-16",
};

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function Leitor({
  norma,
  dispositivos,
  anotacoesIniciais,
  iaAtiva,
}: {
  norma: Norma;
  dispositivos: Dispositivo[];
  anotacoesIniciais: Anotacao[];
  iaAtiva: boolean;
}) {
  const [anotacoes, setAnotacoes] = useState(anotacoesIniciais);
  const [filtro, setFiltro] = useState("");
  const [soAnotados, setSoAnotados] = useState(false);
  const [abertoPara, setAbertoPara] = useState<string | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);

  const porId = useMemo(() => new Map(dispositivos.map((d) => [d.id, d])), [dispositivos]);
  const anotacoesPorDisp = useMemo(() => {
    const m = new Map<string, Anotacao[]>();
    anotacoes.forEach((a) => {
      if (!a.dispositivo_id) return;
      m.set(a.dispositivo_id, [...(m.get(a.dispositivo_id) ?? []), a]);
    });
    return m;
  }, [anotacoes]);
  const orfas = anotacoes.filter((a) => !a.dispositivo_id);

  // Agrupa por artigo, mantendo a ordem da lei.
  const artigos = useMemo(() => {
    const grupos: { artigo: string; estrutura: string | null; itens: Dispositivo[] }[] = [];
    dispositivos.forEach((d) => {
      const ultimo = grupos[grupos.length - 1];
      if (d.tipo === "artigo" || !ultimo) grupos.push({ artigo: d.artigo, estrutura: d.estrutura, itens: [d] });
      else ultimo.itens.push(d);
    });
    return grupos;
  }, [dispositivos]);

  const visiveis = useMemo(() => {
    const termo = semAcento(filtro.trim());
    return artigos.filter((g) => {
      if (soAnotados && !g.itens.some((d) => anotacoesPorDisp.has(d.id))) return false;
      if (!termo) return true;
      const numero = termo.match(/^(?:art\.?\s*)?(\d+[a-z-]*)$/);
      if (numero) return semAcento(g.artigo).replace(/º/g, "") === `art. ${numero[1]}`;
      return g.itens.some(
        (d) => semAcento(d.texto).includes(termo) || (anotacoesPorDisp.get(d.id) ?? []).some((a) => semAcento(a.conteudo).includes(termo)),
      );
    });
  }, [artigos, filtro, soAnotados, anotacoesPorDisp]);

  const sumario = useMemo(() => {
    const s: { estrutura: string; primeiro: string }[] = [];
    artigos.forEach((g) => {
      const e = g.estrutura ?? "";
      if (!s.length || s[s.length - 1].estrutura !== e) s.push({ estrutura: e, primeiro: g.itens[0].id });
    });
    return s;
  }, [artigos]);

  function irPara(id: string) {
    setFiltro("");
    setSoAnotados(false);
    setDestaque(id);
    requestAnimationFrame(() => document.getElementById(`d-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setTimeout(() => setDestaque((atual) => (atual === id ? null : atual)), 2500);
  }

  function adicionar(novas: Anotacao[]) {
    setAnotacoes((a) => [...a, ...novas]);
  }

  let estruturaAnterior: string | null = null;

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block">
        <nav className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-2 overflow-y-auto pr-2 text-sm">
          <p className="font-semibold text-stone-700">Sumário</p>
          {sumario.map((s) => (
            <button key={s.primeiro} onClick={() => irPara(s.primeiro)} className="block text-left text-stone-600 hover:text-emerald-800">
              {s.estrutura.split(" › ").pop()}
            </button>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header>
          <h1 className="font-serif text-2xl font-semibold">{norma.apelido || norma.titulo}</h1>
          <p className="text-stone-600">{norma.titulo}</p>
          {norma.ementa && <p className="mt-1 text-sm text-stone-500">{norma.ementa}</p>}
          {norma.fonte_url && (
            <a href={norma.fonte_url} target="_blank" rel="noreferrer" className="text-xs text-stone-500 underline">
              Texto compilado do Planalto
            </a>
          )}
        </header>

        <PainelSugestao
          norma={norma}
          iaAtiva={iaAtiva}
          onSalvo={adicionar}
          onVer={irPara}
        />

        <div className="sticky top-14 z-10 -mx-4 mt-6 flex flex-wrap items-center gap-3 border-b border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar: palavra ou nº do artigo (ex.: 29)"
            className="min-w-0 flex-1 rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
          />
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" checked={soAnotados} onChange={(e) => setSoAnotados(e.target.checked)} />
            Só anotados ({anotacoes.length})
          </label>
        </div>

        {visiveis.length === 0 && <p className="mt-6 text-stone-500">Nenhum dispositivo encontrado.</p>}

        <div className="mt-4">
          {visiveis.map((g) => {
            const mostrarTitulo = g.estrutura !== estruturaAnterior;
            estruturaAnterior = g.estrutura;
            return (
              <section key={g.itens[0].id} className="border-b border-stone-100 py-3">
                {mostrarTitulo && g.estrutura && (
                  <h2 className="mb-3 mt-6 text-center text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {g.estrutura.split(" › ").map((p) => (
                      <span key={p} className="block">
                        {p}
                      </span>
                    ))}
                  </h2>
                )}
                {g.itens.map((d) => (
                  <BlocoDispositivo
                    key={d.id}
                    d={d}
                    normaId={norma.id}
                    referenciaCompleta={referencia(d, porId)}
                    anotacoes={anotacoesPorDisp.get(d.id) ?? []}
                    aberto={abertoPara === d.id}
                    destacado={destaque === d.id}
                    onAbrir={() => setAbertoPara(abertoPara === d.id ? null : d.id)}
                    onCriadas={(n) => {
                      adicionar(n);
                      setAbertoPara(null);
                    }}
                    onEditada={(a) => setAnotacoes((lista) => lista.map((x) => (x.id === a.id ? a : x)))}
                    onExcluida={(id) => setAnotacoes((lista) => lista.filter((x) => x.id !== id))}
                  />
                ))}
              </section>
            );
          })}
        </div>

        {orfas.length > 0 && (
          <section className="mt-10 rounded border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold">Anotações sem dispositivo</h2>
            <p className="text-sm text-stone-600">
              O texto da lei foi atualizado e estes dispositivos deixaram de existir. As anotações foram preservadas.
            </p>
            {orfas.map((a) => (
              <CartaoAnotacao
                key={a.id}
                a={a}
                onEditada={(n) => setAnotacoes((l) => l.map((x) => (x.id === n.id ? n : x)))}
                onExcluida={(id) => setAnotacoes((l) => l.filter((x) => x.id !== id))}
              />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function BlocoDispositivo(props: {
  d: Dispositivo;
  normaId: string;
  referenciaCompleta: string;
  anotacoes: Anotacao[];
  aberto: boolean;
  destacado: boolean;
  onAbrir: () => void;
  onCriadas: (a: Anotacao[]) => void;
  onEditada: (a: Anotacao) => void;
  onExcluida: (id: string) => void;
}) {
  const { d } = props;
  const vetado = d.texto.startsWith("(VETADO)");
  return (
    <div
      id={`d-${d.id}`}
      className={`group rounded py-1 transition-colors ${RECUO[d.tipo]} ${props.destacado ? "bg-amber-100" : ""}`}
    >
      <div className="flex items-start gap-2">
        <p className={`flex-1 whitespace-pre-line font-serif leading-relaxed ${vetado ? "text-stone-400" : ""}`}>
          <span className="font-semibold">{d.rotulo}</span>
          {d.tipo === "artigo" || d.tipo === "paragrafo" ? " " : " – "}
          {d.texto}
          {d.notas.length > 0 && <span className="ml-1 font-sans text-xs text-stone-400">({d.notas.join("; ")})</span>}
        </p>
        {!vetado && (
          <button
            onClick={props.onAbrir}
            title={`Anotar em ${props.referenciaCompleta}`}
            className={`shrink-0 rounded px-2 text-sm text-emerald-700 hover:bg-emerald-50 ${props.anotacoes.length || props.aberto ? "" : "opacity-40 group-hover:opacity-100"}`}
          >
            {props.anotacoes.length ? `✎ ${props.anotacoes.length}` : "＋ anotar"}
          </button>
        )}
      </div>
      {props.anotacoes.map((a) => (
        <CartaoAnotacao key={a.id} a={a} onEditada={props.onEditada} onExcluida={props.onExcluida} />
      ))}
      {props.aberto && (
        <EditorNovaAnotacao
          titulo={`Nova anotação em ${props.referenciaCompleta}`}
          onCancelar={props.onAbrir}
          onSalvar={async (conteudo, fonte) => {
            const r = await criarAnotacoes({ normaId: props.normaId, dispositivoIds: [d.id], conteudo, fonte, origem: "manual" });
            if (!r.ok) return r.erro;
            props.onCriadas(r.dados);
            return null;
          }}
        />
      )}
    </div>
  );
}

function EditorNovaAnotacao({
  titulo,
  onSalvar,
  onCancelar,
  conteudoInicial = "",
  fonteInicial = "",
  rotuloBotao = "Salvar",
}: {
  titulo: string;
  onSalvar: (conteudo: string, fonte: string) => Promise<string | null>;
  onCancelar: () => void;
  conteudoInicial?: string;
  fonteInicial?: string;
  rotuloBotao?: string;
}) {
  const [conteudo, setConteudo] = useState(conteudoInicial);
  const [fonte, setFonte] = useState(fonteInicial);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  return (
    <div className="mt-2 rounded border border-emerald-200 bg-white p-3 font-sans">
      <p className="text-xs font-semibold text-stone-500">{titulo}</p>
      <textarea
        autoFocus
        value={conteudo}
        onChange={(e) => setConteudo(e.target.value)}
        rows={4}
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
          onClick={() =>
            iniciar(async () => {
              setErro(await onSalvar(conteudo, fonte));
            })
          }
          className="rounded bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          {pendente ? "Salvando..." : rotuloBotao}
        </button>
        <button onClick={onCancelar} className="rounded px-3 py-1 text-sm text-stone-600 hover:bg-stone-100">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CartaoAnotacao({
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
      <EditorNovaAnotacao
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
    <div className="mt-2 rounded-r border-l-4 border-amber-400 bg-amber-50 px-3 py-2 font-sans text-sm">
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

function PainelSugestao({
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
  const [aberto, setAberto] = useState(true);
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
        setMensagem({ tipo: "erro", texto: "Nenhum dispositivo pertinente encontrado. Você pode anotar manualmente na lei abaixo." });
      }
    });
  }

  function salvar() {
    setMensagem(null);
    iniciarSalvar(async () => {
      const r = await criarAnotacoes({
        normaId: norma.id,
        dispositivoIds: [...marcados],
        conteudo: trecho,
        fonte,
        origem: "ia",
      });
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
    <section className="mt-6 rounded-lg border border-emerald-200 bg-white p-4">
      <button onClick={() => setAberto(!aberto)} className="flex w-full items-center justify-between text-left">
        <span className="font-semibold text-emerald-900">Colar e sugerir onde anotar</span>
        <span className="text-sm text-stone-500">{aberto ? "recolher" : "abrir"}</span>
      </button>
      {aberto && (
        <div className="mt-3 space-y-3">
          <textarea
            value={trecho}
            onChange={(e) => setTrecho(e.target.value)}
            rows={5}
            className="w-full rounded border border-stone-300 p-2 text-sm"
            placeholder="Cole aqui um trecho de julgado, doutrina, notícia ou uma nota sua."
          />
          <input
            value={fonte}
            onChange={(e) => setFonte(e.target.value)}
            className="w-full rounded border border-stone-300 px-2 py-1 text-sm"
            placeholder="Fonte (opcional): ex.: STJ, AgRg no REsp 1.234.567/SP, Rel. Min. ..."
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={sugerir}
              disabled={buscando || trecho.trim().length < 15}
              className="rounded bg-emerald-700 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {buscando ? "Procurando dispositivos..." : "Sugerir dispositivos"}
            </button>
            {!iaAtiva && (
              <span className="text-xs text-amber-700">IA não configurada: sugestões só por semelhança de termos.</span>
            )}
          </div>

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
                        <span className="block font-serif text-stone-700">{s.texto.length > 260 ? s.texto.slice(0, 260) + "…" : s.texto}</span>
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

          {mensagem && (
            <p className={`text-sm ${mensagem.tipo === "erro" ? "text-red-700" : "text-emerald-800"}`}>{mensagem.texto}</p>
          )}
        </div>
      )}
    </section>
  );
}
