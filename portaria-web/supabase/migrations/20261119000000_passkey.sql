-- =====================================================================
-- SafeAccess Sacchelli — Migration 05
-- Face ID / digital (passkey WebAuthn) do app do funcionário.
-- Funções usadas SÓ pela Edge Function app-passkey (service_role):
--
--   convite_valido()                 o convite é deste funcionário e ainda vale?
--   consumir_desafio_webauthn()      challenge de uso único (anti-replay)
--   registrar_credencial_passkey()   grava o celular e "queima" o convite (atômico)
--   credencial_para_autenticar()     chave pública e contador para conferir a assinatura
--   atualizar_contador_passkey()     anti-clonagem + último uso
--
-- Pré-requisito: migrations 01 a 04 já executadas.
-- Pode ser executada mais de uma vez (idempotente).
-- =====================================================================


-- =====================================================================
-- 1. CONVITE VÁLIDO? (antes de pedir a biometria ao celular)
-- =====================================================================
create or replace function public.convite_valido(p_pessoa_id uuid, p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.convites_passkey c
    join public.pessoas p on p.id = c.pessoa_id
    where c.pessoa_id = p_pessoa_id
      and c.token_hash = p_token_hash
      and c.usado_em is null
      and c.expira_em > now()
      and p.ativo and p.tipo = 'funcionario'
  )
$$;


-- =====================================================================
-- 2. DESAFIO DE USO ÚNICO
--    Devolve o challenge e já marca como usado: a mesma resposta
--    do celular não pode ser reaproveitada (ataque de repetição).
-- =====================================================================
create or replace function public.consumir_desafio_webauthn(
  p_desafio_id uuid,
  p_pessoa_id  uuid,
  p_finalidade text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_challenge text;
begin
  update public.desafios_webauthn
     set usado_em = now()
   where id = p_desafio_id
     and pessoa_id = p_pessoa_id
     and finalidade = p_finalidade
     and usado_em is null
     and expira_em > now()
  returning challenge into v_challenge;

  if v_challenge is null then
    raise exception 'Tempo esgotado ou pedido inválido. Tente de novo.' using errcode = 'P0001';
  end if;
  return v_challenge;
end;
$$;


-- =====================================================================
-- 3. GRAVAR O CELULAR (passkey) E MARCAR O CONVITE COMO USADO
--    Tudo numa transação: ou grava os dois, ou nenhum.
--    A chave pública chega em hexadecimal (evita ambiguidade de bytea no JSON).
-- =====================================================================
create or replace function public.registrar_credencial_passkey(
  p_pessoa_id      uuid,
  p_convite_hash   text,
  p_credential_id  text,
  p_public_key_hex text,
  p_contador       bigint,
  p_transports     text[],
  p_dispositivo    text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_convite uuid;
  v_id      uuid;
begin
  select c.id into v_convite
  from public.convites_passkey c
  join public.pessoas p on p.id = c.pessoa_id
  where c.pessoa_id = p_pessoa_id
    and c.token_hash = p_convite_hash
    and c.usado_em is null
    and c.expira_em > now()
    and p.ativo and p.tipo = 'funcionario'
  for update of c;

  if v_convite is null then
    raise exception 'Convite inválido, já usado ou vencido. Peça um novo ao RH.' using errcode = 'P0001';
  end if;

  begin
    insert into public.credenciais_passkey
      (pessoa_id, credential_id, public_key, contador, transports, dispositivo)
    values
      (p_pessoa_id, p_credential_id, decode(p_public_key_hex, 'hex'), coalesce(p_contador, 0),
       p_transports, left(nullif(btrim(p_dispositivo), ''), 60))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Este celular já está cadastrado.' using errcode = 'P0001';
  end;

  update public.convites_passkey set usado_em = now() where id = v_convite;
  return v_id;
end;
$$;


-- =====================================================================
-- 4. DADOS PARA CONFERIR A ASSINATURA DO CELULAR
--    Só celulares não revogados do próprio funcionário (ativo).
-- =====================================================================
create or replace function public.credencial_para_autenticar(p_pessoa_id uuid, p_credential_id text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id,
    'public_key_hex', encode(c.public_key, 'hex'),
    'contador', c.contador,
    'transports', to_jsonb(coalesce(c.transports, '{}'))
  )
  from public.credenciais_passkey c
  join public.pessoas p on p.id = c.pessoa_id
  where c.pessoa_id = p_pessoa_id
    and c.credential_id = p_credential_id
    and c.revogada_em is null
    and p.ativo and p.tipo = 'funcionario'
$$;


-- =====================================================================
-- 5. CONTADOR (anti-clonagem) E ÚLTIMO USO
--    Nunca volta para trás.
-- =====================================================================
create or replace function public.atualizar_contador_passkey(p_credencial_id uuid, p_contador bigint)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.credenciais_passkey
     set contador = greatest(contador, coalesce(p_contador, 0)),
         ultimo_uso_em = now()
   where id = p_credencial_id
$$;


-- =====================================================================
-- 6. PERMISSÕES: só o servidor (Edge Function com a chave secreta)
-- =====================================================================
revoke execute on function public.convite_valido(uuid, text) from public, anon, authenticated;
grant  execute on function public.convite_valido(uuid, text) to service_role;

revoke execute on function public.consumir_desafio_webauthn(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.consumir_desafio_webauthn(uuid, uuid, text) to service_role;

revoke execute on function public.registrar_credencial_passkey(uuid, text, text, text, bigint, text[], text) from public, anon, authenticated;
grant  execute on function public.registrar_credencial_passkey(uuid, text, text, text, bigint, text[], text) to service_role;

revoke execute on function public.credencial_para_autenticar(uuid, text) from public, anon, authenticated;
grant  execute on function public.credencial_para_autenticar(uuid, text) to service_role;

revoke execute on function public.atualizar_contador_passkey(uuid, bigint) from public, anon, authenticated;
grant  execute on function public.atualizar_contador_passkey(uuid, bigint) to service_role;

-- =====================================================================
-- FIM
-- =====================================================================
