-- =====================================================================
-- Piloto: legislação anotável
-- Cole este arquivo inteiro no Supabase > SQL Editor e clique em "Run".
-- Depois rode o arquivo supabase/seed/lei-9605-1998.sql do mesmo jeito.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Banco de legislação (público, somente leitura para os usuários)
-- ---------------------------------------------------------------------
create table if not exists public.normas (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,          -- ex.: lei-9605-1998
  titulo        text not null,                 -- ex.: Lei nº 9.605, de 12 de fevereiro de 1998
  apelido       text,                          -- ex.: Lei de Crimes Ambientais
  ementa        text,
  fonte_url     text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Cada artigo, parágrafo, inciso, alínea ou item é uma linha.
create table if not exists public.dispositivos (
  id          uuid primary key default gen_random_uuid(),
  norma_id    uuid not null references public.normas(id) on delete cascade,
  caminho     text not null,      -- endereço estável: art29.p4.inc1
  caminho_pai text,               -- art29.p4
  pai_id      uuid references public.dispositivos(id) on delete set null,
  tipo        text not null check (tipo in ('artigo','paragrafo','inciso','alinea','item')),
  rotulo      text not null,      -- "Art. 29", "§ 4º", "I", "a)"
  artigo      text not null,      -- artigo a que pertence: "Art. 29"
  texto       text not null default '',
  notas       text[] not null default '{}',  -- "Redação dada pela Lei nº ..."
  estrutura   text,               -- "CAPÍTULO V – ... › Seção I – Dos Crimes contra a Fauna"
  contexto    text,               -- caput do artigo e do pai, para melhorar a busca
  ordem       int not null,
  busca       tsvector generated always as (
                setweight(to_tsvector('portuguese', coalesce(texto, '')), 'A') ||
                setweight(to_tsvector('portuguese', coalesce(contexto, '')), 'C') ||
                setweight(to_tsvector('portuguese', coalesce(estrutura, '')), 'D')
              ) stored,
  unique (norma_id, caminho)
);
create index if not exists dispositivos_norma_ordem on public.dispositivos (norma_id, ordem);
create index if not exists dispositivos_busca on public.dispositivos using gin (busca);

-- ---------------------------------------------------------------------
-- 2. Dados de cada usuário
-- ---------------------------------------------------------------------
-- "Minha cópia": leis que o usuário adotou como template.
create table if not exists public.minhas_normas (
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  norma_id  uuid not null references public.normas(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (user_id, norma_id)
);

-- Anotações. Guardam também norma + caminho, para sobreviverem a uma
-- reimportação do texto da lei (o dispositivo é religado pelo caminho).
create table if not exists public.anotacoes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  norma_id       uuid not null references public.normas(id) on delete cascade,
  dispositivo_id uuid references public.dispositivos(id) on delete set null,
  caminho        text not null,
  conteudo       text not null check (length(conteudo) between 1 and 20000),
  fonte          text check (fonte is null or length(fonte) <= 500),  -- ex.: STJ, REsp 1.234.567
  origem         text not null default 'manual' check (origem in ('manual','ia')),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists anotacoes_user_norma on public.anotacoes (user_id, norma_id);
create index if not exists anotacoes_dispositivo on public.anotacoes (dispositivo_id);

-- Registro de uso da IA (para limitar custo por usuário/dia).
create table if not exists public.uso_ia (
  id        bigint generated always as identity primary key,
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  norma_id  uuid references public.normas(id) on delete set null,
  caracteres int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists uso_ia_user_dia on public.uso_ia (user_id, criado_em);

-- ---------------------------------------------------------------------
-- 3. Segurança (RLS): legislação é pública; o resto é só do dono
-- ---------------------------------------------------------------------
alter table public.normas        enable row level security;
alter table public.dispositivos  enable row level security;
alter table public.minhas_normas enable row level security;
alter table public.anotacoes     enable row level security;
alter table public.uso_ia        enable row level security;

drop policy if exists "normas: leitura" on public.normas;
create policy "normas: leitura" on public.normas for select using (true);

drop policy if exists "dispositivos: leitura" on public.dispositivos;
create policy "dispositivos: leitura" on public.dispositivos for select using (true);

drop policy if exists "minhas_normas: dono" on public.minhas_normas;
create policy "minhas_normas: dono" on public.minhas_normas for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "anotacoes: dono" on public.anotacoes;
create policy "anotacoes: dono" on public.anotacoes for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "uso_ia: ler o próprio" on public.uso_ia;
create policy "uso_ia: ler o próprio" on public.uso_ia for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "uso_ia: registrar o próprio" on public.uso_ia;
create policy "uso_ia: registrar o próprio" on public.uso_ia for insert to authenticated
  with check (user_id = (select auth.uid()));

-- Ao gravar uma anotação: confere que o dispositivo é da norma e preenche o caminho.
create or replace function public.anotacoes_preencher()
returns trigger language plpgsql as $$
begin
  if new.dispositivo_id is not null then
    select d.caminho into new.caminho
      from public.dispositivos d
     where d.id = new.dispositivo_id and d.norma_id = new.norma_id;
    if not found then
      raise exception 'dispositivo não pertence à norma';
    end if;
  end if;
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists anotacoes_preencher on public.anotacoes;
create trigger anotacoes_preencher before insert or update on public.anotacoes
  for each row execute function public.anotacoes_preencher();

-- ---------------------------------------------------------------------
-- 4. Busca de candidatos para a IA (pré-filtro barato, sem IA)
--    Transforma o texto colado numa busca "OU" por termos e devolve os
--    dispositivos mais parecidos, com o caput do artigo para contexto.
-- ---------------------------------------------------------------------
create or replace function public.buscar_candidatos(p_norma uuid, p_texto text, p_limite int default 12)
returns table (
  id uuid, caminho text, tipo text, rotulo text, artigo text,
  texto text, caput text, estrutura text, relevancia real
)
language plpgsql stable security invoker set search_path = public as $$
declare
  q tsquery;
  s text;
begin
  s := plainto_tsquery('portuguese', left(coalesce(p_texto, ''), 6000))::text;
  if s is null or s = '' then
    return;
  end if;
  q := replace(s, ' & ', ' | ')::tsquery;
  return query
    select d.id, d.caminho, d.tipo, d.rotulo, d.artigo, d.texto,
           case when d.tipo = 'artigo' then null else a.texto end as caput,
           d.estrutura,
           ts_rank_cd(d.busca, q, 1)::real as relevancia
      from public.dispositivos d
      left join public.dispositivos a
        on a.norma_id = d.norma_id and a.tipo = 'artigo' and a.rotulo = d.artigo
     where d.norma_id = p_norma
       and d.busca @@ q
       and d.texto not ilike '(VETADO)%'
     order by relevancia desc, d.ordem
     limit least(greatest(p_limite, 1), 30);
end $$;

-- ---------------------------------------------------------------------
-- 5. Importação/reimportação de uma lei (usada pelos arquivos de seed).
--    Lê a tabela temporária _novos e sincroniza sem perder anotações.
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_dispositivos(p_norma uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.dispositivos as d
    (norma_id, caminho, caminho_pai, tipo, rotulo, artigo, texto, notas, estrutura, ordem)
  select norma_id, caminho, caminho_pai, tipo, rotulo, artigo, texto, notas, estrutura, ordem
    from _novos
  on conflict (norma_id, caminho) do update set
    caminho_pai = excluded.caminho_pai, tipo = excluded.tipo, rotulo = excluded.rotulo,
    artigo = excluded.artigo, texto = excluded.texto, notas = excluded.notas,
    estrutura = excluded.estrutura, ordem = excluded.ordem;

  delete from public.dispositivos d
   where d.norma_id = p_norma
     and not exists (select 1 from _novos n where n.caminho = d.caminho);

  update public.dispositivos d
     set pai_id = p.id
    from public.dispositivos p
   where d.norma_id = p_norma and p.norma_id = p_norma and p.caminho = d.caminho_pai;

  -- contexto de busca = caput do artigo + texto do pai (quando diferente)
  update public.dispositivos d
     set contexto = trim(coalesce(a.texto, '') || ' ' ||
                         case when p.id is distinct from a.id then coalesce(p.texto, '') else '' end)
    from public.dispositivos a, public.dispositivos p
   where d.norma_id = p_norma and d.tipo <> 'artigo'
     and a.norma_id = p_norma and a.tipo = 'artigo' and a.rotulo = d.artigo
     and p.id = d.pai_id;

  -- religa anotações cujo dispositivo foi recriado
  update public.anotacoes an
     set dispositivo_id = d.id
    from public.dispositivos d
   where an.norma_id = p_norma and an.dispositivo_id is null
     and d.norma_id = p_norma and d.caminho = an.caminho;
end $$;

revoke all on function public.sincronizar_dispositivos(uuid) from public, anon, authenticated;
