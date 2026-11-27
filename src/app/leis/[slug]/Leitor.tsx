"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Anotacao, Dispositivo, Norma } from "@/lib/tipos";
import { referencia } from "@/lib/referencia";
import { CartaoAnotacao, Fonte, Gaveta, TextoAnotacao, PainelDispositivo, PainelSugestao, PainelSumario, type SecaoSumario } from "./Paineis";

/*
 * Leitura em formato de vade mécum: "lei seca" em páginas de duas colunas.
 * Cada dispositivo é um bloco; os blocos são medidos numa cópia invisível e
 * distribuídos coluna a coluna, página a página, como num código impresso.
 */

const ALTURA_COLUNA = 1000; // px de texto por coluna (altura útil da "folha")
const LARGURA_MINIMA_2_COLUNAS = 700; // abaixo disso (celular), uma coluna contínua

type Bloco =
  | { chave: string; tipo: "titulo"; partes: string[] }
  | { chave: string; tipo: "disp"; d: Dispositivo };

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function numeroArtigo(rotulo: string) {
  return rotulo.replace(/^Art\.\s*/, "");
}

/** Destaca o termo buscado (ignora acentos e maiúsculas). */
function Destacado({ texto, termo }: { texto: string; termo: string }) {
  if (!termo) return <>{texto}</>;
  const base = Array.from(texto, (c) => semAcento(c).charAt(0) || c).join("");
  const partes: React.ReactNode[] = [];
  let i = 0;
  let j = base.indexOf(termo);
  while (j >= 0 && termo) {
    partes.push(texto.slice(i, j));
    partes.push(
      <mark key={j} className="rounded-sm bg-yellow-200">
        {texto.slice(j, j + termo.length)}
      </mark>,
    );
    i = j + termo.length;
    j = base.indexOf(termo, i);
  }
  partes.push(texto.slice(i));
  return <>{partes}</>;
}

/* ------------------------------------------------------------------ */
/* Um dispositivo na página                                            */
/* ------------------------------------------------------------------ */
const RECUO: Record<Dispositivo["tipo"], string> = {
  artigo: "indent-5",
  paragrafo: "indent-5",
  inciso: "pl-3 indent-5",
  alinea: "pl-6 indent-5",
  item: "pl-9 indent-5",
};

