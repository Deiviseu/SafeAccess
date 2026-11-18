-- =====================================================================
-- SafeAccess Sacchelli — Migration 02
-- Login do funcionário (matrícula + senha + Face ID), QR Code e
-- registro de entrada/saída.
--
-- Pré-requisito: 20261109000000_schema_inicial.sql já executado.
-- Pode ser executado mais de uma vez (idempotente).
--
-- Decisão: o funcionário entra no app com MATRÍCULA + SENHA (Supabase
-- Auth) e confirma com FACE ID / DIGITAL (passkey) para gerar o QR.
-- O e-mail no Supabase Auth é sintético:
--     <matricula>@funcionarios.sacchelli.com.br
-- (nenhum e-mail é enviado; a recuperação de senha é feita pelo RH).
-- =====================================================================


-- =====================================================================
-- 1. LIGAÇÃO ENTRE PESSOA (funcionário) E LOGIN (auth.users)
-- =====================================================================
alter table public.pessoas
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

alter table public.pessoas drop constraint if exists pessoas_login_so_funcionario;
alter table public.pessoas
  add constraint pessoas_login_so_funcionario check (auth_user_id is null or tipo = 'funcionario');

-- Operadores NÃO podem gravar auth_user_id (só o servidor, via função abaixo).
-- Para isso, INSERT/UPDATE passam a ser liberados coluna por coluna.
revoke insert, update on public.pessoas from authenticated;
grant insert (tipo, nome, documento_tipo, documento, empresa, matricula, setor_id, ativo, observacao)
  on public.pessoas to authenticated;
grant update (tipo, nome, documento_tipo, documento, empresa, matricula, setor_id, ativo, observacao)
  on public.pessoas to authenticated;


-- =====================================================================
-- 2. FUNÇÕES DE APOIO
-- =====================================================================

-- id da pessoa (funcionário ativo) ligada ao login atual; null se não for funcionário
create or replace function public.pessoa_atual_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id
  from public.pessoas
  where auth_user_id = auth.uid() and ativo and tipo = 'funcionario'
$$;

revoke execute on function public.pessoa_atual_id() from public, anon;
grant  execute on function public.pessoa_atual_id() to authenticated;

