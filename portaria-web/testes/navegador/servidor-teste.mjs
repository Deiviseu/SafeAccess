// Servidor de TESTE: serve o front e imita o mínimo do Supabase
// (PostgREST + Auth + gateway de Edge Functions) sobre o PostgreSQL local.
// As consultas rodam com o papel e o JWT do usuário (RLS de verdade).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pg = require('pg');
const jwt = require('jsonwebtoken');

const SEGREDO = 'segredo-de-teste-com-pelo-menos-32-caracteres';
const PORTA = 8787;
const RAIZ = process.argv[2];
const FUNCOES = { 'admin-criar-operador': 'http://127.0.0.1:8000', 'rh-acesso-funcionario': 'http://127.0.0.1:8001' };
const pool = new pg.Pool({ host: '/tmp', port: 5433, user: 'postgres', database: 'safeaccess' });

export const ANON = jwt.sign({ role: 'anon', iss: 'teste' }, SEGREDO);
export const SERVICE = jwt.sign({ role: 'service_role', iss: 'teste' }, SEGREDO);
const senhas = new Map(); // email -> senha (fake)
const metadados = new Map(); // id -> user_metadata
const log = [];

const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, prefer, accept-profile, content-profile, x-supabase-api-version, range',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Expose-Headers': 'Content-Range',
};
function enviar(res, status, corpo, extra = {}) {
  const h = { 'Content-Type': 'application/json', ...CORS, ...extra };
  res.writeHead(status, h);
  res.end(corpo === undefined ? '' : JSON.stringify(corpo));
}
const lerCorpo = req => new Promise(r => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });

function claimsDe(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer /, '') || req.headers.apikey;
  try { return jwt.verify(bearer, SEGREDO); } catch { return null; }
}

async function comoUsuario(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims.role === 'service_role' ? 'service_role' : claims.role === 'authenticated' ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
}

function erroPg(res, e, claims) {
  const status = e.code === '42501' ? (claims.role === 'anon' ? 401 : 403) : e.code === 'P0002' ? 404 : 400;
  enviar(res, status, { code: e.code, message: e.message, details: e.detail ?? null, hint: e.hint ?? null });
}

const ident = s => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error('identificador inválido: ' + s), { code: 'PGRST100' }); return '"' + s + '"'; };

