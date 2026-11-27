-- =====================================================================
-- Piloto: trecho em destaque nas anotações
-- O usuário pode colar o acórdão inteiro; a IA escolhe o trecho que
-- aparece no caderno ("destaque") e a íntegra fica recolhida.
-- Cole este arquivo no Supabase > SQL Editor e clique em "Run".
-- Pode ser executado mais de uma vez.
-- =====================================================================

alter table public.anotacoes add column if not exists destaque text;

alter table public.anotacoes drop constraint if exists anotacoes_destaque_check;
alter table public.anotacoes add constraint anotacoes_destaque_check
  check (destaque is null or length(destaque) between 1 and 2000);

-- Íntegra maior: até ~15 páginas de acórdão (antes: 20 mil caracteres).
alter table public.anotacoes drop constraint if exists anotacoes_conteudo_check;
alter table public.anotacoes add constraint anotacoes_conteudo_check
  check (length(conteudo) between 1 and 80000);