function TextoDispositivo({
  d,
  anotacoes,
  mostrarNotas,
  termo,
  selecionado,
  destacado,
  onAbrir,
  comId,
}: {
  d: Dispositivo;
  anotacoes: Anotacao[];
  mostrarNotas: boolean;
  termo: string;
  selecionado: boolean;
  destacado: boolean;
  onAbrir?: () => void;
  comId: boolean;
}) {
  const vetado = d.texto.startsWith("(VETADO)");
  const rotulo = d.tipo === "artigo" && !d.rotulo.endsWith("º") ? `${d.rotulo}.` : d.rotulo;
  const separador = d.tipo === "inciso" || d.tipo === "item" ? " – " : " ";
  const [primeira, ...resto] = d.texto.split("\n");
  return (
    <div
      id={comId ? `d-${d.id}` : undefined}
      onClick={onAbrir}
      className={`cursor-pointer rounded-sm px-1 pb-1.5 transition-colors ${
        selecionado ? "bg-emerald-50 ring-1 ring-emerald-300" : destacado ? "bg-amber-100" : "hover:bg-stone-100"
      } ${d.tipo === "artigo" ? "pt-2" : ""}`}
    >
      <p className={`${RECUO[d.tipo]} text-justify hyphens-auto ${vetado ? "text-stone-400" : ""}`}>
        <span className="font-bold">{rotulo}</span>
        {separador}
        <Destacado texto={primeira} termo={termo} />
        {anotacoes.length > 0 && (
          <sup className="ml-0.5 rounded bg-amber-300 px-1 font-sans text-[10px] font-semibold text-amber-950" title={`${anotacoes.length} anotação(ões)`}>
            {anotacoes.length}
          </sup>
        )}
        {d.notas.length > 0 && <span className="ml-1 font-sans text-[10.5px] text-stone-400">({d.notas.join("; ")})</span>}
      </p>
      {resto.map((linha, i) => (
        <p key={i} className={`${RECUO[d.tipo]} text-justify hyphens-auto`}>
          <Destacado texto={linha} termo={termo} />
        </p>
      ))}
      {mostrarNotas &&
        anotacoes.map((a) => (
          <div key={a.id} className="ml-3 mt-1 border-l-2 border-amber-400 bg-amber-50/70 px-2 py-1 font-sans text-[11.5px] leading-snug text-stone-700">
            <TextoAnotacao a={a} expansivel={false} />
            {a.fonte && (
              <span className="text-stone-500">
                {" "}
                <Fonte fonte={a.fonte} />
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

function Titulo({ partes }: { partes: string[] }) {
  return (
    <div className="pb-2 pt-4 text-center font-serif">
      {partes.map((p, i) => {
        const [rotulo, nome] = p.split(" – ");
        return (
          <div key={p} className={i > 0 ? "mt-1" : ""}>
            <p className="text-[12px] font-bold uppercase tracking-wider">{rotulo}</p>
            {nome && <p className={`text-[12.5px] ${/^(CAP|T[IÍ]T)/i.test(rotulo) ? "font-bold uppercase" : "italic"}`}>{nome}</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Leitor                                                              */
/* ------------------------------------------------------------------ */
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
  const [busca, setBusca] = useState("");
  const [soAnotados, setSoAnotados] = useState(false);
  const [mostrarNotas, setMostrarNotas] = useState(true);
  const [painel, setPainel] = useState<{ tipo: "disp"; id: string } | { tipo: "sumario" } | { tipo: "sugerir" } | null>(null);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [irArtigo, setIrArtigo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const porId = useMemo(() => new Map(dispositivos.map((d) => [d.id, d])), [dispositivos]);
  const anotacoesPorDisp = useMemo(() => {
    const m = new Map<string, Anotacao[]>();
    anotacoes.forEach((a) => a.dispositivo_id && m.set(a.dispositivo_id, [...(m.get(a.dispositivo_id) ?? []), a]));
    return m;
  }, [anotacoes]);
  const orfas = anotacoes.filter((a) => !a.dispositivo_id);

  // Artigos (com seus parágrafos, incisos...) na ordem da lei.
  const artigos = useMemo(() => {
    const g: { estrutura: string; itens: Dispositivo[] }[] = [];
    dispositivos.forEach((d) => {
      if (d.tipo === "artigo" || !g.length) g.push({ estrutura: d.estrutura ?? "", itens: [d] });
      else g[g.length - 1].itens.push(d);
    });
    return g;
  }, [dispositivos]);

  const termo = semAcento(busca.trim());
  const termoValido = termo.length >= 3 ? termo : "";

  const filtrando = Boolean(termoValido) || soAnotados;
  const primeiraRender = useRef(true);
  useEffect(() => {
    // ao filtrar, volta para o começo dos resultados
    if (primeiraRender.current) {
      primeiraRender.current = false;
      return;
    }
    const el = caixaRef.current;
    if (filtrando && el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 140 });
  }, [termoValido, soAnotados, filtrando]);

  const visiveis = useMemo(
    () =>
      artigos.filter((g) => {
        if (soAnotados && !g.itens.some((d) => anotacoesPorDisp.has(d.id))) return false;
        if (!termoValido) return true;
        return g.itens.some(
          (d) => semAcento(d.texto).includes(termoValido) || (anotacoesPorDisp.get(d.id) ?? []).some((a) => semAcento(a.conteudo).includes(termoValido)),
        );
      }),
    [artigos, soAnotados, termoValido, anotacoesPorDisp],
  );

  // Blocos na ordem: títulos de capítulo/seção quando mudam + dispositivos.
  const blocos = useMemo(() => {
    const b: Bloco[] = [];
    let anterior: string | null = null;
    visiveis.forEach((g) => {
      if (g.estrutura !== anterior) {
        const partesNovas = g.estrutura.split(" › ");
        const partesAnteriores = (anterior ?? "").split(" › ");
        // repete o capítulo só quando ele muda; seção nova mostra só a seção
        const inicio = partesNovas.findIndex((p, i) => p !== partesAnteriores[i]);
        b.push({ chave: `t-${g.itens[0].id}`, tipo: "titulo", partes: partesNovas.slice(Math.max(inicio, 0)) });
        anterior = g.estrutura;
      }
      g.itens.forEach((d) => b.push({ chave: d.id, tipo: "disp", d }));
    });
    return b;
  }, [visiveis]);

  const secoesSumario: SecaoSumario[] = useMemo(() => {
    const s: SecaoSumario[] = [];
    artigos.forEach((g) => {
      if (!s.length || s[s.length - 1].estrutura !== g.estrutura) s.push({ estrutura: g.estrutura, artigos: [] });
      s[s.length - 1].artigos.push({
        id: g.itens[0].id,
        numero: numeroArtigo(g.itens[0].rotulo),
        anotado: g.itens.some((d) => anotacoesPorDisp.has(d.id)),
      });
    });
    return s;
  }, [artigos, anotacoesPorDisp]);

  /* --------------------------- medição e paginação --------------------------- */
  const caixaRef = useRef<HTMLDivElement>(null);
  const fantasmaRef = useRef<HTMLDivElement>(null);
  const [larguraCaixa, setLarguraCaixa] = useState(0);
  const [alturas, setAlturas] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    const el = caixaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setLarguraCaixa(el.clientWidth));
    ro.observe(el);
    setLarguraCaixa(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const duasColunas = larguraCaixa >= LARGURA_MINIMA_2_COLUNAS;
  const larguraPagina = Math.min(larguraCaixa, 900);
  const larguraColuna = Math.floor((larguraPagina - 2 * 40 - 32) / 2); // margens 40px, entre colunas 32px

  useLayoutEffect(() => {
    if (!duasColunas || !fantasmaRef.current) return;
    const m = new Map<string, number>();
    fantasmaRef.current.querySelectorAll<HTMLElement>("[data-k]").forEach((el) => m.set(el.dataset.k!, el.offsetHeight));
    setAlturas(m);
  }, [blocos, mostrarNotas, anotacoesPorDisp, larguraColuna, duasColunas, termoValido]);

  // Fontes carregadas mudam as alturas: mede de novo.
  useEffect(() => {
    document.fonts?.ready.then(() => setAlturas((a) => (a ? new Map(a) : a)));
  }, []);

  const paginas = useMemo(() => {
    if (!duasColunas || !alturas) return [];
    const pags: Bloco[][][] = [];
    let pag: Bloco[][] = [[], []];
    let col = 0;
    let usado = 0;
    const avancar = () => {
      col++;
      usado = 0;
      if (col === 2) {
        pags.push(pag);
        pag = [[], []];
        col = 0;
      }
    };
    blocos.forEach((b, i) => {
      const h = alturas.get(b.chave) ?? 0;
      // título não fica sozinho no pé da coluna
      const necessario = b.tipo === "titulo" ? h + (alturas.get(blocos[i + 1]?.chave) ?? 0) : h;
      if (usado > 0 && usado + necessario > ALTURA_COLUNA) avancar();
      pag[col].push(b);
      usado += h;
    });
    if (pag[0].length) pags.push(pag);
    return pags;
  }, [blocos, alturas, duasColunas]);

  /* ------------------------------- navegação ------------------------------- */
  const irPara = useCallback((id: string, abrir = false) => {
    setBusca("");
    setSoAnotados(false);
    setDestaque(id);
    if (abrir) setPainel({ tipo: "disp", id });
    setTimeout(() => document.getElementById(`d-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    setTimeout(() => setDestaque((atual) => (atual === id ? null : atual)), 2500);
  }, []);

  function irParaArtigo(e: React.FormEvent) {
    e.preventDefault();
    const n = irArtigo.trim().toUpperCase().replace(/^ART\.?\s*/, "").replace(/[º°O]$/, "");
    const alvo = artigos.find((g) => numeroArtigo(g.itens[0].rotulo).replace("º", "").toUpperCase() === n);
    if (alvo) {
      setAviso(null);
      irPara(alvo.itens[0].id);
      setIrArtigo("");
    } else setAviso(`Art. ${irArtigo} não encontrado.`);
  }

  const abrirDisp = (id: string) => setPainel({ tipo: "disp", id });
  const selecionado = painel?.tipo === "disp" ? painel.id : null;
  const adicionar = (novas: Anotacao[]) => setAnotacoes((a) => [...a, ...novas]);
  const editar = (a: Anotacao) => setAnotacoes((l) => l.map((x) => (x.id === a.id ? a : x)));
  const excluir = (id: string) => setAnotacoes((l) => l.filter((x) => x.id !== id));

  const renderBloco = (b: Bloco, comId: boolean) =>
    b.tipo === "titulo" ? (
      <Titulo partes={b.partes} />
    ) : (
      <TextoDispositivo
        d={b.d}
        anotacoes={anotacoesPorDisp.get(b.d.id) ?? []}
        mostrarNotas={mostrarNotas}
        termo={termoValido}
        selecionado={comId && selecionado === b.d.id}
        destacado={comId && destaque === b.d.id}
        onAbrir={comId ? () => abrirDisp(b.d.id) : undefined}
        comId={comId}
      />
    );

  const intervalo = (cols: Bloco[][]) => {
    const arts = cols.flat().flatMap((b) => (b.tipo === "disp" ? [numeroArtigo(b.d.artigo)] : []));
    if (!arts.length) return "";
    const [a, z] = [arts[0], arts[arts.length - 1]];
    return a === z ? `Art. ${a}` : `Arts. ${a} a ${z}`;
  };

  const nomeCurto = norma.titulo.replace(/,? de \d+ de \w+ de (\d{4})/, "/$1");
  const dispSelecionado = selecionado ? porId.get(selecionado) : undefined;

  return (
    <div className="-my-6 ml-[calc(50%-50vw)] min-h-screen w-screen bg-stone-200/70 pb-16">
      {/* Barra de navegação */}
      <div className="sticky top-[57px] z-20 border-b border-stone-300 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <button onClick={() => setPainel({ tipo: "sumario" })} className="rounded border border-stone-300 px-3 py-1.5 hover:bg-stone-100">
            ☰ Sumário
          </button>
          <form onSubmit={irParaArtigo} className="flex items-center">
            <input
              value={irArtigo}
              onChange={(e) => setIrArtigo(e.target.value)}
              placeholder="Art. nº"
              inputMode="numeric"
              className="w-20 rounded-l border border-stone-300 px-2 py-1.5"
              aria-label="Ir para o artigo"
            />
            <button className="rounded-r border border-l-0 border-stone-300 px-2 py-1.5 hover:bg-stone-100">Ir</button>
          </form>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no texto e nas anotações"
            className="min-w-40 flex-1 rounded border border-stone-300 px-2 py-1.5"
          />
          <label className="flex items-center gap-1.5 whitespace-nowrap">
            <input type="checkbox" checked={soAnotados} onChange={(e) => setSoAnotados(e.target.checked)} />
            Só anotados ({anotacoes.length})
          </label>
          <label className="flex items-center gap-1.5 whitespace-nowrap">
            <input type="checkbox" checked={mostrarNotas} onChange={(e) => setMostrarNotas(e.target.checked)} />
            Anotações na página
          </label>
          <button onClick={() => setPainel({ tipo: "sugerir" })} className="rounded bg-emerald-700 px-3 py-1.5 text-white hover:bg-emerald-800">
            ✦ Colar e sugerir
          </button>
        </div>
        {(aviso || termoValido || soAnotados) && (
          <p className="mx-auto max-w-[900px] px-3 pb-2 text-xs text-stone-600">
            {aviso ?? `${visiveis.length} artigo(s) encontrado(s).`}
            {(termoValido || soAnotados) && (
              <button
                className="ml-2 underline"
                onClick={() => {
                  setBusca("");
                  setSoAnotados(false);
                }}
              >
                limpar filtro
              </button>
            )}
          </p>
        )}
      </div>

      <div ref={caixaRef} className="relative mx-auto mt-6 max-w-[900px]">
        {/* Cópia invisível para medir a altura de cada bloco */}
        {duasColunas && (
          <div
            ref={fantasmaRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 font-serif text-[13.5px] leading-[1.45]"
            style={{ width: larguraColuna }}
            lang="pt-BR"
          >
            {blocos.map((b) => (
              <div key={b.chave} data-k={b.chave}>
                {renderBloco(b, false)}
              </div>
            ))}
          </div>
        )}

        {/* Folha de rosto */}
        <div className="mx-auto mb-4 bg-white px-6 py-6 text-center shadow-md sm:px-10" style={{ maxWidth: duasColunas ? larguraPagina : undefined }}>
          <p className="font-serif text-xl font-bold uppercase tracking-wide">{norma.apelido || norma.titulo}</p>
          <p className="mt-1 font-serif text-sm font-bold">{norma.titulo.toUpperCase()}</p>
          {norma.ementa && <p className="mx-auto mt-3 max-w-md font-serif text-[13px] italic text-stone-700">{norma.ementa}</p>}
          {norma.fonte_url && (
            <a href={norma.fonte_url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-xs text-stone-500 underline">
              Texto compilado do Planalto
            </a>
          )}
          <p className="mt-3 text-xs text-stone-500">Clique em qualquer artigo, parágrafo, inciso ou alínea para anotar.</p>
        </div>

        {visiveis.length === 0 && <p className="bg-white p-6 text-center text-stone-500 shadow-md">Nenhum dispositivo encontrado.</p>}

        {duasColunas ? (
          paginas.map((cols, n) => (
            <article
              key={n}
              className="mx-auto mb-6 bg-white shadow-md"
              style={{ width: larguraPagina, padding: "28px 40px 20px" }}
              lang="pt-BR"
            >
              <header className="mb-3 flex items-baseline justify-between border-b border-stone-800 pb-1 font-serif text-[11px] uppercase tracking-wider">
                <span className="font-bold">{intervalo(cols)}</span>
                <span>{nomeCurto}</span>
              </header>
              <div className="relative flex gap-8 font-serif text-[13.5px] leading-[1.45] text-stone-900" style={{ minHeight: filtrando ? undefined : ALTURA_COLUNA }}>
                <div className="absolute inset-y-0 left-1/2 w-px bg-stone-200" aria-hidden />
                {cols.map((col, c) => (
                  <div key={c} className="flex-none" style={{ width: larguraColuna }}>
                    {col.map((b) => (
                      <div key={b.chave}>{renderBloco(b, true)}</div>
                    ))}
                  </div>
                ))}
              </div>
              <footer className="mt-3 border-t border-stone-300 pt-1 text-center font-serif text-[11px] text-stone-500">{n + 1}</footer>
            </article>
          ))
        ) : (
          <article className="bg-white px-4 py-4 font-serif text-[15px] leading-relaxed shadow-md" lang="pt-BR">
            {blocos.map((b) => (
              <div key={b.chave}>{renderBloco(b, true)}</div>
            ))}
          </article>
        )}

        {orfas.length > 0 && (
          <section className="mx-auto mt-6 max-w-[900px] rounded border border-amber-300 bg-amber-50 p-4">
            <h2 className="font-semibold">Anotações sem dispositivo</h2>
            <p className="text-sm text-stone-600">O texto da lei foi atualizado e estes dispositivos deixaram de existir. As anotações foram preservadas.</p>
            {orfas.map((a) => (
              <CartaoAnotacao key={a.id} a={a} onEditada={editar} onExcluida={excluir} />
            ))}
          </section>
        )}
      </div>

      {painel?.tipo === "sumario" && (
        <Gaveta titulo="Sumário" onFechar={() => setPainel(null)}>
          <PainelSumario
            secoes={secoesSumario}
            onIr={(id) => {
              irPara(id);
              if (window.innerWidth < 768) setPainel(null);
            }}
          />
        </Gaveta>
      )}
      {painel?.tipo === "sugerir" && (
        <Gaveta titulo="Colar e sugerir onde anotar" onFechar={() => setPainel(null)}>
          <PainelSugestao norma={norma} iaAtiva={iaAtiva} onSalvo={adicionar} onVer={(id) => irPara(id)} />
        </Gaveta>
      )}
      {dispSelecionado && (
        <Gaveta titulo="Anotar" onFechar={() => setPainel(null)}>
          <PainelDispositivo
            key={dispSelecionado.id}
            d={dispSelecionado}
            referencia={referencia(dispSelecionado, porId)}
            normaId={norma.id}
            anotacoes={anotacoesPorDisp.get(dispSelecionado.id) ?? []}
            onCriadas={adicionar}
            onEditada={editar}
            onExcluida={excluir}
          />
        </Gaveta>
      )}
    </div>
  );
}
