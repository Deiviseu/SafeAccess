\set ON_ERROR_STOP 1
\set QUIET 1
create or replace function pg_temp.espera_erro(sql text, trecho text) returns void language plpgsql as $f$
begin
  begin execute sql;
  exception when others then
    if sqlerrm ilike '%' || trecho || '%' then raise notice 'OK  erro esperado: %', sqlerrm; return; end if;
    raise exception 'FALHOU: esperava "%", veio "%"', trecho, sqlerrm;
  end;
  raise exception 'FALHOU: esperava erro "%", mas executou', trecho;
end $f$;
grant execute on function pg_temp.espera_erro(text, text) to public;

-- ===== RH =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$
declare n int; r record;
begin
  insert into public.pessoas (tipo, nome, matricula, setor_id, documento_tipo, documento)
  values ('funcionario', 'Ana Pereira', '100200', '10000000-0000-0000-0000-000000000001', 'cpf', '111.444.777-35');
  raise notice 'OK  RH cadastra funcionário';
  perform pg_temp.espera_erro($q$insert into public.pessoas (tipo, nome, matricula) values ('funcionario','Fulano Tal','ab cd')$q$, 'pessoas_matricula_formato');
  perform pg_temp.espera_erro($q$insert into public.pessoas (tipo, nome, matricula) values ('funcionario','Outro Nome','100200')$q$, 'pessoas_matricula_unica');

  select count(*) into n from public.listar_funcionarios();
  assert n = 2, 'lista ' || n;
  select * into r from public.listar_funcionarios() where matricula = '024681';
  assert r.tem_login and r.aparelhos = 0 and r.convite_expira_em is null, 'João ' || r::text;
  select * into r from public.listar_funcionarios() where matricula = '100200';
  assert not r.tem_login and r.documento_final = '7735' and r.setor = 'Compras', 'Ana ' || r::text;
  raise notice 'OK  listar_funcionarios mostra login, celulares e convite';

  perform pg_temp.espera_erro($q$update public.pessoas set matricula = '999' where matricula = '024681'$q$, 'já tem acesso ao app');
  update public.pessoas set matricula = '100201' where matricula = '100200';
  update public.pessoas set matricula = '100200' where matricula = '100201';
  raise notice 'OK  matrícula travada só para quem tem login';

  perform pg_temp.espera_erro($q$select public.emitir_convite_passkey('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c')$q$, 'permission denied');
  raise notice 'OK  RH não emite convite direto (só a Edge Function)';
end $$;
commit;

-- ===== servidor (Edge Function) =====
do $$
declare r jsonb; r2 jsonb; n int; ana uuid;
begin
  select id into ana from public.pessoas where matricula = '100200';
  perform pg_temp.espera_erro(format('select public.emitir_convite_passkey(%L, %L)', ana, '00000000-0000-0000-0000-00000000000c'), 'sem login');
  perform pg_temp.espera_erro($q$select public.emitir_convite_passkey('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000b')$q$, 'Somente RH');
  perform pg_temp.espera_erro($q$select public.emitir_convite_passkey('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000c', 500)$q$, 'fora do permitido');
  r  := public.emitir_convite_passkey('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c');
  r2 := public.emitir_convite_passkey('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 48);
  assert length(r->>'token') = 64 and r->>'token' <> r2->>'token', 'token';
  select count(*) into n from public.convites_passkey where pessoa_id = '20000000-0000-0000-0000-000000000001' and usado_em is null and expira_em > now();
  assert n = 1, 'convites válidos ' || n;
  assert exists (select 1 from public.convites_passkey where token_hash = encode(sha256(convert_to(r2->>'token','UTF8')),'hex')), 'hash';
  assert not exists (select 1 from public.convites_passkey where token_hash = r2->>'token'), 'token em texto gravado!';
  raise notice 'OK  convite: só hash gravado, um válido por vez, validade limitada';
  insert into public.credenciais_passkey (id, pessoa_id, credential_id, public_key, dispositivo)
  values ('30000000-0000-0000-0000-0000000000a1','20000000-0000-0000-0000-000000000001','cred-x','\x00','Celular do João');
end $$;

-- ===== RH vê convite e revoga celular =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$
declare r record;
begin
  select * into r from public.listar_funcionarios() where matricula = '024681';
  assert r.aparelhos = 1 and r.convite_expira_em > now() + interval '47 hours', 'antes ' || r::text;
  update public.credenciais_passkey set revogada_em = now() where id = '30000000-0000-0000-0000-0000000000a1';
  select * into r from public.listar_funcionarios() where matricula = '024681';
  assert r.aparelhos = 0, 'revogar';
  raise notice 'OK  RH vê convite pendente e revoga celular';
end $$;
commit;

-- ===== PORTEIRO =====
begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.espera_erro('select * from public.listar_funcionarios()', 'restrito ao RH');
select pg_temp.espera_erro($q$insert into public.pessoas (tipo, nome, matricula) values ('funcionario','Teste Porteiro','555')$q$, 'row-level security');
commit;
\echo FIM: testes de funcionários passaram
