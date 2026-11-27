/** Normaliza espaços para comparar trechos copiados de PDFs e sites. */
function normalizar(t: string) {
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Confere se o destaque é mesmo um pedaço do texto colado (a IA deve copiar, não resumir).
 * Devolve o destaque limpo, ou null se não servir.
 */
export function validarDestaque(destaque: unknown, conteudo: string): string | null {
  if (typeof destaque !== "string") return null;
  const d = normalizar(destaque.replace(/^[\s"“”'…]+|[\s"“”'…]+$/g, ""));
  if (d.length < 20 || d.length > 2000) return null;
  const c = normalizar(conteudo);
  if (d.length >= c.length) return null; // não há o que recolher
  return c.includes(d) ? d : null;
}

export function ehLink(fonte: string | null | undefined): boolean {
  return Boolean(fonte && /^https?:\/\/\S+$/i.test(fonte.trim()));
}
