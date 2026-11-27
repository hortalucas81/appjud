import type { Dispositivo } from "./tipos";

// Monta "Art. 29, § 1º, III" a partir de um dispositivo e do mapa de pais.
export function referencia(d: Pick<Dispositivo, "id" | "pai_id" | "rotulo">, porId: Map<string, Pick<Dispositivo, "id" | "pai_id" | "rotulo">>) {
  const partes: string[] = [];
  let atual: typeof d | undefined = d;
  while (atual) {
    partes.unshift(atual.rotulo);
    atual = atual.pai_id ? porId.get(atual.pai_id) : undefined;
  }
  return partes.join(", ");
}

// Rótulo de artigo no mesmo formato do banco: "Art. 1º" ... "Art. 9º", "Art. 10", "Art. 69-A".
export function rotuloArtigo(numero: string, letra?: string) {
  const n = parseInt(numero, 10);
  return `Art. ${n}${n < 10 ? "º" : ""}${letra ? `-${letra.toUpperCase()}` : ""}`;
}

// Encontra menções explícitas a artigos no texto colado ("art. 29", "artigo 54-A").
export function artigosMencionados(texto: string) {
  const achados = new Set<string>();
  const re = /\bart(?:igo)?s?\.?\s*(\d{1,4})\s*(?:[ºo°])?(?:\s*-\s*([A-Za-z])\b)?/gi;
  for (const m of texto.matchAll(re)) achados.add(rotuloArtigo(m[1], m[2]));
  return [...achados].slice(0, 5);
}
