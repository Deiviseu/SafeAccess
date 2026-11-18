\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.espera_erro(sql text, trecho text) returns void language plpgsql as $f$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || trecho || '%' then
      raise notice 'OK  erro esperado: %', sqlerrm; return;
    end if;
    raise exception 'FALHOU: esperava "%", veio "%"', trecho, sqlerrm;
  end;
  raise exception 'FALHOU: esperava erro "%", mas executou', trecho;
end $f$;
grant execute on function pg_temp.espera_erro(text, text) to public;

-- ===== PORTEIRO =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$
declare r jsonb; r2 jsonb; n int;
begin
  -- T1 visitante novo
  r := public.registrar_entrada_externo('visitante','  Maria   Souza ','cpf','529.982.247-25','ACME Ltda',
        '10000000-0000-0000-0000-000000000001','Carlos (Compras)','Reunião',null);
  assert r->>'tipo' = 'entrada' and (r->>'pessoa_nova')::boolean, 'T1 ' || r;
  assert r->>'nome' = 'Maria Souza', 'T1 nome normalizado';
  raise notice 'OK  T1 visitante novo: %', r;

  -- T2 mesma pessoa já dentro: erro e nada duplicado
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Maria Souza','cpf','52998224725')$q$, 'já está dentro');
  select count(*) into n from public.pessoas where nome = 'Maria Souza';
  assert n = 1, 'T2 duplicou pessoa';

  -- T3 saída e saída repetida
  r2 := public.registrar_saida((r->>'movimentacao_id')::uuid);
  assert r2->>'tipo' = 'saida', 'T3';
  perform pg_temp.espera_erro(format('select public.registrar_saida(%L)', r->>'movimentacao_id'), 'já foi registrada');
  raise notice 'OK  T3 saída registrada';

  -- T4 volta outro dia: reaproveita cadastro, nome não muda, empresa atualiza
  r := public.registrar_entrada_externo('prestador','Outro Nome','cpf','52998224725','Nova Empresa');
  assert not (r->>'pessoa_nova')::boolean and r->>'nome' = 'Maria Souza', 'T4 ' || r;
  select count(*) into n from public.pessoas where empresa = 'Nova Empresa';
  assert n = 1, 'T4 empresa';
  raise notice 'OK  T4 reaproveitou cadastro';

  -- T5 validações
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Fulano','cpf','111.111.111-11')$q$, 'CPF inválido');
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('funcionario','Fulano','cpf','11144477735')$q$, 'cadastrados pelo RH');
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Fu','cpf','11144477735')$q$, 'nome completo');
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Fulano Tal','rg','1-2')$q$, 'Documento inválido');
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Fulano Tal','rg','12.345.678-x', null, '10000000-0000-0000-0000-000000000002')$q$, 'Setor de destino inválido');
  -- nada ficou gravado pelo erro de setor
  select count(*) into n from public.pessoas where documento_final = '678X';
  assert n = 0, 'T5 rollback falhou';
  perform pg_temp.espera_erro($q$select public.registrar_entrada_externo('visitante','Fulano Tal','rg','12345678', null, null, null, repeat('x', 301))$q$, 'mov_textos_tamanho');

  -- T6 funcionário: entrada manual, repetida bloqueada
  r := public.registrar_entrada('20000000-0000-0000-0000-000000000001');
  assert r->>'tipo' = 'entrada', 'T6';
  perform pg_temp.espera_erro($q$select public.registrar_entrada('20000000-0000-0000-0000-000000000001')$q$, 'já está dentro');
  raise notice 'OK  T6 funcionário entrada';

  -- T7 busca
  select count(*) into n from public.buscar_pessoas('silva');
  assert n = 1, 'T7 nome';
  select count(*) into n from public.buscar_pessoas('024681');
  assert n = 1, 'T7 matricula';
  select count(*) into n from public.buscar_pessoas('529.982.247-25');
  assert n = 1, 'T7 cpf formatado';
  select count(*) into n from public.buscar_pessoas('%%');
  assert n = 0, 'T7 curinga não pode listar todos';
  select count(*) into n from public.buscar_pessoas('_a');
  assert n = 0, 'T7 underline escapado';
  select count(*) into n from public.buscar_pessoas('joão') where movimentacao_id is not null;
  assert n = 1, 'T7 mostra que está dentro';
  raise notice 'OK  T7 busca';

  -- T8 resumo
  r := public.resumo_portaria();
  assert (r->>'dentro_agora')::int = 2 and (r->>'externos_dentro')::int = 1, 'T8 ' || r;
  assert (r->>'entradas_hoje')::int = 3 and (r->>'saidas_hoje')::int = 1, 'T8 ' || r;
  raise notice 'OK  T8 resumo %', r;

  -- T9 porteiro não gerencia operadores
  perform pg_temp.espera_erro('select * from public.listar_operadores()', 'restrito a administradores');
  update public.usuarios_sistema set perfil = 'admin' where id = '00000000-0000-0000-0000-00000000000b';
  assert (select perfil from public.usuarios_sistema where id = '00000000-0000-0000-0000-00000000000b') = 'porteiro', 'T9 se promoveu';
  raise notice 'OK  T9 porteiro sem gestão de operadores';
