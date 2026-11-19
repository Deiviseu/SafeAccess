# SafeAccess Sacchelli · Web da portaria

Sistema web usado no computador da portaria pelos operadores (porteiro, RH, admin).
É HTML, CSS e JavaScript puros, sem build: basta publicar a pasta **`web/`** num servidor com HTTPS.
Os dados ficam no Supabase, e as regras de negócio ficam no banco.

## Telas

| Arquivo (`web/`) | Quem usa | O que faz |
|---|---|---|
| `login.html` | todos | Login do operador (Supabase Auth). Login de funcionário do app e operador inativo são barrados. |
| `leitor.html` | todos | Leitura do QR pela câmera, registro manual (busca por nome, matrícula ou documento) e lista de quem está **dentro agora**, com saída em dois cliques. |
| `visitante.html` | todos | Cadastro de visitante, prestador ou fornecedor e registro da entrada. Se o documento já existe, o cadastro é reaproveitado. |
| `logs.html` | todos | Histórico com filtros no servidor, paginação, resumo do dia e exportação CSV **sem documento**. |
| `funcionarios.html` | RH, admin | Cadastro de funcionários e liberação do acesso ao app: senha inicial, convite com QR para cadastrar o celular, novo convite, redefinir senha e revogar celular. |
| `usuarios.html` | admin | Lista de operadores com e-mail e último acesso, criação, troca de perfil e ativação/desativação. |

## Estrutura

```
web/                    ← SÓ esta pasta vai para a hospedagem
  *.html
  css/style.css
  js/config.js          ← URL e chave PUBLICÁVEL do Supabase (preencher)
  js/api.js             ← única camada que fala com o Supabase
  js/comum.js           ← menu, sessão, avisos, paginação, CSV, CPF
  js/leitor-qr.js       ← câmera + leitura de QR (jsQR; nativo quando existir)
  js/<tela>.js          ← lógica de cada tela
  vendor/               ← supabase-js 2.119.0 e jsQR 1.4.0 (locais, sem CDN)
supabase/migrations/20261109000000_schema_inicial.sql      ← migration 01
supabase/migrations/20261111000000_login_funcionario_qr.sql ← migration 02
supabase/migrations/20261117000000_portaria_web.sql         ← migration 03
supabase/migrations/20261118000000_funcionarios.sql         ← migration 04
supabase/migrations/20261119000000_passkey.sql              ← migration 05 (Face ID do app)
supabase/functions/admin-criar-operador/index.ts            ← Edge Function (operadores)
supabase/functions/rh-acesso-funcionario/index.ts           ← Edge Function (acesso dos funcionários)
supabase/functions/app-passkey/index.ts                     ← Edge Function (Face ID e QR do app)
testes/                 ← testes do banco e do navegador (não publicar)
```

## Instalação

1. **Banco:** rode as migrations da pasta `supabase/migrations` em ordem (01 → 02 → 03 → 04 → 05)
   no SQL Editor (ou `supabase db push`). As migrations 02 a 05 podem ser executadas mais de uma vez.
2. **Setores:** cadastre os setores de destino no Table Editor (tabela `setores`) ou por SQL:
   `insert into public.setores (nome) values ('Compras'), ('Produção'), ('Expedição');`
3. **Primeiro admin:** siga a seção 7 do `GUIA_BANCO_PARA_API.md`. Em
   configurações de Authentication do Supabase, **desative a opção "Allow new users to sign up"**.
4. **Chaves:** em `web/js/config.js`, coloque a URL do projeto e a **chave publicável**
   (`sb_publishable_...`, em Project Settings → API Keys). Ela é pública por natureza,
   porque quem protege os dados é o RLS. **Nunca** coloque ali a secret key ou a service_role.
   O Supabase está substituindo as chaves `anon` e `service_role` pelas novas.
   A anon ainda funciona, mas use a publicável.
