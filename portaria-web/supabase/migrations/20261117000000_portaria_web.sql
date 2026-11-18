-- =====================================================================
-- SafeAccess Sacchelli — Migration 03
-- Funções da tela web da portaria e gestão de operadores.
--
--   registrar_entrada()          entrada manual (nunca vira saída por engano)
--   registrar_saida()            finaliza uma movimentação aberta
--   registrar_entrada_externo()  cadastra/reaproveita visitante e registra a entrada
--   buscar_pessoas()             busca por nome, matrícula ou documento
--   resumo_portaria()            números do dia para o painel
--   listar_operadores()          lista operadores com e-mail e último acesso (admin)
--   + proteção para nunca ficar sem administrador ativo
--
-- Pré-requisito: migrations 01 e 02 já executadas.
-- Pode ser executada mais de uma vez (idempotente).
-- =====================================================================


-- =====================================================================
-- 1. LIMITES DE TAMANHO DOS TEXTOS LIVRES
-- =====================================================================
alter table public.movimentacoes drop constraint if exists mov_textos_tamanho;
alter table public.movimentacoes add constraint mov_textos_tamanho check (
  coalesce(length(pessoa_visitada), 0) <= 120
  and coalesce(length(motivo), 0)      <= 300
  and coalesce(length(observacao), 0)  <= 500
);

alter table public.pessoas drop constraint if exists pessoas_textos_tamanho;
alter table public.pessoas add constraint pessoas_textos_tamanho check (
  coalesce(length(empresa), 0)    <= 150
  and coalesce(length(observacao), 0) <= 500
);