end $$;
commit;

-- auditoria registrou o operador certo
do $$ begin
  assert (select count(*) from public.auditoria where tabela='movimentacoes' and usuario_id='00000000-0000-0000-0000-00000000000b') >= 4, 'auditoria';
  assert (select count(*) from public.movimentacoes where entrada_registrada_por='00000000-0000-0000-0000-00000000000b') = 3, 'operador';
  raise notice 'OK  auditoria e operador gravados';
end $$;

-- ===== ADMIN =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare n int;
begin
  select count(*) into n from public.listar_operadores() where email like '%@%';
  assert n = 4, 'T10 listar ' || n;
  update public.usuarios_sistema set perfil = 'rh' where id = '00000000-0000-0000-0000-00000000000b';
  assert (select perfil from public.usuarios_sistema where id = '00000000-0000-0000-0000-00000000000b') = 'rh', 'T10 alterar perfil';
  perform pg_temp.espera_erro($q$update public.usuarios_sistema set ativo = false where id = '00000000-0000-0000-0000-00000000000a'$q$, 'próprio perfil');
  perform pg_temp.espera_erro($q$update public.usuarios_sistema set id = gen_random_uuid() where id = '00000000-0000-0000-0000-00000000000b'$q$, 'permission denied');
  perform pg_temp.espera_erro($q$delete from public.usuarios_sistema where id = '00000000-0000-0000-0000-00000000000e'$q$, 'permission denied');
  raise notice 'OK  T10 admin gerencia operadores com limites';
end $$;
commit;

-- último admin (pelo SQL Editor, sem auth.uid)
select pg_temp.espera_erro($q$update public.usuarios_sistema set perfil='porteiro' where id='00000000-0000-0000-0000-00000000000a'$q$, 'pelo menos um administrador');

-- ===== FUNCIONÁRIO logado e anon =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.espera_erro($q$select * from public.buscar_pessoas('silva')$q$, 'Acesso negado');
select pg_temp.espera_erro($q$select public.registrar_entrada('20000000-0000-0000-0000-000000000001')$q$, 'Acesso negado');
commit;
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
select pg_temp.espera_erro($q$select public.registrar_saida(gen_random_uuid())$q$, 'Acesso negado');
commit;
begin;
set local role anon;
select pg_temp.espera_erro($q$select public.registrar_entrada(gen_random_uuid())$q$, 'permission denied');
select pg_temp.espera_erro($q$select public.resumo_portaria()$q$, 'permission denied');
commit;
\echo FIM: todos os testes passaram
