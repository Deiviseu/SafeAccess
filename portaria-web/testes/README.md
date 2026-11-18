# Testes

## Banco (`banco/`)
PostgreSQL 16 local, imitando o Supabase:

```bash
createdb safeaccess
psql -d safeaccess -f banco/00_stub_supabase.sql      # papéis e auth.uid() como no Supabase
psql -d safeaccess -f <01_schema_inicial.sql>
psql -d safeaccess -f <02_login_funcionario_qr.sql>
psql -d safeaccess -f ../supabase/migrations/20261117000000_portaria_web.sql
psql -d safeaccess -f banco/10_seed.sql
psql -d safeaccess -f banco/20_testes.sql             # termina com "FIM: todos os testes passaram"
```
Rode `20_testes.sql` sobre um banco recém-criado, porque ele grava dados.

## Navegador (`navegador/`)
Roteiro usado para testar as telas no Chrome headless.

- `servidor-teste.mjs` (uso: `node servidor-teste.mjs ../../web`) serve o front e **imita** o PostgREST e o Auth sobre o PostgreSQL local,
  com RLS e papéis reais.
- `gerar-y4m.mjs` transforma um token de QR num vídeo para a câmera falsa do Chrome.
- `teste_navegador.py` é o roteiro com Playwright (22 verificações).

Dependências: `npm i pg jsonwebtoken qrcode`, `pip install playwright` e Deno para a Edge Function.
O servidor espera o PostgreSQL em `/tmp:5433`, o banco `safeaccess` e a Edge Function em `:8000`.
Ajuste esses valores no início do arquivo.