// Filtro "col=op.valor" no estilo PostgREST
function condicao(col, expr, params) {
  let neg = false;
  if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.');
  const op = expr.slice(0, i); let val = expr.slice(i + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  let sql;
  const p = () => { params.push(val); return '$' + params.length; };
  switch (op) {
    case 'eq': sql = `${ident(col)} = ${p()}`; break;
    case 'gte': sql = `${ident(col)} >= ${p()}`; break;
    case 'lt': sql = `${ident(col)} < ${p()}`; break;
    case 'ilike': val = val.replace(/\*/g, '%'); sql = `${ident(col)}::text ilike ${p()}`; break;
    case 'is': sql = `${ident(col)} is ${({ null: 'null', true: 'true', false: 'false' })[val]}`; break;
    default: throw Object.assign(new Error('operador não suportado no teste: ' + op), { code: 'PGRST100' });
  }
  return neg ? `not (${sql})` : sql;
}

function dividirOr(s) { // respeita aspas
  const partes = []; let atual = '', aspas = false;
  for (const ch of s) {
    if (ch === '"') aspas = !aspas;
    if (ch === ',' && !aspas) { partes.push(atual); atual = ''; } else atual += ch;
  }
  partes.push(atual);
  return partes;
}

async function rest(req, res, url, claims) {
  const partes = url.pathname.replace('/rest/v1/', '').split('/');
  const corpoTxt = await lerCorpo(req);
  const corpo = corpoTxt ? JSON.parse(corpoTxt) : {};
  try {
    if (partes[0] === 'rpc') {
      const fn = partes[1];
      const info = await pool.query(`select proretset from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn]);
      if (!info.rowCount) return enviar(res, 404, { code: 'PGRST202', message: 'função não encontrada' });
      const args = Object.entries(corpo), params = args.map(([, v]) => v);
      const lista = args.map(([k], i) => `${ident(k)} => $${i + 1}`).join(', ');
      const sql = info.rows[0].proretset
        ? `select coalesce(json_agg(t), '[]') as r from public.${ident(fn)}(${lista}) t`
        : `select to_json(public.${ident(fn)}(${lista})) as r`;
      const r = await comoUsuario(claims, c => c.query(sql, params));
      return enviar(res, 200, r.rows[0].r);
    }
    const tabela = ident(partes[0]);
    const params = [], where = [];
    let colunas = '*', ordem = [], limite = null, offset = null;
    for (const [k, v] of url.searchParams) {
      if (k === 'columns') continue;
      else if (k === 'select') colunas = v.split(',').map(ident).join(', ');
      else if (k === 'order') ordem = v.split(',').map(o => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}`; });
      else if (k === 'limit') limite = Number(v);
      else if (k === 'offset') offset = Number(v);
      else if (k === 'or') where.push('(' + dividirOr(v.slice(1, -1)).map(x => { const j = x.indexOf('.'); return condicao(x.slice(0, j), x.slice(j + 1), params); }).join(' or ') + ')');
      else where.push(condicao(k, v, params));
    }
    const w = where.length ? ' where ' + where.join(' and ') : '';
    if (req.method === 'GET') {
      const sql = `select ${colunas} from public.${tabela}${w}${ordem.length ? ' order by ' + ordem.join(', ') : ''}`
        + (limite != null ? ` limit ${limite}` : '') + (offset != null ? ` offset ${offset}` : '');
      const contar = /count=exact/.test(req.headers.prefer || '');
      const { linhas, total } = await comoUsuario(claims, async c => ({
        linhas: (await c.query(sql, params)).rows,
        total: contar ? Number((await c.query(`select count(*) from public.${tabela}${w}`, params)).rows[0].count) : null,
      }));
      const ini = offset || 0;
      const h = { 'Content-Range': `${linhas.length ? ini + '-' + (ini + linhas.length - 1) : '*'}/${total ?? '*'}` };
      if (/vnd\.pgrst\.object/.test(req.headers.accept || '')) {
        if (linhas.length !== 1) return enviar(res, 406, { code: 'PGRST116', message: 'esperava 1 linha' });
        return enviar(res, 200, linhas[0], h);
      }
      return enviar(res, 200, linhas, h);
    }
    if (req.method === 'PATCH') {
      // os filtros já ocupam $1..$n; os valores do SET entram depois
      const sets = Object.keys(corpo).map(k => { params.push(corpo[k]); return `${ident(k)} = $${params.length}`; });
      const ret = url.searchParams.get('select') ? ' returning ' + colunas : ' returning 1';
      const r = await comoUsuario(claims, c => c.query(`with u as (update public.${tabela} set ${sets.join(', ')}${w}${ret}) select * from u`, params));
      return enviar(res, 200, r.rows);
    }
    if (req.method === 'POST') {
      const ks = Object.keys(corpo), sel = url.searchParams.get('select');
      const sql = `insert into public.${tabela} (${ks.map(ident).join(', ')}) values (${ks.map((_, i) => '$' + (i + 1)).join(', ')})`
        + (sel ? ' returning ' + colunas : '');
      const r = await comoUsuario(claims, c => c.query(sql, ks.map(k => corpo[k])));
      if (!sel) return enviar(res, 201, undefined);
      return enviar(res, 201, /vnd\.pgrst\.object/.test(req.headers.accept || '') ? r.rows[0] : r.rows);
    }
    enviar(res, 405, { message: 'método não suportado' });
  } catch (e) { erroPg(res, e, claims); }
}

function usuarioJson(u) {
  return { id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: metadados.get(u.id) || {}, created_at: new Date().toISOString(), last_sign_in_at: u.last_sign_in_at };
}