-- =====================================================================
-- 2. REGISTRAR ENTRADA (somente entrada)
--    registrar_passagem() alterna entrada/saída e continua sendo usada
--    pelo QR. Na tela, o porteiro clica em "Registrar entrada" e precisa
--    ter certeza de que isso nunca vai virar uma saída.
-- =====================================================================
create or replace function public.registrar_entrada(
  p_pessoa_id        uuid,
  p_setor_destino_id uuid default null,
  p_pessoa_visitada  text default null,
  p_motivo           text default null,
  p_observacao       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operador uuid := auth.uid();
  v_nome     text;
  v_ativo    boolean;
  v_aberta   timestamptz;
  v_id       uuid;
  v_entrada  timestamptz;
begin
  if v_operador is null or public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  -- Trava a pessoa: evita duas entradas simultâneas
  select nome, ativo into v_nome, v_ativo
  from public.pessoas where id = p_pessoa_id
  for update;
  if not found then
    raise exception 'Pessoa não encontrada.' using errcode = 'P0002';
  end if;
  if not v_ativo then
    raise exception 'Cadastro inativo. Procure o RH.' using errcode = '42501';
  end if;

  if p_setor_destino_id is not null and not exists (
    select 1 from public.setores where id = p_setor_destino_id and ativo
  ) then
    raise exception 'Setor de destino inválido.' using errcode = '22023';
  end if;

  select entrada_em into v_aberta
  from public.movimentacoes
  where pessoa_id = p_pessoa_id and saida_em is null;
  if found then
    raise exception 'Esta pessoa já está dentro (entrada em %).',
      to_char(v_aberta at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      using errcode = 'P0001';
  end if;

  insert into public.movimentacoes
    (pessoa_id, metodo_entrada, entrada_registrada_por, setor_destino_id,
     pessoa_visitada, motivo, observacao)
  values
    (p_pessoa_id, 'manual', v_operador, p_setor_destino_id,
     nullif(btrim(p_pessoa_visitada), ''), nullif(btrim(p_motivo), ''), nullif(btrim(p_observacao), ''))
  returning id, entrada_em into v_id, v_entrada;

  return jsonb_build_object(
    'tipo', 'entrada', 'movimentacao_id', v_id, 'pessoa_id', p_pessoa_id,
    'nome', v_nome, 'em', v_entrada
  );
end;
$$;


-- =====================================================================
-- 3. REGISTRAR SAÍDA de uma movimentação específica
--    Se outro operador já registrou a saída, avisa em vez de criar
--    uma nova entrada (o que registrar_passagem faria).
-- =====================================================================
create or replace function public.registrar_saida(p_movimentacao_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operador  uuid := auth.uid();
  v_pessoa_id uuid;
  v_saida     timestamptz;
  v_nome      text;
begin
  if v_operador is null or public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;

  update public.movimentacoes
     set saida_em = now(),
         metodo_saida = 'manual',
         saida_registrada_por = v_operador
   where id = p_movimentacao_id and saida_em is null
  returning pessoa_id, saida_em into v_pessoa_id, v_saida;

  if not found then
    if exists (select 1 from public.movimentacoes where id = p_movimentacao_id) then
      raise exception 'A saída desta pessoa já foi registrada.' using errcode = 'P0001';
    end if;
    raise exception 'Movimentação não encontrada.' using errcode = 'P0002';
  end if;

  select nome into v_nome from public.pessoas where id = v_pessoa_id;

  return jsonb_build_object(
    'tipo', 'saida', 'movimentacao_id', p_movimentacao_id, 'pessoa_id', v_pessoa_id,
    'nome', v_nome, 'em', v_saida
  );
end;
$$;


-- =====================================================================
-- 4. ENTRADA DE EXTERNO (visitante, prestador, fornecedor, outro)
--    Numa única transação: procura pelo documento; se não existir,
--    cadastra; depois registra a entrada. Se a entrada falhar (ex.: a
--    pessoa já está dentro), nada fica gravado.
-- =====================================================================
create or replace function public.registrar_entrada_externo(
  p_tipo             public.tipo_pessoa,
  p_nome             text,
  p_documento_tipo   public.tipo_documento,
  p_documento        text,
  p_empresa          text default null,
  p_setor_destino_id uuid default null,
  p_pessoa_visitada  text default null,
  p_motivo           text default null,
  p_observacao       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc       text;
  v_pessoa_id uuid;
  v_tipo      public.tipo_pessoa;
  v_nova      boolean := false;
begin
  if auth.uid() is null or public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if p_tipo = 'funcionario' then
    raise exception 'Funcionários são cadastrados pelo RH.' using errcode = '42501';
  end if;
  if p_documento_tipo is null or nullif(btrim(p_documento), '') is null then
    raise exception 'Informe o tipo e o número do documento.' using errcode = '22023';
  end if;

  v_doc := public.normalizar_documento(p_documento_tipo, p_documento);
  if p_documento_tipo = 'cpf' and not public.cpf_valido(v_doc) then
    raise exception 'CPF inválido.' using errcode = '22023';
  end if;
  if length(v_doc) < 4 then
    raise exception 'Documento inválido.' using errcode = '22023';
  end if;

  select id, tipo into v_pessoa_id, v_tipo
  from public.pessoas
  where documento_tipo = p_documento_tipo and documento = v_doc
  for update;

  if not found then
    if length(btrim(coalesce(p_nome, ''))) < 3 then
      raise exception 'Informe o nome completo.' using errcode = '22023';
    end if;
    begin
      insert into public.pessoas (tipo, nome, documento_tipo, documento, empresa)
      values (p_tipo, p_nome, p_documento_tipo, v_doc, p_empresa)
      returning id into v_pessoa_id;
      v_nova := true;
    exception when unique_violation then
      -- outro operador cadastrou o mesmo documento ao mesmo tempo
      select id into v_pessoa_id
      from public.pessoas
      where documento_tipo = p_documento_tipo and documento = v_doc;
    end;
  elsif v_tipo <> 'funcionario' and nullif(btrim(p_empresa), '') is not null then
    -- prestador pode mudar de empresa; o nome do cadastro não é alterado aqui
    update public.pessoas
       set empresa = p_empresa
     where id = v_pessoa_id and empresa is distinct from btrim(p_empresa);
  end if;

  return public.registrar_entrada(
           v_pessoa_id, p_setor_destino_id, p_pessoa_visitada, p_motivo, p_observacao)
         || jsonb_build_object('pessoa_nova', v_nova);
end;
$$;


-- =====================================================================
-- 5. BUSCA DE PESSOAS (nome, matrícula ou documento completo)
--    O documento é comparado aqui dentro e nunca é devolvido.
-- =====================================================================
create or replace function public.buscar_pessoas(p_termo text, p_limite int default 10)
returns table (
  pessoa_id       uuid,
  nome            text,
  tipo            public.tipo_pessoa,
  empresa         text,
  matricula       text,
  documento_final text,
  setor           text,
  ativo           boolean,
  movimentacao_id uuid,
  entrada_em      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_termo text := btrim(coalesce(p_termo, ''));
  v_like  text;
  v_alnum int;
begin
  if public.perfil_atual() is null then
    raise exception 'Acesso negado' using errcode = '42501';
  end if;
  if length(v_termo) < 2 then
    return;
  end if;

  v_like  := '%' || replace(replace(replace(v_termo, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_alnum := length(regexp_replace(v_termo, '[^0-9A-Za-z]', '', 'g'));

  return query
    select p.id, p.nome, p.tipo, p.empresa, p.matricula, p.documento_final,
           s.nome, p.ativo, m.id, m.entrada_em
    from public.pessoas p
    left join public.setores s       on s.id = p.setor_id
    left join public.movimentacoes m on m.pessoa_id = p.id and m.saida_em is null
    where p.nome ilike v_like
       or p.matricula = v_termo
       or (v_alnum >= 5 and p.documento = public.normalizar_documento(p.documento_tipo, v_termo))
    order by
      (p.matricula = v_termo
        or (v_alnum >= 5 and p.documento = public.normalizar_documento(p.documento_tipo, v_termo))) desc nulls last,
      p.ativo desc,
      p.nome
    limit least(greatest(coalesce(p_limite, 10), 1), 50);
end;
$$;


-- =====================================================================
-- 6. RESUMO DO DIA (fuso de São Paulo). Respeita o RLS de quem chama.
-- =====================================================================
create or replace function public.resumo_portaria()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with hoje as (
    select (date_trunc('day', now() at time zone 'America/Sao_Paulo')
            at time zone 'America/Sao_Paulo') as ini
  )
  select jsonb_build_object(
    'entradas_hoje',   (select count(*) from public.movimentacoes m, hoje where m.entrada_em >= hoje.ini),
    'saidas_hoje',     (select count(*) from public.movimentacoes m, hoje where m.saida_em >= hoje.ini),
    'dentro_agora',    (select count(*) from public.movimentacoes m where m.saida_em is null),
    'externos_dentro', (select count(*) from public.movimentacoes m
                          join public.pessoas p on p.id = m.pessoa_id
                         where m.saida_em is null and p.tipo <> 'funcionario'),
    'dentro_mais_12h', (select count(*) from public.movimentacoes m
                         where m.saida_em is null and m.entrada_em < now() - interval '12 hours')
  )
$$;


-- =====================================================================
-- 7. OPERADORES (admin): e-mail e último acesso vêm do auth.users
-- =====================================================================
create or replace function public.listar_operadores()
returns table (
  id            uuid,
  nome          text,
  email         text,
  perfil        public.perfil_usuario,
  ativo         boolean,
  ultimo_acesso timestamptz,
  criado_em     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.perfil_atual() is distinct from 'admin' then
    raise exception 'Acesso restrito a administradores.' using errcode = '42501';
  end if;

  return query
    select u.id, u.nome, a.email::text, u.perfil, u.ativo, a.last_sign_in_at, u.created_at
    from public.usuarios_sistema u
    join auth.users a on a.id = u.id
    order by u.nome;
end;
$$;

-- Operadores: só nome, perfil e ativo podem ser alterados; nunca apagados
revoke insert, update, delete on public.usuarios_sistema from authenticated;
grant insert (id, nome, perfil, ativo) on public.usuarios_sistema to authenticated;
grant update (nome, perfil, ativo)     on public.usuarios_sistema to authenticated;

-- Ninguém altera o próprio perfil/status e sempre sobra um admin ativo
create or replace function public.usuarios_proteger_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id = auth.uid()
     and (new.perfil is distinct from old.perfil or new.ativo is distinct from old.ativo) then
    raise exception 'Você não pode alterar o próprio perfil nem se desativar.' using errcode = '42501';
  end if;

  if old.perfil = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.perfil <> 'admin' or not new.ativo) then
    perform 1 from public.usuarios_sistema
     where perfil = 'admin' and ativo and id <> old.id
     for update;
    if not found then
      raise exception 'O sistema precisa de pelo menos um administrador ativo.' using errcode = '42501';
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_usuarios_proteger_admin on public.usuarios_sistema;
create trigger trg_usuarios_proteger_admin
  before update or delete on public.usuarios_sistema
  for each row execute function public.usuarios_proteger_admin();


-- =====================================================================
-- 8. PERMISSÕES DAS FUNÇÕES
-- =====================================================================
revoke execute on function public.registrar_entrada(uuid, uuid, text, text, text) from public, anon;
grant  execute on function public.registrar_entrada(uuid, uuid, text, text, text) to authenticated;

revoke execute on function public.registrar_saida(uuid) from public, anon;
grant  execute on function public.registrar_saida(uuid) to authenticated;

revoke execute on function public.registrar_entrada_externo(
  public.tipo_pessoa, text, public.tipo_documento, text, text, uuid, text, text, text) from public, anon;
grant  execute on function public.registrar_entrada_externo(
  public.tipo_pessoa, text, public.tipo_documento, text, text, uuid, text, text, text) to authenticated;

revoke execute on function public.buscar_pessoas(text, int) from public, anon;
grant  execute on function public.buscar_pessoas(text, int) to authenticated;

revoke execute on function public.resumo_portaria() from public, anon;
grant  execute on function public.resumo_portaria() to authenticated;

revoke execute on function public.listar_operadores() from public, anon;
grant  execute on function public.listar_operadores() to authenticated;

-- =====================================================================
-- FIM
-- =====================================================================
