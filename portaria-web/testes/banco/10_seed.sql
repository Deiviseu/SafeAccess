insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@sacchelli.com.br'),
 ('00000000-0000-0000-0000-00000000000b','porteiro@sacchelli.com.br'),
 ('00000000-0000-0000-0000-00000000000c','rh@sacchelli.com.br'),
 ('00000000-0000-0000-0000-00000000000d','024681@funcionarios.sacchelli.com.br'),
 ('00000000-0000-0000-0000-00000000000e','inativo@sacchelli.com.br');
insert into public.usuarios_sistema (id, nome, perfil, ativo) values
 ('00000000-0000-0000-0000-00000000000a','Admin Teste','admin',true),
 ('00000000-0000-0000-0000-00000000000b','Porteiro Teste','porteiro',true),
 ('00000000-0000-0000-0000-00000000000c','RH Teste','rh',true),
 ('00000000-0000-0000-0000-00000000000e','Operador Inativo','porteiro',false);
insert into public.setores (id, nome, ativo) values
 ('10000000-0000-0000-0000-000000000001','Compras',true),
 ('10000000-0000-0000-0000-000000000002','Setor Antigo',false);
insert into public.pessoas (id, tipo, nome, matricula, setor_id, documento_tipo, documento) values
 ('20000000-0000-0000-0000-000000000001','funcionario','João da Silva','024681','10000000-0000-0000-0000-000000000001','cpf','123.456.789-09');
select public.vincular_login_funcionario('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000d');
