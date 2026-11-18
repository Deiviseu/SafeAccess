-- =====================================================================
-- SafeAccess Sacchelli — Schema inicial do banco (MVP)
-- Banco: PostgreSQL (Supabase)
--
-- Como rodar: cole tudo no SQL Editor do Supabase e execute de uma vez,
-- ou salve como migration (supabase/migrations) e use `supabase db push`.
--
-- Ordem: 0 reset > 1 extensões/tipos > 2 funções utilitárias > 3 tabelas
--        > 4 funções de permissão > 5 triggers > 6 segurança (RLS/grants)
-- =====================================================================


-- =====================================================================
-- 0. RESET (somente em DESENVOLVIMENTO — apaga tabelas e dados!)
--    Permite rodar o script de novo do zero. Remova antes de produção.
-- =====================================================================
drop table if exists
  public.qr_tokens,
  public.desafios_webauthn,
  public.convites_passkey,
  public.credenciais_passkey,
  public.movimentacoes,
  public.pessoas,
  public.usuarios_sistema,
  public.setores,
  public.auditoria,
  public.funcionarios          -- tabela de teste criada antes
cascade;

drop function if exists public.set_updated_at() cascade;
drop function if exists public.cpf_valido(text) cascade;
drop function if exists public.normalizar_documento(public.tipo_documento, text) cascade;
drop function if exists public.pessoas_normalizar() cascade;
drop function if exists public.perfil_atual() cascade;
drop function if exists public.movimentacoes_controle() cascade;
drop function if exists public.registrar_auditoria() cascade;
drop function if exists public.buscar_pessoa_por_documento(public.tipo_documento, text) cascade;

drop type if exists public.perfil_usuario cascade;
drop type if exists public.tipo_pessoa cascade;
drop type if exists public.tipo_documento cascade;
drop type if exists public.metodo_registro cascade;


-- =====================================================================
-- 1. EXTENSÕES E TIPOS
-- =====================================================================
-- pg_trgm: busca rápida por parte do nome (ilike '%silva%')
create extension if not exists pg_trgm with schema extensions;

create type public.perfil_usuario  as enum ('admin', 'rh', 'porteiro');
create type public.tipo_pessoa     as enum ('funcionario', 'visitante', 'prestador', 'fornecedor', 'outro');
create type public.tipo_documento  as enum ('cpf', 'rg', 'cnh', 'passaporte', 'outro');
create type public.metodo_registro as enum ('qr', 'manual');


-- =====================================================================
-- 2. FUNÇÕES UTILITÁRIAS
-- =====================================================================

-- Atualiza updated_at automaticamente em qualquer UPDATE
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Valida CPF (formato + dígitos verificadores). Espera só números.
create or replace function public.cpf_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  soma int;
  dv   int;
  i    int;
begin
  if p is null or p !~ '^[0-9]{11}$' or p ~ '^(\d)\1{10}$' then
    return false;
  end if;

  soma := 0;
  for i in 1..9 loop
    soma := soma + substr(p, i, 1)::int * (11 - i);
  end loop;
  dv := (soma * 10) % 11;
  if dv = 10 then dv := 0; end if;
  if dv <> substr(p, 10, 1)::int then
    return false;
  end if;

  soma := 0;
  for i in 1..10 loop
    soma := soma + substr(p, i, 1)::int * (12 - i);
  end loop;
  dv := (soma * 10) % 11;
  if dv = 10 then dv := 0; end if;
  return dv = substr(p, 11, 1)::int;
end;
$$;

-- Padroniza documento: CPF só números; demais em maiúsculas, sem espaços/pontuação
create or replace function public.normalizar_documento(p_tipo public.tipo_documento, p_doc text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_doc is null or btrim(p_doc) = '' then null
    when p_tipo = 'cpf' then regexp_replace(p_doc, '\D', '', 'g')
    else upper(regexp_replace(p_doc, '[^0-9A-Za-z]', '', 'g'))
  end
$$;


-- =====================================================================
-- 3. TABELAS
-- =====================================================================

-- 3.1 Setores da empresa (destino das visitas / lotação do funcionário)
create table public.setores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint setores_nome_unico  unique (nome),
  constraint setores_nome_valido check (length(btrim(nome)) between 2 and 80)
);

