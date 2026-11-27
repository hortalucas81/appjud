#!/usr/bin/env python3
"""
Converte o texto compilado de uma lei do Planalto (em Markdown) numa lista
estruturada de dispositivos (artigo, parágrafo, inciso, alínea, item) e gera:

  data/normas/<slug>.json          -> estrutura legível, para conferência
  supabase/seed/<slug>.sql         -> SQL para colar no Supabase (SQL Editor)

Uso:
  python3 scripts/importar_lei.py data/fontes/lei-9605-1998.planalto.md \
      --slug lei-9605-1998 \
      --titulo "Lei nº 9.605, de 12 de fevereiro de 1998" \
      --apelido "Lei de Crimes Ambientais" \
      --url https://www.planalto.gov.br/ccivil_03/leis/l9605.htm

Regras:
  * Texto riscado (~~...~~), que no Planalto indica redação revogada, é descartado.
  * Notas como "(Redação dada pela Lei nº ...)" e "(Vide ADPF 640)" são guardadas
    no campo `notas` do dispositivo, e não no texto.
  * "Pena - ..." e linhas de continuação ficam no texto do dispositivo anterior.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROMANO = r"(?:M{0,3})(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})"
ORD = r"(?:º|°|o(?![a-z]))"  # "1º", "1°" ou "1 o" (como vem do HTML do Planalto)

RE_LINK = re.compile(r"\[([^\]]*)\]\([^)]*\)")
RE_NOTA = re.compile(
    r"\((?:Redação dada|Incluíd[oa]|Acrescid[oa]|Renumerad|Revogad|Vide|Vigência|Regulamento|Promulga|Prejudicad)[^)]*\)",
    re.I,
)
RE_CAPITULO = re.compile(r"^(TÍTULO|CAPÍTULO|Seção|SEÇÃO|Subseção|SUBSEÇÃO)\s+([IVXLC]+|ÚNIC[AO])\b", re.I)
RE_ART = re.compile(rf"^Art\.\s*(\d+){ORD}?\s*(?:-\s*([A-Z]))?\s*\.?\s*(.*)$", re.S)
RE_PAR = re.compile(rf"^§\s*(\d+)\s*{ORD}?\s*(?:-\s*([A-Z]))?\s*\.?\s*(.*)$", re.S)
RE_PAR_UNICO = re.compile(r"^Parágrafo\s+único\s*[.\-–]?\s*(.*)$", re.S | re.I)
RE_INC = re.compile(rf"^({ROMANO})(?:\s*-\s*([A-Z]))?\s*[-–—]\s*(.*)$", re.S)
RE_ALI = re.compile(r"^([a-z])(?:-([A-Z]))?\)\s*(.*)$", re.S)
RE_ITEM = re.compile(r"^(\d+)(?:-([A-Z]))?\.\s+(.*)$", re.S)


def limpar(md: str) -> str:
    md = re.sub(r"~~.*?~~", "", md, flags=re.S)  # redações revogadas
    md = RE_LINK.sub(r"\1", md)
    md = md.replace("\\-", "-").replace("\\*", "*")
    md = re.sub(r"\*\*(.*?)\*\*", r"\1", md, flags=re.S)
    md = re.sub(r"(?<![\w*])_(.+?)_(?!\w)", r"\1", md, flags=re.S)
    md = re.sub(r"(\d)\s+o\b(?=[\s,.;:)-])", r"\1º", md)  # "1 o" -> "1º"
    return md


def paragrafos(md: str):
    for bloco in re.split(r"\n\s*\n", md):
        t = re.sub(r"\s+", " ", bloco).strip()
        if t:
            yield t


def separar_notas(t: str):
    notas = [n.strip("() ") for n in RE_NOTA.findall(t)]
    t = RE_NOTA.sub("", t)
    t = re.sub(r"\bPrejudicada\b\s*$", "", t)
    t = re.sub(r"\s+Vigência\s*$", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s+([,.;:])", r"\1", t)
    t = re.sub(r"\.\.$", ".", t)
    return t, notas


def romano_int(r: str) -> int:
    v = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for i, c in enumerate(r):
        if i + 1 < len(r) and v[c] < v[r[i + 1]]:
            total -= v[c]
        else:
            total += v[c]
    return total


def ord_txt(n: str) -> str:
    return f"{n}º" if int(n) < 10 else n


def parse(md: str):
    md = limpar(md)
    # corta cabeçalho e fecho
    ini = md.find("CAPÍTULO I")
    if ini < 0:
        ini = md.find("Art. 1")
    fim = md.find("Brasília,")
    corpo = md[ini: fim if fim > 0 else None]

    disp = []          # lista final
    estrutura = {}     # nível -> "CAPÍTULO V – DOS CRIMES..."
    pendente_titulo = None
    art = par = inc = ali = None
    ordem = 0

    def novo(tipo, rotulo, chave, pai, texto, notas):
        nonlocal ordem
        ordem += 1
        d = {
            "ordem": ordem,
            "tipo": tipo,
            "rotulo": rotulo,
            "caminho": chave,
            "pai": pai["caminho"] if pai else None,
            "artigo": art["rotulo"] if art else rotulo,
            "texto": texto,
            "notas": notas,
            "estrutura": " › ".join(v for _, v in sorted(estrutura.items())),
        }
        disp.append(d)
        return d

    for p in paragrafos(corpo):
        m = RE_CAPITULO.match(p)
        if m:
            nivel = {"título": 0, "capítulo": 1, "seção": 2, "subseção": 3}[m.group(1).lower()]
            for k in [k for k in estrutura if k >= nivel]:
                del estrutura[k]
            estrutura[nivel] = p.strip()
            pendente_titulo = nivel
            continue
        if pendente_titulo is not None and not RE_ART.match(p):
            sep = " " if " – " in estrutura[pendente_titulo] else " – "
            estrutura[pendente_titulo] += sep + p.strip()
            continue
        pendente_titulo = None

        texto, notas = separar_notas(p)

        if m := RE_ART.match(texto):
            n, letra, resto = m.groups()
            rot = f"Art. {ord_txt(n)}" + (f"-{letra}" if letra else "")
            chave = f"art{n}" + (letra.lower() if letra else "")
            art = None
            art = novo("artigo", rot, chave, None, resto.strip(), notas)
            art["artigo"] = rot
            par = inc = ali = None
            continue
        if art is None:
            continue
        if m := RE_PAR_UNICO.match(texto):
            par = novo("paragrafo", "Parágrafo único", f"{art['caminho']}.pu", art, m.group(1).strip(), notas)
            inc = ali = None
            continue
        if m := RE_PAR.match(texto):
            n, letra, resto = m.groups()
            rot = f"§ {ord_txt(n)}" + (f"-{letra}" if letra else "")
            par = novo("paragrafo", rot, f"{art['caminho']}.p{n}" + (letra.lower() if letra else ""), art, resto.strip(), notas)
            inc = ali = None
            continue
        m = RE_INC.match(texto)
        if m and m.group(1):
            r, letra, resto = m.groups()
            pai = par or art
            rot = r + (f"-{letra}" if letra else "")
            inc = novo("inciso", rot, f"{pai['caminho']}.inc{romano_int(r)}" + (letra.lower() if letra else ""), pai, resto.strip(), notas)
            ali = None
            continue
        if (m := RE_ALI.match(texto)) and inc is not None:
            l, letra, resto = m.groups()
            rot = f"{l})" if not letra else f"{l}-{letra})"
            ali = novo("alinea", rot, f"{inc['caminho']}.{l}" + (letra.lower() if letra else ""), inc, resto.strip(), notas)
            continue
        if (m := RE_ITEM.match(texto)) and ali is not None:
            n, letra, resto = m.groups()
            novo("item", n + (f"-{letra}" if letra else ""), f"{ali['caminho']}.n{n}", ali, resto.strip(), notas)
            continue
        # continuação (ex.: "Pena - ...") -> anexa ao último dispositivo
        alvo = disp[-1]
        if texto.startswith("Pena") and alvo["tipo"] in ("inciso", "alinea", "item"):
            # a pena fixada depois da lista de incisos pertence ao parágrafo/artigo
            por_caminho = {d["caminho"]: d for d in disp}
            while alvo["tipo"] not in ("artigo", "paragrafo"):
                alvo = por_caminho[alvo["pai"]]
        if texto:
            alvo["texto"] = (alvo["texto"] + "\n" + texto).strip()
        alvo["notas"] += notas

    return disp


def sql_str(s):
    if s is None:
        return "null"
    return "'" + s.replace("'", "''") + "'"


def gerar_sql(norma, disp):
    linhas = [
        "-- Gerado por scripts/importar_lei.py. Pode ser executado mais de uma vez:",
        "-- apaga e recria os dispositivos desta norma (as anotações dos usuários",
        "-- ficam presas ao 'caminho' e são religadas no final).",
        "begin;",
        f"insert into public.normas (slug, titulo, apelido, ementa, fonte_url) values ({sql_str(norma['slug'])}, {sql_str(norma['titulo'])}, {sql_str(norma['apelido'])}, {sql_str(norma['ementa'])}, {sql_str(norma['url'])})",
        "  on conflict (slug) do update set titulo = excluded.titulo, apelido = excluded.apelido, ementa = excluded.ementa, fonte_url = excluded.fonte_url, atualizado_em = now();",
        "",
        "create temp table _novos (like public.dispositivos including defaults) on commit drop;",
        "insert into _novos (norma_id, caminho, caminho_pai, tipo, rotulo, artigo, texto, notas, estrutura, ordem) values",
    ]
    vals = []
    for d in disp:
        notas = "array[" + ",".join(sql_str(n) for n in d["notas"]) + "]::text[]" if d["notas"] else "'{}'::text[]"
        vals.append(
            f"((select id from public.normas where slug = {sql_str(norma['slug'])}), {sql_str(d['caminho'])}, {sql_str(d['pai'])}, {sql_str(d['tipo'])}, {sql_str(d['rotulo'])}, {sql_str(d['artigo'])}, {sql_str(d['texto'])}, {notas}, {sql_str(d['estrutura'])}, {d['ordem']})"
        )
    linhas.append(",\n".join(vals) + ";")
    linhas += [
        "",
        "select public.sincronizar_dispositivos((select id from public.normas where slug = " + sql_str(norma["slug"]) + "));",
        "commit;",
        "",
    ]
    return "\n".join(linhas)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("fonte")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--titulo", required=True)
    ap.add_argument("--apelido", default="")
    ap.add_argument("--url", default="")
    args = ap.parse_args()

    md = Path(args.fonte).read_text(encoding="utf-8")
    em = re.search(r"\|\s*([^|]*Dispõe sobre[^|]*)\|", md)
    ementa = em.group(1).strip() if em else ""
    disp = parse(md)

    caminhos = [d["caminho"] for d in disp]
    dup = {c for c in caminhos if caminhos.count(c) > 1}
    if dup:
        print("ATENÇÃO: caminhos duplicados:", sorted(dup), file=sys.stderr)
        sys.exit(1)

    norma = {"slug": args.slug, "titulo": args.titulo, "apelido": args.apelido, "ementa": ementa, "url": args.url}
    raiz = Path(__file__).resolve().parent.parent
    (raiz / "data/normas").mkdir(parents=True, exist_ok=True)
    (raiz / f"data/normas/{args.slug}.json").write_text(
        json.dumps({**norma, "dispositivos": disp}, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    (raiz / f"supabase/seed/{args.slug}.sql").write_text(gerar_sql(norma, disp), encoding="utf-8")
    tipos = {}
    for d in disp:
        tipos[d["tipo"]] = tipos.get(d["tipo"], 0) + 1
    print(f"{len(disp)} dispositivos: {tipos}")


if __name__ == "__main__":
    main()