async function auth(req, res, url) {
  const rota = url.pathname.replace('/auth/v1/', '');
  const corpo = JSON.parse((await lerCorpo(req)) || '{}');
  if (rota === 'token' && url.searchParams.get('grant_type') === 'password') {
    const email = String(corpo.email || '').toLowerCase();
    const u = (await pool.query('select id, email from auth.users where lower(email) = $1', [email])).rows[0];
    if (!u || senhas.get(email) !== corpo.password) return enviar(res, 400, { code: 'invalid_credentials', error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' });
    await pool.query('update auth.users set last_sign_in_at = now() where id = $1', [u.id]);
    return enviar(res, 200, sessao(u));
  }
  if (rota === 'token' && url.searchParams.get('grant_type') === 'refresh_token') {
    const u = (await pool.query('select id, email from auth.users where id = $1', [corpo.refresh_token])).rows[0];
    return u ? enviar(res, 200, sessao(u)) : enviar(res, 400, { msg: 'Invalid Refresh Token' });
  }
  const claims = claimsDe(req);
  if (rota === 'user' && req.method === 'PUT') {
    if (!claims || !claims.sub) return enviar(res, 401, { msg: 'invalid JWT' });
    const u = (await pool.query('select id, email, last_sign_in_at from auth.users where id = $1', [claims.sub])).rows[0];
    if (corpo.password) {
      if (senhas.get(u.email) === corpo.password) return enviar(res, 422, { code: 'same_password', msg: 'New password should be different from the old password.' });
      senhas.set(u.email, corpo.password);
    }
    if (corpo.data) metadados.set(u.id, { ...(metadados.get(u.id) || {}), ...corpo.data });
    return enviar(res, 200, usuarioJson(u));
  }
  if (rota === 'user') {
    if (!claims || !claims.sub) return enviar(res, 401, { msg: 'invalid JWT' });
    const u = (await pool.query('select id, email, last_sign_in_at from auth.users where id = $1', [claims.sub])).rows[0];
    return u ? enviar(res, 200, usuarioJson(u)) : enviar(res, 404, { msg: 'User not found' });
  }
  if (rota === 'logout') return enviar(res, 204);
  if (rota.startsWith('admin/users')) {
    if (!claims || claims.role !== 'service_role') return enviar(res, 403, { msg: 'not admin' });
    if (req.method === 'POST') {
      const email = String(corpo.email).toLowerCase();
      try {
        const u = (await pool.query('insert into auth.users (email) values ($1) returning id, email', [email])).rows[0];
        senhas.set(email, corpo.password);
        if (corpo.user_metadata) metadados.set(u.id, corpo.user_metadata);
        return enviar(res, 200, usuarioJson(u));
      } catch { return enviar(res, 422, { code: 'email_exists', msg: 'A user with this email address has already been registered' }); }
    }
    if (req.method === 'PUT') {
      const u = (await pool.query('select id, email from auth.users where id = $1', [rota.split('/')[2]])).rows[0];
      if (!u) return enviar(res, 404, { msg: 'User not found' });
      if (corpo.password) senhas.set(u.email, corpo.password);
      if (corpo.user_metadata) metadados.set(u.id, { ...(metadados.get(u.id) || {}), ...corpo.user_metadata });
      return enviar(res, 200, usuarioJson(u));
    }
    if (req.method === 'DELETE') { await pool.query('delete from auth.users where id = $1', [rota.split('/')[2]]); return enviar(res, 200, {}); }
  }
  enviar(res, 404, { msg: 'rota de auth não simulada: ' + rota });
}

function sessao(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access = jwt.sign({ sub: u.id, role: 'authenticated', email: u.email, aud: 'authenticated', exp }, SEGREDO);
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: u.id, user: usuarioJson(u) };
}

async function funcoes(req, res, url) {
  const corpo = await lerCorpo(req);
  const nome = url.pathname.split('/')[3];
  if (!FUNCOES[nome]) return enviar(res, 404, { msg: 'função não existe' });
  const r = await fetch(FUNCOES[nome] + '/', {
    method: req.method, headers: { authorization: req.headers.authorization || '', 'content-type': req.headers['content-type'] || 'application/json' },
    body: req.method === 'GET' || req.method === 'OPTIONS' ? undefined : corpo,
  });
  res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' });
  res.end(await r.text());
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  log.push(`${req.method} ${url.pathname}${url.search}`);
  if (req.method === 'OPTIONS' && !url.pathname.startsWith('/functions/')) { res.writeHead(204, CORS); return res.end(); }
  try {
    if (url.pathname === '/__log') return enviar(res, 200, log);
    if (url.pathname.startsWith('/rest/v1/')) {
      const claims = claimsDe(req);
      if (!claims) return enviar(res, 401, { code: 'PGRST301', message: 'JWT inválido' });
      return rest(req, res, url, claims);
    }
    if (url.pathname.startsWith('/auth/v1/')) return auth(req, res, url);
    if (url.pathname.startsWith('/functions/v1/')) return funcoes(req, res, url);
    // arquivos do front; config.js aponta para este servidor
    if (url.pathname === '/js/config.js') {
      res.writeHead(200, { 'Content-Type': tipos['.js'] });
      return res.end(`window.SAFEACCESS_CONFIG = Object.freeze({ supabaseUrl: 'http://127.0.0.1:${PORTA}', supabaseKey: '${ANON}' });`);
    }
    const arq = path.join(RAIZ, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) return enviar(res, 404, { message: 'não encontrado' });
    res.writeHead(200, { 'Content-Type': tipos[path.extname(arq)] || 'application/octet-stream' });
    fs.createReadStream(arq).pipe(res);
  } catch (e) { console.error(e); enviar(res, 500, { message: String(e) }); }
}).listen(PORTA, '127.0.0.1', () => console.log('servidor de teste em http://127.0.0.1:' + PORTA));

// senhas dos usuários de teste
for (const e of ['admin@sacchelli.com.br', 'porteiro@sacchelli.com.br', 'rh@sacchelli.com.br', '024681@funcionarios.sacchelli.com.br', 'inativo@sacchelli.com.br']) senhas.set(e, 'senha-teste-123');
fs.writeFileSync(new URL('./chaves.json', import.meta.url), JSON.stringify({ anon: ANON, service: SERVICE }));