-- 3.2 Operadores do sistema web (porteiro, RH, admin).
--     O login fica no Supabase Auth (auth.users); aqui ficam nome e perfil.
create table public.usuarios_sistema (
  id          uuid primary key references auth.users(id),
  nome        text not null,
  perfil      public.perfil_usuario not null default 'porteiro',
  ativo       boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint usuarios_nome_valido check (length(btrim(nome)) between 3 and 120)
);

-- 3.3 Pessoas que passam pela portaria (funcionários e externos)
create table public.pessoas (
  id               uuid primary key default gen_random_uuid(),
  tipo             public.tipo_pessoa not null,
  nome             text not null,
  documento_tipo   public.tipo_documento,
  documento        text,                         -- completo: NÃO liberado para leitura via API
  documento_final  text generated always as (right(documento, 4)) stored,  -- p/ exibir mascarado
  empresa          text,                         -- empresa de origem (externos)
  matricula        text,                         -- funcionários
  setor_id         uuid references public.setores(id),
  ativo            boolean not null default true,
  observacao       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint pessoas_nome_valido        check (length(btrim(nome)) between 3 and 150),
  constraint pessoas_documento_completo check ((documento is null) = (documento_tipo is null)),
  constraint pessoas_cpf_valido         check (documento_tipo is distinct from 'cpf' or public.cpf_valido(documento)),
  constraint pessoas_func_matricula     check (tipo <> 'funcionario' or matricula is not null),
  constraint pessoas_externo_documento  check (tipo = 'funcionario' or documento is not null)
);

-- Impede duplicidade de documento e de matrícula
create unique index pessoas_documento_unico on public.pessoas (documento_tipo, documento) where documento is not null;
create unique index pessoas_matricula_unica on public.pessoas (matricula) where matricula is not null;
-- Busca rápida por nome
create index pessoas_nome_trgm on public.pessoas using gin (nome extensions.gin_trgm_ops);
create index pessoas_tipo on public.pessoas (tipo);

-- 3.4 Movimentações: uma linha por passagem (entrada e, depois, saída)
create table public.movimentacoes (
  id                      uuid primary key default gen_random_uuid(),
  pessoa_id               uuid not null references public.pessoas(id),
  entrada_em              timestamptz not null default now(),
  saida_em                timestamptz,
  setor_destino_id        uuid references public.setores(id),
  pessoa_visitada         text,
  motivo                  text,
  metodo_entrada          public.metodo_registro not null default 'manual',
  metodo_saida            public.metodo_registro,
  entrada_registrada_por  uuid not null default auth.uid() references public.usuarios_sistema(id),
  saida_registrada_por    uuid references public.usuarios_sistema(id),
  observacao              text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint mov_saida_depois_entrada check (saida_em is null or saida_em >= entrada_em),
  constraint mov_saida_completa check (
    (saida_em is null) = (saida_registrada_por is null)
    and (saida_em is null) = (metodo_saida is null)
  )
);

-- Regra de ouro: no máximo UMA entrada em aberto por pessoa (evita entrada duplicada)
create unique index mov_uma_aberta_por_pessoa on public.movimentacoes (pessoa_id) where saida_em is null;
create index mov_entrada_em on public.movimentacoes (entrada_em desc);
create index mov_pessoa_historico on public.movimentacoes (pessoa_id, entrada_em desc);

-- 3.5 Passkeys (biometria do celular) cadastradas por funcionário.
--     Só a CHAVE PÚBLICA fica aqui; a biometria nunca sai do aparelho.
create table public.credenciais_passkey (
  id             uuid primary key default gen_random_uuid(),
  pessoa_id      uuid not null references public.pessoas(id) on delete cascade,
  credential_id  text not null unique,         -- base64url, gerado pelo celular
  public_key     bytea not null,
  contador       bigint not null default 0,    -- anti-clonagem (sign count do WebAuthn)
  transports     text[],
  dispositivo    text,                         -- apelido: "Galaxy do João"
  created_at     timestamptz not null default now(),
  ultimo_uso_em  timestamptz,
  revogada_em    timestamptz
);
create index credenciais_ativas on public.credenciais_passkey (pessoa_id) where revogada_em is null;

