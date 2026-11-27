import "server-only";

export type Candidato = {
  id: string;
  referencia: string;
  texto: string;
  caput: string | null;
  estrutura: string | null;
};

export type Escolha = { id: string; justificativa: string };

const INSTRUCOES = `Você é assistente de um profissional do direito brasileiro que mantém uma lei anotada.
Ele colou um trecho (julgado, doutrina, nota pessoal ou notícia) e quer saber em qual dispositivo da lei esse trecho deve ser anotado.
Você recebe uma lista numerada de dispositivos candidatos da lei. Escolha de 1 a 3 candidatos em que a anotação é mais pertinente.
Regras:
- Escolha apenas entre os candidatos listados. Nunca invente dispositivos.
- Prefira o dispositivo mais específico (inciso ou parágrafo) quando o trecho tratar exatamente dele; use o artigo (caput) quando o trecho tratar do tipo penal ou da regra geral.
- Se nenhum candidato for pertinente, devolva lista vazia.
- A justificativa deve ter no máximo 25 palavras, em português, dizendo por que o trecho se relaciona ao dispositivo.
Responda somente com JSON no formato: {"sugestoes":[{"n":<número do candidato>,"justificativa":"..."}]}`;

export function iaConfigurada() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function escolherDispositivos(trecho: string, candidatos: Candidato[]): Promise<Escolha[]> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) throw new Error("GEMINI_API_KEY não configurada");
  const modelo = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

  const lista = candidatos
    .map((c, i) => {
      const contexto = c.caput ? `\n   (caput do artigo: ${c.caput.slice(0, 400)})` : "";
      return `[${i + 1}] ${c.referencia}: ${c.texto.slice(0, 700)}${contexto}`;
    })
    .join("\n");

  const corpo = {
    systemInstruction: { parts: [{ text: INSTRUCOES }] },
    contents: [
      {
        role: "user",
        parts: [{ text: `TRECHO COLADO:\n"""\n${trecho.slice(0, 6000)}\n"""\n\nCANDIDATOS:\n${lista}` }],
      },
    ],
    generationConfig: { temperature: 0.1, maxOutputTokens: 600, responseMimeType: "application/json" },
  };

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Gemini respondeu ${resp.status}: ${detalhe.slice(0, 300)}`);
  }
  const json = await resp.json();
  const texto: string =
    json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
  return interpretar(texto, candidatos);
}

export function interpretar(texto: string, candidatos: Candidato[]): Escolha[] {
  const bruto = texto.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let dados: { sugestoes?: { n?: unknown; justificativa?: unknown }[] };
  try {
    dados = JSON.parse(bruto);
  } catch {
    const m = bruto.match(/\{[\s\S]*\}/);
    if (!m) return [];
    try {
      dados = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const vistos = new Set<string>();
  const escolhas: Escolha[] = [];
  for (const s of dados.sugestoes ?? []) {
    const n = Number(s.n);
    const c = Number.isInteger(n) ? candidatos[n - 1] : undefined;
    if (!c || vistos.has(c.id)) continue;
    vistos.add(c.id);
    escolhas.push({ id: c.id, justificativa: String(s.justificativa ?? "").slice(0, 300) });
    if (escolhas.length === 3) break;
  }
  return escolhas;
}
