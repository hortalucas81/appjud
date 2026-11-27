# e-luminatti · Legislação anotável (piloto)

App para profissionais do direito usarem leis prontas como **template anotável**:

- **Banco de legislação**: a lei já vem quebrada em artigo, parágrafo, inciso e alínea. O piloto traz só a
  **Lei nº 9.605/1998 (Lei de Crimes Ambientais)**, a partir do texto compilado do Planalto (293 dispositivos,
  sem as redações revogadas).
- **Minha cópia anotável**: o usuário clica em "Usar como template" e anota direto em cada dispositivo
  (com campo opcional de fonte, como "STJ, REsp 1.234.567/SP").
- **Colar e sugerir**: o usuário cola um julgado, trecho de doutrina ou nota; a IA sugere de 1 a 3 dispositivos
  com uma justificativa curta; **nada é salvo sem o usuário marcar e confirmar**.
- **Login e privacidade**: cada usuário só vê as próprias anotações (Supabase Auth + RLS).

Fora do escopo deste piloto: compartilhamento, curadoria coletiva e pagamento.

Stack: Next.js 16 + Tailwind (Vercel), Supabase (Postgres, Auth, RLS) e Gemini (modelo barato, chave só no servidor).

---

## Passo a passo para colocar no ar

Você vai precisar de contas gratuitas no [Supabase](https://supabase.com), na [Vercel](https://vercel.com) e no
[Google AI Studio](https://aistudio.google.com).

### 1. Criar o banco no Supabase

1. No Supabase, clique em **New project**, dê um nome e uma senha ao banco e escolha a região **São Paulo**.
2. Quando o projeto estiver pronto, abra **SQL Editor** (menu da esquerda) → **New query**.
3. Abra o arquivo [`supabase/migrations/0001_legislacao_anotavel.sql`](supabase/migrations/0001_legislacao_anotavel.sql)
   aqui no GitHub, copie tudo, cole no SQL Editor e clique em **Run**. Isso cria as tabelas e as regras de segurança.
4. Faça o mesmo com [`supabase/seed/lei-9605-1998.sql`](supabase/seed/lei-9605-1998.sql). Isso importa a Lei 9.605/98.
   (Pode rodar de novo no futuro para atualizar o texto da lei: as anotações são preservadas.)
5. Em **Table Editor → dispositivos** você deve ver 293 linhas.

### 2. Configurar o login

1. Em **Authentication → Sign In / Providers → Email**, deixe "Email" ligado.
2. Para o piloto, você pode **desligar "Confirm email"**: assim a pessoa cria a conta e já entra, sem precisar
   clicar no link do e-mail (o envio de e-mails do plano gratuito é bem limitado). Se deixar ligado, funciona
   também: o link de confirmação leva de volta ao app.
3. Depois do passo 4 (Vercel), volte em **Authentication → URL Configuration** e coloque em **Site URL** o
   endereço do app (ex.: `https://appjud.vercel.app`) e, em **Redirect URLs**, `https://appjud.vercel.app/auth/callback`.

### 3. Pegar as chaves

- Supabase: **Project Settings → API** (ou **Data API**). Copie a **Project URL** e a chave **anon / public**
  (às vezes aparece como "publishable key").
- Gemini: em <https://aistudio.google.com/apikey> clique em **Create API key** e copie.

### 4. Publicar na Vercel

1. Na Vercel: **Add New → Project** → escolha o repositório `appjud` → **Import**.
2. Antes de clicar em Deploy, abra **Environment Variables** e cadastre:

   | Nome | Valor |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave anon/public do Supabase |
   | `GEMINI_API_KEY` | chave do Google AI Studio |
   | `GEMINI_MODEL` (opcional) | padrão: `gemini-3.5-flash-lite` |
   | `LIMITE_SUGESTOES_DIA` (opcional) | padrão: `50` sugestões por usuário por dia |

3. Clique em **Deploy**. Ao terminar, abra o endereço, crie sua conta e clique em **Usar como template**.

> Sem `GEMINI_API_KEY` o app funciona do mesmo jeito, mas as sugestões vêm só da busca por semelhança de termos
> (o aviso aparece na tela). É uma boa forma de testar sem gastar nada.

---

## Rodar no seu computador (opcional, pelo Cursor)

Precisa do [Node.js](https://nodejs.org) 20 ou mais novo.

```bash
npm install
cp .env.example .env.local   # depois abra .env.local e cole as chaves
npm run dev
```

Abra <http://localhost:3000>.

---

## Como a sugestão por IA funciona (e por que é barata)

1. **Pré-filtro sem IA, no banco**: o texto colado vira uma busca textual em português (função
   `buscar_candidatos`) que devolve os 12 dispositivos mais parecidos. Se o trecho citar um artigo
   ("art. 29"), os dispositivos desse artigo também entram.
2. **Só os candidatos vão para o modelo** (no máximo 18, cada um com o caput do artigo como contexto).
   O modelo escolhe de 1 a 3 e escreve uma justificativa de até 25 palavras. Nunca enviamos a lei inteira
   nem as anotações do usuário.
3. **Confirmação humana**: a tela mostra as sugestões desmarcadas; o usuário marca onde quer salvar e clica
   em "Confirmar e salvar". A anotação fica registrada como "sugerido por IA".
4. Há um limite diário por usuário (`LIMITE_SUGESTOES_DIA`), registrado na tabela `uso_ia`.

Cada sugestão envia alguns milhares de tokens ao modelo, o que custa frações de centavo.

---

## Adicionar outra lei depois

O banco é genérico: `normas` (a lei) e `dispositivos` (cada artigo/parágrafo/inciso/alínea, com um
`caminho` estável como `art29.p4.inc1`). Para importar outra lei:

1. Salve o texto compilado do Planalto em Markdown em `data/fontes/` (foi assim com a Lei 9.605).
2. Rode o importador:

   ```bash
   python3 scripts/importar_lei.py data/fontes/ARQUIVO.md \
     --slug lei-XXXX-AAAA --titulo "Lei nº X.XXX, de ..." --apelido "Nome popular" \
     --url https://www.planalto.gov.br/...
   ```

3. Confira `data/normas/<slug>.json` e rode o `supabase/seed/<slug>.sql` gerado no SQL Editor.

O importador descarta o texto riscado (redações revogadas), guarda notas como "(Redação dada pela Lei nº ...)"
separadas do texto e liga cada "Pena –" ao artigo ou parágrafo correspondente. Leis com estrutura diferente
(códigos com Livros e Títulos, por exemplo) podem precisar de pequenos ajustes no script.

---

## Mapa do código

| Onde | O quê |
| --- | --- |
| `src/app/leis/page.tsx` | Minhas leis + banco de legislação |
| `src/app/leis/[slug]/Leitor.tsx` | Leitura da lei, anotações e painel "Colar e sugerir" |
| `src/app/leis/[slug]/actions.ts` | Salvar/editar/excluir anotações e gerar sugestões |
| `src/lib/ia.ts` | Chamada ao Gemini (prompt e leitura da resposta) |
| `src/proxy.ts` | Mantém a sessão e exige login nas páginas internas |
| `supabase/migrations/` | Tabelas, RLS, busca de candidatos |
| `supabase/seed/` | Texto das leis, pronto para importar |
| `scripts/importar_lei.py` | Conversor do texto do Planalto para o banco |

Para testar tudo localmente com um Supabase no Docker: `npx supabase start` (usa `supabase/config.jsonc`,
aplica a migração e o seed automaticamente).
