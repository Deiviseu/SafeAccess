// =====================================================================
// SafeAccess Sacchelli — Edge Function: admin-criar-operador
//
// Cria o login (Supabase Auth) de um operador da portaria e grava o
// perfil em usuarios_sistema. Só um ADMINISTRADOR ATIVO pode chamar.
//
// Por que precisa de Edge Function: criar usuário no Auth exige a chave
// secreta, que nunca pode ir para o navegador.
//
// Deploy:  supabase functions deploy admin-criar-operador
// Opcional: supabase secrets set ORIGENS_PERMITIDAS=https://seu-dominio.vercel.app
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

// Aceita as chaves novas (sb_publishable_/sb_secret_) e as legadas (anon/service_role)
function chave(novas: string, legada: string): string {
  const json = Deno.env.get(novas);
  if (json) {
    try {
      const k = JSON.parse(json).default;
      if (k) return k;
    } catch { /* formato inesperado: tenta a legada */ }
  }
  const v = Deno.env.get(legada);
  if (!v) throw new Error(`Configure ${novas} ou ${legada}.`);
  return v;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const CHAVE_PUBLICA = chave('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
const CHAVE_SECRETA = chave('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

const PERFIS = ['admin', 'rh', 'porteiro'];
const DOMINIO_FUNCIONARIOS = '@funcionarios.sacchelli.com.br'; // reservado ao app do funcionário
const SEM_SESSAO = { persistSession: false, autoRefreshToken: false };

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('Origin') ?? '';
  const permitida = ORIGENS.length === 0 ? '*' : (ORIGENS.includes(origem) ? origem : ORIGENS[0]);
  return {
    'Access-Control-Allow-Origin': permitida,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req: Request) => {
  const cors = cabecalhosCors(req);
  const responder = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return responder(401, { erro: 'Faça login novamente.' });

  // 1. Quem está chamando? Cliente "como o usuário": RLS e perfil_atual() valem para ele.
  const comoUsuario = createClient(SUPABASE_URL, CHAVE_PUBLICA, {
    global: { headers: { Authorization: authorization } },
    auth: SEM_SESSAO,
  });
  const { data: perfil, error: erroPerfil } = await comoUsuario.rpc('perfil_atual');
  if (erroPerfil) return responder(401, { erro: 'Sessão inválida. Faça login novamente.' });
  if (perfil !== 'admin') return responder(403, { erro: 'Apenas administradores podem criar operadores.' });

  // 2. Validação dos dados
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return responder(400, { erro: 'Dados inválidos.' }); }

  const nome = String(corpo.nome ?? '').trim().replace(/\s+/g, ' ');
  const email = String(corpo.email ?? '').trim().toLowerCase();
  const perfilNovo = String(corpo.perfil ?? '');
  const senha = String(corpo.senha ?? '');

  if (nome.length < 3 || nome.length > 120) return responder(400, { erro: 'O nome deve ter entre 3 e 120 caracteres.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return responder(400, { erro: 'E-mail inválido.' });
  if (email.endsWith(DOMINIO_FUNCIONARIOS)) return responder(400, { erro: 'Esse domínio é reservado ao app dos funcionários.' });
  if (!PERFIS.includes(perfilNovo)) return responder(400, { erro: 'Perfil inválido.' });
  if (senha.length < 10 || senha.length > 72) return responder(400, { erro: 'A senha inicial deve ter entre 10 e 72 caracteres.' });

  // 3. Cria o login com a chave secreta (só existe aqui no servidor)
  const admin = createClient(SUPABASE_URL, CHAVE_SECRETA, { auth: SEM_SESSAO });
  const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true, // nenhum e-mail é enviado
    user_metadata: { nome },
  });
  if (erroCriar || !criado?.user) {
    const duplicado = /already|registered|exists/i.test(erroCriar?.message ?? '');
    return responder(duplicado ? 409 : 400, {
      erro: duplicado ? 'Já existe um login com esse e-mail.' : 'Não foi possível criar o login: ' + (erroCriar?.message ?? 'erro desconhecido'),
    });
  }

  // 4. Grava o operador COMO o admin: a auditoria registra quem criou
  const { error: erroGravar } = await comoUsuario
    .from('usuarios_sistema')
    .insert({ id: criado.user.id, nome, perfil: perfilNovo, ativo: true });

  if (erroGravar) {
    await admin.auth.admin.deleteUser(criado.user.id); // desfaz: não deixa login órfão
    return responder(400, { erro: 'Não foi possível registrar o operador: ' + erroGravar.message });
  }

  return responder(201, { id: criado.user.id, nome, email, perfil: perfilNovo });
});
