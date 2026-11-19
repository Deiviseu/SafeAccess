-- =====================================================================
-- SafeAccess Sacchelli — Migration 04
-- Cadastro de funcionários pelo RH e convite para cadastrar o celular.
--
--   listar_funcionarios()     lista para a tela "Funcionários" (RH/admin)
--   emitir_convite_passkey()  gera o convite do celular (só Edge Function)
--   + formato da matrícula (ela vira o login: <matricula>@funcionarios...)
--   + matrícula não muda depois que o funcionário tem login
--
-- Pré-requisito: migrations 01, 02 e 03 já executadas.
-- Pode ser executada mais de uma vez (idempotente).
-- =====================================================================


-- =====================================================================
-- 1. MATRÍCULA
-- =====================================================================
-- Só letras, números, ponto, hífen e sublinhado: ela compõe o e-mail
-- interno do login. "not valid" = não reprova cadastros antigos.
alter table public.pessoas drop constraint if exists pessoas_matricula_formato;
alter table public.pessoas add constraint pessoas_matricula_formato
  check (matricula is null or matricula ~ '^[A-Za-z0-9._-]{1,30}$') not valid;

-- Depois de criado o login, mudar a matrícula quebraria o acesso ao app
create or replace function public.pessoas_matricula_travada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.auth_user_id is not null and new.matricula is distinct from old.matricula then
    raise exception 'Não é possível alterar a matrícula de quem já tem acesso ao app.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pessoas_matricula_travada on public.pessoas;
create trigger trg_pessoas_matricula_travada
  before update on public.pessoas
  for each row execute function public.pessoas_matricula_travada();


-- =====================================================================
-- 2. LISTA DE FUNCIONÁRIOS (RH/admin)
--    Mostra se tem login, último acesso ao app, celulares e convite pendente.
-- =====================================================================
create or replace function public.listar_funcionarios()
returns table (
  pessoa_id         uuid,
  nome              text,
  matricula         text,
  setor_id          uuid,
  setor             text,
  documento_tipo    public.tipo_documento,
  documento_final   text,
  ativo             boolean,
  tem_login         boolean,
  ultimo_login      timestamptz,
  aparelhos         int,
  convite_expira_em timestamptz,
  criado_em         timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.perfil_atual() is distinct from 'admin' and public.perfil_atual() is distinct from 'rh' then
    raise exception 'Acesso restrito ao RH e aos administradores.' using errcode = '42501';
  end if;

  return query
    select p.id, p.nome, p.matricula, p.setor_id, s.nome, p.documento_tipo, p.documento_final, p.ativo,
           p.auth_user_id is not null,
           a.last_sign_in_at,
           (select count(*)::int from public.credenciais_passkey c
             where c.pessoa_id = p.id and c.revogada_em is null),
           (select max(cv.expira_em) from public.convites_passkey cv
             where cv.pessoa_id = p.id and cv.usado_em is null and cv.expira_em > now()),
           p.created_at
    from public.pessoas p
    left join public.setores s on s.id = p.setor_id
    left join auth.users a     on a.id = p.auth_user_id
    where p.tipo = 'funcionario'
    order by p.nome;
end;
$$;


-- =====================================================================
-- 3. CONVITE PARA CADASTRAR O CELULAR (chamado só pela Edge Function)
--    Devolve o token em texto UMA vez; o banco guarda só o hash.
--    Um convite válido por vez: os anteriores são invalidados.
-- =====================================================================
create or replace function public.emitir_convite_passkey(
  p_pessoa_id      uuid,
  p_criado_por     uuid,
  p_validade_horas int default 24
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
  if p_validade_horas not between 1 and 168 then
    raise exception 'Validade do convite fora do permitido (1 a 168 horas).' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.pessoas
    where id = p_pessoa_id and tipo = 'funcionario' and ativo and auth_user_id is not null
  ) then
    raise exception 'Funcionário inativo, inexistente ou ainda sem login.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.usuarios_sistema
    where id = p_criado_por and ativo and perfil in ('admin', 'rh')
  ) then
    raise exception 'Somente RH ou administrador pode gerar convites.' using errcode = '42501';
  end if;

  update public.convites_passkey
     set expira_em = now()
   where pessoa_id = p_pessoa_id and usado_em is null and expira_em > now();

  -- 244 bits aleatórios (dois UUID v4), como no QR
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.convites_passkey (pessoa_id, token_hash, expira_em, criado_por)
  values (
    p_pessoa_id,
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    now() + make_interval(hours => p_validade_horas),
    p_criado_por
  )
  returning id, expira_em into v_id, v_expira;

  return jsonb_build_object('convite_id', v_id, 'token', v_token, 'expira_em', v_expira);
end;
$$;


-- =====================================================================
-- 4. PERMISSÕES
-- =====================================================================
revoke execute on function public.listar_funcionarios() from public, anon;
grant  execute on function public.listar_funcionarios() to authenticated;

revoke execute on function public.emitir_convite_passkey(uuid, uuid, int) from public, anon, authenticated;
grant  execute on function public.emitir_convite_passkey(uuid, uuid, int) to service_role;

-- =====================================================================
-- FIM
-- =====================================================================
