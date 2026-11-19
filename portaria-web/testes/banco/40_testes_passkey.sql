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

do $$
declare
  joao uuid := '20000000-0000-0000-0000-000000000001';
  rh   uuid := '00000000-0000-0000-0000-00000000000c';
  t text; h text; t2 text; h2 text; cred uuid; r jsonb; d uuid; ch text;
begin
  t := public.emitir_convite_passkey(joao, rh)->>'token';
  h := encode(sha256(convert_to(t, 'UTF8')), 'hex');
  assert public.convite_valido(joao, h), 'convite válido';
  assert not public.convite_valido('20000000-0000-0000-0000-000000000099', h), 'convite de outra pessoa';
  assert not public.convite_valido(joao, encode(sha256(convert_to('x', 'UTF8')), 'hex')), 'hash errado';
  raise notice 'OK  convite_valido: só do dono, só com o hash certo';

  perform pg_temp.espera_erro(format('select public.registrar_credencial_passkey(%L, %L, %L, %L, 0, null, null)', joao, 'hash-errado', 'cred-1', 'a1b2'), 'Convite inválido');
  cred := public.registrar_credencial_passkey(joao, h, 'cred-1', 'a1b2c3', 0, array['internal','hybrid'], '  Galaxy S24  ');
  assert (select dispositivo from public.credenciais_passkey where id = cred) = 'Galaxy S24', 'nome do aparelho';
  assert (select usado_em is not null from public.convites_passkey where token_hash = h), 'convite queimado';
  assert not public.convite_valido(joao, h), 'convite usado ainda válido';
  perform pg_temp.espera_erro(format('select public.registrar_credencial_passkey(%L, %L, %L, %L, 0, null, null)', joao, h, 'cred-2', 'ff'), 'já usado');
  raise notice 'OK  registrar: grava o celular e queima o convite; convite não serve 2 vezes';

  t2 := public.emitir_convite_passkey(joao, rh)->>'token';
  h2 := encode(sha256(convert_to(t2, 'UTF8')), 'hex');
  perform pg_temp.espera_erro(format('select public.registrar_credencial_passkey(%L, %L, %L, %L, 0, null, null)', joao, h2, 'cred-1', 'ff'), 'já está cadastrado');
  assert public.convite_valido(joao, h2), 'convite não pode ser queimado quando o registro falha';
  raise notice 'OK  mesmo celular duas vezes é recusado (e o convite continua valendo)';

  r := public.credencial_para_autenticar(joao, 'cred-1');
  assert r->>'public_key_hex' = 'a1b2c3' and (r->>'id')::uuid = cred and r->'transports' = '["internal","hybrid"]'::jsonb, 'cred ' || r;
  assert public.credencial_para_autenticar(joao, 'cred-x') is null, 'cred inexistente';
  assert public.credencial_para_autenticar('20000000-0000-0000-0000-000000000099', 'cred-1') is null, 'cred de outra pessoa';
  raise notice 'OK  credencial_para_autenticar devolve a chave do próprio funcionário';

  perform public.atualizar_contador_passkey(cred, 5);
  perform public.atualizar_contador_passkey(cred, 3);
  assert (select contador from public.credenciais_passkey where id = cred) = 5, 'contador voltou';
  raise notice 'OK  contador nunca volta para trás';

  insert into public.desafios_webauthn (pessoa_id, challenge, finalidade) values (joao, 'ch-1', 'autenticacao') returning id into d;
  perform pg_temp.espera_erro(format('select public.consumir_desafio_webauthn(%L, %L, %L)', d, joao, 'registro'), 'Tempo esgotado');
  ch := public.consumir_desafio_webauthn(d, joao, 'autenticacao');
  assert ch = 'ch-1', 'challenge';
  perform pg_temp.espera_erro(format('select public.consumir_desafio_webauthn(%L, %L, %L)', d, joao, 'autenticacao'), 'Tempo esgotado');
  insert into public.desafios_webauthn (pessoa_id, challenge, finalidade, expira_em) values (joao, 'ch-2', 'registro', now() - interval '1 second') returning id into d;
  perform pg_temp.espera_erro(format('select public.consumir_desafio_webauthn(%L, %L, %L)', d, joao, 'registro'), 'Tempo esgotado');
  raise notice 'OK  desafio: uso único, finalidade certa, validade curta';

  update public.credenciais_passkey set revogada_em = now() where id = cred;
  assert public.credencial_para_autenticar(joao, 'cred-1') is null, 'revogado ainda autentica';
  update public.pessoas set ativo = false where id = joao;
  assert not public.convite_valido(joao, h2), 'inativo com convite válido';
  update public.pessoas set ativo = true where id = joao;
  raise notice 'OK  celular revogado e funcionário inativo não passam';
end $$;

begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.espera_erro($q$select public.convite_valido('20000000-0000-0000-0000-000000000001','x')$q$, 'permission denied');
select pg_temp.espera_erro($q$select public.credencial_para_autenticar('20000000-0000-0000-0000-000000000001','cred-1')$q$, 'permission denied');
select pg_temp.espera_erro($q$select public.registrar_credencial_passkey('20000000-0000-0000-0000-000000000001','x','y','00',0,null,null)$q$, 'permission denied');
commit;
\echo FIM: testes de passkey passaram