-- 3.6 Convites de uso único para o funcionário cadastrar a passkey no celular
create table public.convites_passkey (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid not null references public.pessoas(id) on delete cascade,
  token_hash  text not null unique,            -- guardamos só o HASH do convite
  expira_em   timestamptz not null default now() + interval '24 hours',
  usado_em    timestamptz,
  criado_por  uuid not null references public.usuarios_sistema(id),
  created_at  timestamptz not null default now()
);

-- 3.7 Desafios WebAuthn (curta duração, uso único)
create table public.desafios_webauthn (
  id          uuid primary key default gen_random_uuid(),
  pessoa_id   uuid references public.pessoas(id) on delete cascade,
  challenge   text not null unique,
  finalidade  text not null check (finalidade in ('registro', 'autenticacao')),
  expira_em   timestamptz not null default now() + interval '5 minutes',
  usado_em    timestamptz,
  created_at  timestamptz not null default now()
);

-- 3.8 Tokens do QR code (válidos por 60 s, uso único)
create table public.qr_tokens (
  id               uuid primary key default gen_random_uuid(),
  pessoa_id        uuid not null references public.pessoas(id) on delete cascade,
  credencial_id    uuid not null references public.credenciais_passkey(id) on delete cascade,
  token_hash       text not null unique,       -- guardamos só o HASH do token
  emitido_em       timestamptz not null default now(),
  expira_em        timestamptz not null default now() + interval '60 seconds',
  usado_em         timestamptz,
  lido_por         uuid references public.usuarios_sistema(id),
  movimentacao_id  uuid references public.movimentacoes(id),
  constraint qr_uso_completo check ((usado_em is null) = (lido_por is null))
);
create index qr_tokens_expira on public.qr_tokens (expira_em);

-- 3.9 Auditoria: quem fez o quê, quando, com antes/depois
create table public.auditoria (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro_id   uuid,
  acao          text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  dados_antes   jsonb,
  dados_depois  jsonb,
  usuario_id    uuid,          -- auth.uid() de quem fez (null = sistema/Edge Function)
  papel         text,          -- authenticated, service_role...
  ocorrido_em   timestamptz not null default now()
);
create index auditoria_registro on public.auditoria (tabela, registro_id);
create index auditoria_data on public.auditoria (ocorrido_em desc);


-- =====================================================================
-- 4. FUNÇÕES DE PERMISSÃO E BUSCA
-- =====================================================================

-- Perfil do operador logado (null = não é operador ativo)
create or replace function public.perfil_atual()
returns public.perfil_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select perfil
  from public.usuarios_sistema
  where id = auth.uid() and ativo
$$;

