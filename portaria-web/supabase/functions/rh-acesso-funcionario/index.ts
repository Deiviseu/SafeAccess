// =====================================================================
// SafeAccess Sacchelli — Edge Function: rh-acesso-funcionario
//
// Acesso do funcionário ao app do celular. Só RH ou administrador ativo.
//
//   { acao: 'criar',           pessoa_id }  → cria login (matrícula + senha) e convite
//   { acao: 'novo_convite',    pessoa_id }  → novo convite p/ cadastrar celular
//   { acao: 'redefinir_senha', pessoa_id }  → nova senha inicial
//
// O login usa o e-mail interno <matricula>@funcionarios.sacchelli.com.br
// (nenhum e-mail é enviado). A senha gerada aparece UMA vez para o RH, e o
// app pede a troca no primeiro acesso (user_metadata.trocar_senha = true).
//
// Deploy:   supabase functions deploy rh-acesso-funcionario
// Secret:   supabase secrets set APP_URL=https://<endereço-do-app>.vercel.app
// Opcional: supabase secrets set ORIGENS_PERMITIDAS=https://<portaria>.vercel.app
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
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/+$/, '');
const ORIGENS = (Deno.env.get('ORIGENS_PERMITIDAS') ?? '').split(',').map(s => s.trim()).filter(Boolean);

const DOMINIO_FUNCIONARIOS = 'funcionarios.sacchelli.com.br';
const MATRICULA_VALIDA = /^[A-Za-z0-9._-]{1,30}$/;
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

// Senha inicial legível: sem 0/O, 1/l/I, para o RH ditar ou anotar sem confusão
function gerarSenha(tamanho = 10): string {
  const alfabeto = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const limite = 256 - (256 % alfabeto.length); // evita viés (rejection sampling)
  let senha = '';
  while (senha.length < tamanho) {
    for (const b of crypto.getRandomValues(new Uint8Array(32))) {
      if (b < limite && senha.length < tamanho) senha += alfabeto[b % alfabeto.length];
    }
  }
  return senha;
}

Deno.serve(async (req: Request) => {
  const cors = cabecalhosCors(req);
  const responder = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return responder(401, { erro: 'Faça login novamente.' });

  // 1. Quem chama precisa ser RH ou admin ativo
  const comoUsuario = createClient(SUPABASE_URL, CHAVE_PUBLICA, {
    global: { headers: { Authorization: authorization } },
    auth: SEM_SESSAO,
  });
  const { data: perfil, error: erroPerfil } = await comoUsuario.rpc('perfil_atual');
  if (erroPerfil) return responder(401, { erro: 'Sessão inválida. Faça login novamente.' });
  if (perfil !== 'admin' && perfil !== 'rh') {
    return responder(403, { erro: 'Apenas RH ou administradores podem liberar o acesso de funcionários.' });
  }

  const admin = createClient(SUPABASE_URL, CHAVE_SECRETA, { auth: SEM_SESSAO });
  const { data: quem } = await admin.auth.getUser(authorization.slice(7));
  if (!quem?.user) return responder(401, { erro: 'Sessão inválida. Faça login novamente.' });
  const operadorId = quem.user.id;

  // 2. Pedido
  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return responder(400, { erro: 'Dados inválidos.' }); }
  const acao = String(corpo.acao ?? '');
  const pessoaId = String(corpo.pessoa_id ?? '');
  if (!['criar', 'novo_convite', 'redefinir_senha'].includes(acao)) return responder(400, { erro: 'Ação inválida.' });
  if (!/^[0-9a-f-]{36}$/i.test(pessoaId)) return responder(400, { erro: 'Funcionário inválido.' });

  const { data: pessoa, error: erroPessoa } = await admin
    .from('pessoas')
    .select('id, nome, tipo, matricula, ativo, auth_user_id')
    .eq('id', pessoaId)
    .maybeSingle();
  if (erroPessoa) return responder(500, { erro: 'Erro ao consultar o funcionário.' });
  if (!pessoa || pessoa.tipo !== 'funcionario') return responder(404, { erro: 'Funcionário não encontrado.' });
  if (!pessoa.ativo) return responder(400, { erro: 'Funcionário inativo. Reative o cadastro antes de liberar o acesso.' });

  async function convite() {
    if (!APP_URL) throw new Error('Configure o secret APP_URL com o endereço do app do funcionário.');
    const { data, error } = await admin.rpc('emitir_convite_passkey', {
      p_pessoa_id: pessoa!.id, p_criado_por: operadorId, p_validade_horas: 24,
    });
    if (error) throw new Error(error.message);
    // token no "#": não vai para o servidor nem para logs de acesso
    return { link: `${APP_URL}/convite#${data.token}`, expira_em: data.expira_em };
  }

  try {
    // ---------- criar login + convite ----------
    if (acao === 'criar') {
      if (pessoa.auth_user_id) {
        return responder(409, { erro: 'Este funcionário já tem acesso. Use "Gerar novo convite" ou "Redefinir senha".' });
      }
      if (!pessoa.matricula || !MATRICULA_VALIDA.test(pessoa.matricula)) {
        return responder(400, { erro: 'Matrícula inválida para login. Use só letras, números, ponto, hífen ou sublinhado.' });
      }
      if (!APP_URL) return responder(500, { erro: 'Configure o secret APP_URL com o endereço do app do funcionário.' });

      const senha = gerarSenha();
      const email = `${pessoa.matricula.toLowerCase()}@${DOMINIO_FUNCIONARIOS}`;
      const { data: criado, error: erroCriar } = await admin.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { matricula: pessoa.matricula, trocar_senha: true },
      });
      if (erroCriar || !criado?.user) {
        const duplicado = /already|registered|exists/i.test(erroCriar?.message ?? '');
        return responder(duplicado ? 409 : 400, {
          erro: duplicado
            ? 'Já existe um login com esta matrícula. Fale com o administrador.'
            : 'Não foi possível criar o login: ' + (erroCriar?.message ?? 'erro desconhecido'),
        });
      }

      const { error: erroVinculo } = await admin.rpc('vincular_login_funcionario', {
        p_pessoa_id: pessoa.id, p_auth_user_id: criado.user.id,
      });
      if (erroVinculo) {
        await admin.auth.admin.deleteUser(criado.user.id); // desfaz: não deixa login órfão
        return responder(400, { erro: 'Não foi possível vincular o login: ' + erroVinculo.message });
      }

      return responder(201, { nome: pessoa.nome, matricula: pessoa.matricula, senha, convite: await convite() });
    }

    // As outras ações exigem login já criado
    if (!pessoa.auth_user_id) return responder(400, { erro: 'Este funcionário ainda não tem acesso. Use "Criar acesso".' });

    // ---------- novo convite ----------
    if (acao === 'novo_convite') {
      return responder(200, { nome: pessoa.nome, matricula: pessoa.matricula, convite: await convite() });
    }

    // ---------- redefinir senha ----------
    const senha = gerarSenha();
    const { error: erroSenha } = await admin.auth.admin.updateUserById(pessoa.auth_user_id, {
      password: senha,
      user_metadata: { matricula: pessoa.matricula, trocar_senha: true },
    });
    if (erroSenha) return responder(400, { erro: 'Não foi possível redefinir a senha: ' + erroSenha.message });
    return responder(200, { nome: pessoa.nome, matricula: pessoa.matricula, senha });
  } catch (e) {
    return responder(500, { erro: (e as Error).message });
  }
});
