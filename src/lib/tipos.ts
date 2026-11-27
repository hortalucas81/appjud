export type Norma = {
  id: string;
  slug: string;
  titulo: string;
  apelido: string | null;
  ementa: string | null;
  fonte_url: string | null;
};

export type Dispositivo = {
  id: string;
  caminho: string;
  pai_id: string | null;
  tipo: "artigo" | "paragrafo" | "inciso" | "alinea" | "item";
  rotulo: string;
  artigo: string;
  texto: string;
  notas: string[];
  estrutura: string | null;
  ordem: number;
};

export type Anotacao = {
  id: string;
  dispositivo_id: string | null;
  caminho: string;
  conteudo: string;
  /** Trecho que aparece no caderno; a íntegra (conteudo) fica recolhida. */
  destaque: string | null;
  fonte: string | null;
  origem: "manual" | "ia";
  criado_em: string;
  atualizado_em: string;
};

export type Sugestao = {
  dispositivo_id: string;
  caminho: string;
  referencia: string; // "Art. 29, § 1º, III"
  texto: string;
  justificativa: string;
  /** Trecho do texto colado escolhido pela IA para aparecer no caderno. */
  destaque: string | null;
};