-- Busca por documento sem expor o documento completo na API.
-- Retorna só o id da pessoa (ou null).
create or replace function public.buscar_pessoa_por_documento(
  p_documento_tipo public.tipo_documento,
  p_documento      text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  return (
    select p.id
    from public.pessoas p
    where p.documento_tipo = p_documento_tipo
      and p.documento = public.normalizar_documento(p_documento_tipo, p_documento)
  );
end;
$$;


-- =====================================================================
-- 5. TRIGGERS
-- =====================================================================

-- 5.1 updated_at automático
create trigger trg_setores_updated_at          before update on public.setores          for each row execute function public.set_updated_at();
create trigger trg_usuarios_updated_at         before update on public.usuarios_sistema for each row execute function public.set_updated_at();
create trigger trg_pessoas_updated_at          before update on public.pessoas          for each row execute function public.set_updated_at();
create trigger trg_movimentacoes_updated_at    before update on public.movimentacoes    for each row execute function public.set_updated_at();

-- 5.2 Normaliza nome e documento antes de salvar
create or replace function public.pessoas_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome      := regexp_replace(btrim(new.nome), '\s+', ' ', 'g');
  new.documento := public.normalizar_documento(new.documento_tipo, new.documento);
  new.empresa   := nullif(btrim(new.empresa), '');
  new.matricula := nullif(btrim(new.matricula), '');
  return new;
end;
$$;

create trigger trg_pessoas_normalizar
  before insert or update on public.pessoas
  for each row execute function public.pessoas_normalizar();

-- 5.3 Horários sempre do SERVIDOR e regras de entrada/saída
create or replace function public.movimentacoes_controle()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    new.entrada_em           := now();       -- ignora horário enviado pelo cliente
    new.saida_em             := null;
    new.saida_registrada_por := null;
    new.metodo_saida         := null;
    if v_uid is not null then
      new.entrada_registrada_por := v_uid;   -- operador não pode "assinar" por outro
    end if;
    return new;
  end if;

  -- UPDATE: campos da entrada não mudam
  if new.pessoa_id <> old.pessoa_id
     or new.entrada_registrada_por <> old.entrada_registrada_por
     or new.metodo_entrada <> old.metodo_entrada then
    raise exception 'Não é permitido alterar dados da entrada.' using errcode = '42501';
  end if;

  -- Somente admin pode corrigir horários (fica registrado na auditoria)
  if public.perfil_atual() is distinct from 'admin' then
    new.entrada_em := old.entrada_em;

    if old.saida_em is not null and new.saida_em is distinct from old.saida_em then
      raise exception 'A saída desta movimentação já foi registrada.' using errcode = '42501';
    end if;

    if old.saida_em is null and new.saida_em is not null then
      new.saida_em := now();
      if v_uid is not null then
        new.saida_registrada_por := v_uid;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_movimentacoes_controle
  before insert or update on public.movimentacoes
  for each row execute function public.movimentacoes_controle();

-- 5.4 Auditoria genérica (documento completo não vai para o log)
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes  jsonb;
  v_depois jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_antes := to_jsonb(old) - 'documento' - 'public_key';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_depois := to_jsonb(new) - 'documento' - 'public_key';
  end if;

  insert into public.auditoria (tabela, registro_id, acao, dados_antes, dados_depois, usuario_id, papel)
  values (
    tg_table_name,
    coalesce(v_depois ->> 'id', v_antes ->> 'id')::uuid,
    tg_op,
    v_antes,
    v_depois,
    auth.uid(),
    current_setting('role', true)
  );

  return coalesce(new, old);
end;
$$;

create trigger trg_audit_setores       after insert or update or delete on public.setores             for each row execute function public.registrar_auditoria();
create trigger trg_audit_usuarios      after insert or update or delete on public.usuarios_sistema    for each row execute function public.registrar_auditoria();
create trigger trg_audit_pessoas       after insert or update or delete on public.pessoas             for each row execute function public.registrar_auditoria();
create trigger trg_audit_movimentacoes after insert or update or delete on public.movimentacoes       for each row execute function public.registrar_auditoria();
create trigger trg_audit_credenciais   after insert or update or delete on public.credenciais_passkey for each row execute function public.registrar_auditoria();
create trigger trg_audit_convites      after insert or update or delete on public.convites_passkey    for each row execute function public.registrar_auditoria();


-- =====================================================================
-- 6. SEGURANÇA: RLS, POLICIES E PERMISSÕES
-- =====================================================================

-- 6.1 RLS em TODAS as tabelas (sem policy = ninguém acessa pela API)
alter table public.setores             enable row level security;
alter table public.usuarios_sistema    enable row level security;
alter table public.pessoas             enable row level security;
alter table public.movimentacoes       enable row level security;
alter table public.credenciais_passkey enable row level security;
alter table public.convites_passkey    enable row level security;
alter table public.desafios_webauthn   enable row level security;
alter table public.qr_tokens           enable row level security;
alter table public.auditoria           enable row level security;

-- 6.2 anon (visitante não logado) não acessa nada
revoke all on all tables in schema public from anon;

-- 6.3 Tabelas usadas SÓ pelas Edge Functions (service_role)
revoke all on public.convites_passkey, public.desafios_webauthn, public.qr_tokens from authenticated;

-- 6.4 Auditoria: ninguém altera nem apaga
revoke all on public.auditoria from authenticated;
grant select on public.auditoria to authenticated;
revoke update, delete, truncate on public.auditoria from service_role;

-- 6.5 Pessoas: documento completo NÃO pode ser lido pela API (LGPD)
revoke select on public.pessoas from authenticated;
grant select (id, tipo, nome, documento_tipo, documento_final, empresa, matricula,
              setor_id, ativo, observacao, created_at, updated_at)
  on public.pessoas to authenticated;
revoke delete on public.pessoas from authenticated;   -- desativar (ativo=false), não apagar

-- 6.6 Movimentações nunca são apagadas pela API
revoke delete on public.movimentacoes from authenticated;

-- 6.7 Credenciais: RH/admin só listam e revogam
revoke all on public.credenciais_passkey from authenticated;
grant select (id, pessoa_id, dispositivo, created_at, ultimo_uso_em, revogada_em)
  on public.credenciais_passkey to authenticated;
grant update (revogada_em) on public.credenciais_passkey to authenticated;

-- 6.8 Funções
revoke execute on function public.buscar_pessoa_por_documento(public.tipo_documento, text) from public, anon;
grant  execute on function public.buscar_pessoa_por_documento(public.tipo_documento, text) to authenticated;
revoke execute on function public.perfil_atual() from public, anon;
grant  execute on function public.perfil_atual() to authenticated;

-- ---------------------------------------------------------------------
-- POLICIES
-- (select public.perfil_atual()) entre parênteses = calcula 1x por consulta
-- ---------------------------------------------------------------------

-- Setores: todo operador vê; RH/admin mantêm
create policy setores_select on public.setores
  for select to authenticated
  using ((select public.perfil_atual()) is not null);

create policy setores_insert on public.setores
  for insert to authenticated
  with check ((select public.perfil_atual()) in ('admin', 'rh'));

create policy setores_update on public.setores
  for update to authenticated
  using ((select public.perfil_atual()) in ('admin', 'rh'))
  with check ((select public.perfil_atual()) in ('admin', 'rh'));

-- Usuários do sistema: cada um vê o próprio; admin vê e gerencia todos
create policy usuarios_select on public.usuarios_sistema
  for select to authenticated
  using (id = (select auth.uid()) or (select public.perfil_atual()) = 'admin');

create policy usuarios_insert on public.usuarios_sistema
  for insert to authenticated
  with check ((select public.perfil_atual()) = 'admin');

create policy usuarios_update on public.usuarios_sistema
  for update to authenticated
  using ((select public.perfil_atual()) = 'admin')
  with check ((select public.perfil_atual()) = 'admin');

-- Pessoas: todo operador vê; porteiro cadastra/edita só externos;
--          funcionários são mantidos por RH/admin
create policy pessoas_select on public.pessoas
  for select to authenticated
  using ((select public.perfil_atual()) is not null);

create policy pessoas_insert on public.pessoas
  for insert to authenticated
  with check (
    (select public.perfil_atual()) in ('admin', 'rh')
    or ((select public.perfil_atual()) = 'porteiro' and tipo <> 'funcionario')
  );

create policy pessoas_update on public.pessoas
  for update to authenticated
  using (
    (select public.perfil_atual()) in ('admin', 'rh')
    or ((select public.perfil_atual()) = 'porteiro' and tipo <> 'funcionario')
  )
  with check (
    (select public.perfil_atual()) in ('admin', 'rh')
    or ((select public.perfil_atual()) = 'porteiro' and tipo <> 'funcionario')
  );

-- Movimentações: todo operador registra entrada/saída e consulta
create policy mov_select on public.movimentacoes
  for select to authenticated
  using ((select public.perfil_atual()) is not null);

create policy mov_insert on public.movimentacoes
  for insert to authenticated
  with check ((select public.perfil_atual()) is not null);

create policy mov_update on public.movimentacoes
  for update to authenticated
  using ((select public.perfil_atual()) is not null)
  with check ((select public.perfil_atual()) is not null);

-- Credenciais: RH/admin listam e revogam aparelhos
create policy cred_select on public.credenciais_passkey
  for select to authenticated
  using ((select public.perfil_atual()) in ('admin', 'rh'));

create policy cred_update on public.credenciais_passkey
  for update to authenticated
  using ((select public.perfil_atual()) in ('admin', 'rh'))
  with check ((select public.perfil_atual()) in ('admin', 'rh'));

-- Auditoria: só RH/admin consultam
create policy auditoria_select on public.auditoria
  for select to authenticated
  using ((select public.perfil_atual()) in ('admin', 'rh'));

-- convites_passkey, desafios_webauthn, qr_tokens: SEM policies de propósito.
-- Só as Edge Functions (service_role) acessam.

-- =====================================================================
-- FIM
-- =====================================================================