-- Liga um login (auth.users) a um funcionário. Só o servidor chama
-- (Edge Function do RH que cria a conta do funcionário).
create or replace function public.vincular_login_funcionario(p_pessoa_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.usuarios_sistema where id = p_auth_user_id) then
    raise exception 'Este login pertence a um operador do sistema.' using errcode = '42501';
  end if;

  update public.pessoas
     set auth_user_id = p_auth_user_id
   where id = p_pessoa_id
     and tipo = 'funcionario'
     and auth_user_id is null;

  if not found then
    raise exception 'Funcionário não encontrado ou já possui login.' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.vincular_login_funcionario(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.vincular_login_funcionario(uuid, uuid) to service_role;


-- =====================================================================
-- 3. O QUE O FUNCIONÁRIO PODE VER (somente os próprios dados)
-- =====================================================================

drop policy if exists pessoas_select_proprio on public.pessoas;
create policy pessoas_select_proprio on public.pessoas
  for select to authenticated
  using (id = (select public.pessoa_atual_id()));

drop policy if exists setores_select_funcionario on public.setores;
create policy setores_select_funcionario on public.setores
  for select to authenticated
  using ((select public.pessoa_atual_id()) is not null);

drop policy if exists mov_select_proprio on public.movimentacoes;
create policy mov_select_proprio on public.movimentacoes
  for select to authenticated
  using (pessoa_id = (select public.pessoa_atual_id()));

-- Aparelhos (passkeys): ver e revogar os próprios
drop policy if exists cred_select_proprio on public.credenciais_passkey;
create policy cred_select_proprio on public.credenciais_passkey
  for select to authenticated
  using (pessoa_id = (select public.pessoa_atual_id()));

drop policy if exists cred_update_proprio on public.credenciais_passkey;
create policy cred_update_proprio on public.credenciais_passkey
  for update to authenticated
  using (pessoa_id = (select public.pessoa_atual_id()))
  with check (pessoa_id = (select public.pessoa_atual_id()));

-- Status do próprio QR (para a tela "Acesso autorizado" no celular)
grant select (id, pessoa_id, emitido_em, expira_em, usado_em, movimentacao_id)
  on public.qr_tokens to authenticated;

drop policy if exists qr_select_proprio on public.qr_tokens;
create policy qr_select_proprio on public.qr_tokens
  for select to authenticated
  using (pessoa_id = (select public.pessoa_atual_id()));

-- Operadores enxergam o nome dos colegas (para relatórios "registrado por")
drop policy if exists usuarios_select_operadores on public.usuarios_sistema;
create policy usuarios_select_operadores on public.usuarios_sistema
  for select to authenticated
  using ((select public.perfil_atual()) is not null);


-- =====================================================================
-- 4. REVOGAÇÃO DE APARELHO NÃO PODE SER DESFEITA
-- =====================================================================
create or replace function public.credenciais_controle_revogacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revogada_em is not null and new.revogada_em is distinct from old.revogada_em then
    raise exception 'Aparelho revogado não pode ser reativado. Cadastre novamente.' using errcode = '42501';
  end if;
  if old.revogada_em is null and new.revogada_em is not null then
    new.revogada_em := now();   -- horário do servidor
  end if;
  return new;
end;
$$;

drop trigger if exists trg_credenciais_revogacao on public.credenciais_passkey;
create trigger trg_credenciais_revogacao
  before update on public.credenciais_passkey
  for each row execute function public.credenciais_controle_revogacao();


-- =====================================================================
-- 5. REGISTRAR PASSAGEM (decide sozinho: entrada ou saída)
--    Usada pelo porteiro (registro manual) e pelo consumo do QR.
-- =====================================================================
create or replace function public.registrar_passagem(
  p_pessoa_id        uuid,
  p_metodo           public.metodo_registro default 'manual',
  p_operador         uuid default null,  -- só para chamadas do servidor
  p_setor_destino_id uuid default null,
  p_pessoa_visitada  text default null,
  p_motivo           text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operador  uuid;
  v_ativo     boolean;
  v_aberta_id uuid;
  v_nova_id   uuid;
begin
  -- Quem registra: o operador logado; ou, se for o servidor, o informado
  if auth.uid() is not null then
    if public.perfil_atual() is null then
      raise exception 'Acesso negado' using errcode = '42501';
    end if;
    v_operador := auth.uid();
  else
    v_operador := p_operador;
  end if;

  if v_operador is null or not exists (
    select 1 from public.usuarios_sistema where id = v_operador and ativo
  ) then
    raise exception 'Operador inválido.' using errcode = '42501';
  end if;

  -- Trava a pessoa: evita entrada e saída simultâneas da mesma pessoa
  select ativo into v_ativo from public.pessoas where id = p_pessoa_id for update;
  if not found then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0002';
  end if;
  if not v_ativo then
    raise exception 'Cadastro inativo. Procure o RH.' using errcode = '42501';
  end if;

  select id into v_aberta_id
  from public.movimentacoes
  where pessoa_id = p_pessoa_id and saida_em is null
  for update;

  if found then
    -- Já está dentro → registra a SAÍDA
    update public.movimentacoes
       set saida_em = now(),
           metodo_saida = p_metodo,
           saida_registrada_por = v_operador
     where id = v_aberta_id;

    return jsonb_build_object('tipo', 'saida', 'movimentacao_id', v_aberta_id);
  end if;

  -- Está fora → registra a ENTRADA
  insert into public.movimentacoes
    (pessoa_id, metodo_entrada, entrada_registrada_por, setor_destino_id, pessoa_visitada, motivo)
  values
    (p_pessoa_id, p_metodo, v_operador, p_setor_destino_id,
     nullif(btrim(p_pessoa_visitada), ''), nullif(btrim(p_motivo), ''))
  returning id into v_nova_id;

  return jsonb_build_object('tipo', 'entrada', 'movimentacao_id', v_nova_id);
end;
$$;

revoke execute on function public.registrar_passagem(uuid, public.metodo_registro, uuid, uuid, text, text) from public, anon;
grant  execute on function public.registrar_passagem(uuid, public.metodo_registro, uuid, uuid, text, text) to authenticated, service_role;


-- =====================================================================
-- 6. EMITIR QR (chamada pela Edge Function DEPOIS de validar o Face ID)
--    Devolve o token em texto UMA vez; o banco guarda só o hash.
-- =====================================================================
create or replace function public.emitir_qr_token(
  p_pessoa_id         uuid,
  p_credencial_id     uuid,
  p_validade_segundos int default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token  text;
  v_id     uuid;
  v_expira timestamptz;
begin
  if p_validade_segundos not between 15 and 300 then
    raise exception 'Validade fora do permitido (15 a 300 s).' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pessoas
    where id = p_pessoa_id and ativo and tipo = 'funcionario'
  ) then
    raise exception 'Funcionário inativo ou inexistente.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.credenciais_passkey
    where id = p_credencial_id and pessoa_id = p_pessoa_id and revogada_em is null
  ) then
    raise exception 'Aparelho não autorizado.' using errcode = '42501';
  end if;

  -- Só um QR válido por vez: invalida os anteriores ainda não usados
  update public.qr_tokens
     set expira_em = now()
   where pessoa_id = p_pessoa_id and usado_em is null and expira_em > now();

  -- 244 bits aleatórios (dois UUID v4)
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.qr_tokens (pessoa_id, credencial_id, token_hash, expira_em)
  values (
    p_pessoa_id,
    p_credencial_id,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + make_interval(secs => p_validade_segundos)
  )
  returning id, expira_em into v_id, v_expira;

  update public.credenciais_passkey set ultimo_uso_em = now() where id = p_credencial_id;

  return jsonb_build_object('qr_token_id', v_id, 'token', v_token, 'expira_em', v_expira);
end;
$$;

revoke execute on function public.emitir_qr_token(uuid, uuid, int) from public, anon, authenticated;
grant  execute on function public.emitir_qr_token(uuid, uuid, int) to service_role;


-- =====================================================================
-- 7. CONSUMIR QR (chamada pela tela da portaria, com o operador logado)
--    Valida e registra entrada/saída numa única transação.
--    Retorna um status para a tela mostrar (não lança erro para QR ruim).
-- =====================================================================
create or replace function public.consumir_qr_token(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qr        public.qr_tokens%rowtype;
  v_resultado jsonb;
  v_pessoa    jsonb;
begin
  if public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  select * into v_qr
  from public.qr_tokens
  where token_hash = encode(sha256(convert_to(coalesce(p_token, ''), 'UTF8')), 'hex')
  for update;

  if not found then
    return jsonb_build_object('status', 'invalido', 'mensagem', 'QR Code não reconhecido.');
  end if;
  if v_qr.usado_em is not null then
    return jsonb_build_object('status', 'ja_usado', 'mensagem', 'Este QR Code já foi utilizado.');
  end if;
  if v_qr.expira_em <= now() then
    return jsonb_build_object('status', 'expirado', 'mensagem', 'QR Code expirado. Peça para gerar outro.');
  end if;
  if exists (
    select 1 from public.credenciais_passkey
    where id = v_qr.credencial_id and revogada_em is not null
  ) then
    return jsonb_build_object('status', 'revogado', 'mensagem', 'Aparelho bloqueado. Procure o RH.');
  end if;

  select jsonb_build_object('nome', p.nome, 'matricula', p.matricula, 'setor', s.nome, 'ativo', p.ativo)
    into v_pessoa
  from public.pessoas p
  left join public.setores s on s.id = p.setor_id
  where p.id = v_qr.pessoa_id;

  if not (v_pessoa ->> 'ativo')::boolean then
    return jsonb_build_object('status', 'inativo', 'mensagem', 'Cadastro inativo. Procure o RH.');
  end if;

  v_resultado := public.registrar_passagem(v_qr.pessoa_id, 'qr');

  update public.qr_tokens
     set usado_em = now(),
         lido_por = auth.uid(),
         movimentacao_id = (v_resultado ->> 'movimentacao_id')::uuid
   where id = v_qr.id;

  return jsonb_build_object(
    'status', 'autorizado',
    'tipo', v_resultado ->> 'tipo',
    'movimentacao_id', v_resultado ->> 'movimentacao_id',
    'pessoa', v_pessoa - 'ativo'
  );
end;
$$;

revoke execute on function public.consumir_qr_token(text) from public, anon;
grant  execute on function public.consumir_qr_token(text) to authenticated;


-- =====================================================================
-- 8. VIEWS PARA AS TELAS DA PORTARIA (respeitam o RLS de quem consulta)
-- =====================================================================
create or replace view public.vw_movimentacoes
with (security_invoker = true)
as
select
  m.id                    as movimentacao_id,
  m.entrada_em,
  m.saida_em,
  (m.saida_em is null)    as dentro,
  m.metodo_entrada,
  m.metodo_saida,
  p.id                    as pessoa_id,
  p.nome,
  p.tipo,
  p.empresa,
  p.matricula,
  p.documento_final,
  s.nome                  as setor_destino,
  m.pessoa_visitada,
  m.motivo,
  ue.nome                 as entrada_registrada_por,
  us.nome                 as saida_registrada_por
from public.movimentacoes m
join public.pessoas p          on p.id = m.pessoa_id
left join public.setores s     on s.id = m.setor_destino_id
left join public.usuarios_sistema ue on ue.id = m.entrada_registrada_por
left join public.usuarios_sistema us on us.id = m.saida_registrada_por;

-- "Quem está dentro agora"
create or replace view public.vw_pessoas_dentro
with (security_invoker = true)
as
select * from public.vw_movimentacoes where dentro;

revoke all on public.vw_movimentacoes, public.vw_pessoas_dentro from anon;
grant select on public.vw_movimentacoes, public.vw_pessoas_dentro to authenticated;


-- =====================================================================
-- 9. LIMPEZA DE DADOS TEMPORÁRIOS
--    Agendar no Supabase (Database → Extensions → habilitar pg_cron):
--    select cron.schedule('limpeza-safeaccess', '0 3 * * *',
--                         'select public.limpar_temporarios()');
-- =====================================================================
create or replace function public.limpar_temporarios()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desafios int;
  v_qr       int;
  v_convites int;
begin
  delete from public.desafios_webauthn where expira_em < now() - interval '1 day';
  get diagnostics v_desafios = row_count;

  -- QR não usado e vencido há mais de 7 dias (os usados ficam: ligam à movimentação)
  delete from public.qr_tokens where usado_em is null and expira_em < now() - interval '7 days';
  get diagnostics v_qr = row_count;

  delete from public.convites_passkey where usado_em is null and expira_em < now() - interval '30 days';
  get diagnostics v_convites = row_count;

  return jsonb_build_object('desafios', v_desafios, 'qr_tokens', v_qr, 'convites', v_convites);
end;
$$;

revoke execute on function public.limpar_temporarios() from public, anon, authenticated;
grant  execute on function public.limpar_temporarios() to service_role;

-- =====================================================================
-- FIM
-- =====================================================================