5. **Edge Functions** ("Novo operador" e acesso dos funcionários):
   ```bash
   supabase functions deploy admin-criar-operador
   supabase functions deploy rh-acesso-funcionario
   supabase functions deploy app-passkey
   # obrigatório: endereço do app do funcionário (vai no link do convite)
   supabase secrets set APP_URL=https://endereco-do-app.vercel.app
   # opcional: restringe o CORS ao seu domínio
   supabase secrets set ORIGENS_PERMITIDAS=https://safeaccess-portaria.vercel.app
   ```
   A função lê as chaves novas (`SUPABASE_SECRET_KEYS`) ou as legadas (`SUPABASE_SERVICE_ROLE_KEY`),
   que o próprio Supabase injeta.
6. **Publicar:** qualquer hospedagem estática com HTTPS (Vercel, Netlify, Cloudflare Pages ou
   um IIS/nginx na rede interna). **A câmera só funciona em HTTPS** (ou `localhost`).
   No Vercel: importe o projeto com **Root Directory = `web`**, preset "Other", sem comando de build.

## Segurança e LGPD (o que já está aplicado)

- Login individual. Sessão no `sessionStorage`: ao fechar o navegador, sai do sistema
  (o computador da portaria é compartilhado).
- Todas as regras são reforçadas no banco: horário do servidor, operador logado como autor,
  uma entrada aberta por pessoa, CPF validado, saída que não vira entrada, RLS por perfil
  e auditoria automática.
- O documento completo **nunca** chega ao navegador. A busca por documento é feita dentro
  do banco, e as telas mostram só os 4 últimos dígitos. O CSV não leva documento.
- CSP em todas as páginas: só roda script do próprio site e só conecta ao Supabase.
  Bibliotecas locais, sem CDN e sem Google Fonts, o que também evita enviar o IP da portaria a terceiros.
- QR de uso único, validado no servidor. Se o QR continuar na frente da câmera, não é consultado de novo.
- Saída em dois cliques ("Registrar saída" → "Confirmar saída?").

> Se usar domínio próprio no Supabase (custom domain), acrescente esse domínio no
> `connect-src` da CSP de cada `.html`.

## Testes realizados

- **Banco:** PostgreSQL 16 imitando o Supabase (papéis `anon`, `authenticated` e `service_role`
  e `auth.uid()`). As migrations 01, 02 e 03 foram aplicadas, e a 03 foi reaplicada.
  São 28 verificações em `testes/banco/20_testes.sql`: visitante novo e recorrente,
  entrada duplicada bloqueada, saída repetida, CPF inválido, setor inativo, rollback,
  busca com curingas, resumo do dia, permissões de porteiro, admin, funcionário e anon,
  último admin protegido e auditoria.
- **Navegador:** Chrome headless com câmera falsa exibindo um QR emitido pelo banco.
  São 22 verificações em `testes/navegador/teste_navegador.py`, cobrindo login, leitura do QR
  pelo jsQR, visitante, saída, histórico, CSV, operadores e Edge Function rodando em Deno.
  Nenhum erro no console, inclusive de CSP.
- **Limite:** o PostgREST e o Auth foram **simulados** por `testes/navegador/servidor-teste.mjs`.
  As funções SQL, o RLS e os papéis são os reais, mas **ainda não foi testado no Supabase real**.

## Pendências conhecidas

- **QR para visitante:** não existe. O visitante entra por registro manual. Se quiserem,
  é uma extensão do banco (token com validade na data e hora da visita).
- Tentativas de QR negadas aparecem na tela, mas não ficam gravadas no banco.
- O operador não troca a própria senha pela tela. Hoje o admin define a senha inicial.
- A lista "Dentro agora" atualiza a cada 30 s e após cada registro (não usa Realtime).
- Backup: o plano gratuito do Supabase não tem backup restaurável. É preciso agendar um `pg_dump`.
- Política de retenção LGPD dos visitantes: definir o prazo com a empresa.
