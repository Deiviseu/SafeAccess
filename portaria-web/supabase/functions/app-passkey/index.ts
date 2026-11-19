// =====================================================================
// SafeAccess Sacchelli — Edge Function: app-passkey
//
// Face ID / digital do app do funcionário (passkey WebAuthn) e QR Code.
// Quem chama precisa estar logado no app como FUNCIONÁRIO ATIVO.
//
//   { acao: 'registro-opcoes',   convite }                          1. pede para cadastrar o celular
//   { acao: 'registro-verificar', convite, desafio_id, resposta,     2. confere e grava a chave pública
//     dispositivo }
//   { acao: 'auth-opcoes' }                                          3. pede a biometria
//   { acao: 'auth-verificar', desafio_id, resposta }                 4. confere a assinatura e gera o QR (60 s)
//
// A biometria nunca sai do celular: o servidor só guarda a CHAVE PÚBLICA
// e confere a assinatura feita pelo aparelho.
//
// Deploy:  supabase functions deploy app-passkey
// Secrets: APP_URL (endereço do app; já usado pelo rh-acesso-funcionario)
//          RP_ID   (opcional; padrão = domínio do APP_URL)
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@14';

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
const ORIGEM = APP_URL ? new URL(APP_URL).origin : '';
const RP_ID = Deno.env.get('RP_ID') || (APP_URL ? new URL(APP_URL).hostname : '');
const RP_NOME = 'SafeAccess Sacchelli';
const VALIDADE_QR = 60; // segundos
const SEM_SESSAO = { persistSession: false, autoRefreshToken: false };

function cabecalhosCors(req: Request): Record<string, string> {
  const origem = req.headers.get('Origin') ?? '';
  return {
    // só o próprio app (o JWT do funcionário já protege; isto é uma camada a mais)
    'Access-Control-Allow-Origin': origem === ORIGEM ? origem : ORIGEM || '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const paraHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const deHex = (h: string) => new Uint8Array((h.match(/../g) ?? []).map(x => parseInt(x, 16)));

async function sha256Hex(texto: string) {
  return paraHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))));
}

class Recusa extends Error {
  constructor(public status: number, mensagem: string, public codigo?: string) { super(mensagem); }
}

Deno.serve(async (req: Request) => {
  const cors = cabecalhosCors(req);
  const responder = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return responder(405, { erro: 'Método não permitido.' });
  if (!APP_URL) return responder(500, { erro: 'Servidor sem o secret APP_URL configurado.' });

  const authorization = req.headers.get('Authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return responder(401, { erro: 'Faça login novamente.' });

  try {
    // ---------- quem é? (funcionário ativo logado no app) ----------
    const comoUsuario = createClient(SUPABASE_URL, CHAVE_PUBLICA, {
      global: { headers: { Authorization: authorization } },
      auth: SEM_SESSAO,
    });
    const { data: pessoaId, error: erroQuem } = await comoUsuario.rpc('pessoa_atual_id');
    if (erroQuem) throw new Recusa(401, 'Sessão inválida. Faça login novamente.');
    if (!pessoaId) throw new Recusa(403, 'Seu cadastro não está ativo no app. Procure o RH.', 'inativo');

    const admin = createClient(SUPABASE_URL, CHAVE_SECRETA, { auth: SEM_SESSAO });

    // Executa e transforma erro do banco em recusa com a mensagem dele
    async function rpc<T>(funcao: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await admin.rpc(funcao, args);
      if (error) throw new Recusa(400, error.message);
      return data as T;
    }

    async function novoDesafio(challenge: string, finalidade: 'registro' | 'autenticacao') {
      const { data, error } = await admin.from('desafios_webauthn')
        .insert({ pessoa_id: pessoaId, challenge, finalidade }).select('id').single();
      if (error) throw new Error(error.message);
      return data.id as string;
    }

    async function celularesAtivos() {
      const { data, error } = await admin.from('credenciais_passkey')
        .select('credential_id, transports')
        .eq('pessoa_id', pessoaId).is('revogada_em', null);
      if (error) throw new Error(error.message);
      return (data ?? []).map(c => ({ id: c.credential_id as string, transports: (c.transports ?? undefined) as string[] | undefined }));
    }

    let corpo: Record<string, unknown>;
    try { corpo = await req.json(); } catch { throw new Recusa(400, 'Dados inválidos.'); }
    const acao = String(corpo.acao ?? '');

    // ---------- 1. cadastrar celular: opções ----------
    if (acao === 'registro-opcoes' || acao === 'registro-verificar') {
      const convite = String(corpo.convite ?? '');
      if (!/^[0-9a-f]{64}$/.test(convite)) throw new Recusa(400, 'Convite inválido. Leia de novo o QR do RH.', 'convite');
      const conviteHash = await sha256Hex(convite);
      if (!(await rpc<boolean>('convite_valido', { p_pessoa_id: pessoaId, p_token_hash: conviteHash }))) {
        throw new Recusa(400, 'Convite inválido, já usado ou vencido. Peça um novo ao RH.', 'convite');
      }

      if (acao === 'registro-opcoes') {
        const { data: pessoa } = await admin.from('pessoas').select('nome, matricula').eq('id', pessoaId).single();
        const opcoes = await generateRegistrationOptions({
          rpName: RP_NOME,
          rpID: RP_ID,
          userName: pessoa!.matricula,
          userDisplayName: pessoa!.nome,
          userID: new TextEncoder().encode(pessoaId),
          attestationType: 'none',
          excludeCredentials: await celularesAtivos(), // não cadastra o mesmo celular duas vezes
          authenticatorSelection: {
            authenticatorAttachment: 'platform', // a biometria DO PRÓPRIO celular
            residentKey: 'preferred',
            userVerification: 'required', // exige digital/rosto/PIN, não só "tocar"
          },
          timeout: 120_000,
        });
        return responder(200, { opcoes, desafio_id: await novoDesafio(opcoes.challenge, 'registro') });
      }

      // ---------- 2. cadastrar celular: conferir e gravar ----------
      const challenge = await rpc<string>('consumir_desafio_webauthn', {
        p_desafio_id: String(corpo.desafio_id ?? ''), p_pessoa_id: pessoaId, p_finalidade: 'registro',
      });
      // deno-lint-ignore no-explicit-any
      const resposta = corpo.resposta as any;
      let verificacao;
      try {
        verificacao = await verifyRegistrationResponse({
          response: resposta,
          expectedChallenge: challenge,
          expectedOrigin: ORIGEM,
          expectedRPID: RP_ID,
          requireUserVerification: true,
        });
      } catch {
        throw new Recusa(400, 'Não foi possível confirmar a biometria. Tente de novo.', 'biometria');
      }
      if (!verificacao.verified) throw new Recusa(400, 'Não foi possível confirmar a biometria. Tente de novo.', 'biometria');

      const cred = verificacao.registrationInfo.credential;
      await rpc('registrar_credencial_passkey', {
        p_pessoa_id: pessoaId,
        p_convite_hash: conviteHash,
        p_credential_id: cred.id,
        p_public_key_hex: paraHex(cred.publicKey),
        p_contador: cred.counter,
        p_transports: cred.transports ?? resposta?.response?.transports ?? null,
        p_dispositivo: String(corpo.dispositivo ?? '').slice(0, 60) || null,
      });
      return responder(201, { ok: true });
    }

    // ---------- 3. gerar QR: pedir a biometria ----------
    if (acao === 'auth-opcoes') {
      const celulares = await celularesAtivos();
      if (!celulares.length) {
        throw new Recusa(400, 'Nenhum celular cadastrado. Peça o convite ao RH.', 'sem_celular');
      }
      const opcoes = await generateAuthenticationOptions({
        rpID: RP_ID,
        allowCredentials: celulares,
        userVerification: 'required',
        timeout: 120_000,
      });
      return responder(200, { opcoes, desafio_id: await novoDesafio(opcoes.challenge, 'autenticacao') });
    }

    // ---------- 4. gerar QR: conferir a assinatura e emitir o token ----------
    if (acao === 'auth-verificar') {
      const challenge = await rpc<string>('consumir_desafio_webauthn', {
        p_desafio_id: String(corpo.desafio_id ?? ''), p_pessoa_id: pessoaId, p_finalidade: 'autenticacao',
      });
      // deno-lint-ignore no-explicit-any
      const resposta = corpo.resposta as any;
      const c = await rpc<{ id: string; public_key_hex: string; contador: number; transports: string[] } | null>(
        'credencial_para_autenticar', { p_pessoa_id: pessoaId, p_credential_id: String(resposta?.id ?? '') });
      if (!c) {
        throw new Recusa(400, 'Este celular não está cadastrado ou foi bloqueado. Peça um novo convite ao RH.', 'celular_nao_cadastrado');
      }

      let verificacao;
      try {
        verificacao = await verifyAuthenticationResponse({
          response: resposta,
          expectedChallenge: challenge,
          expectedOrigin: ORIGEM,
          expectedRPID: RP_ID,
          credential: { id: resposta.id, publicKey: deHex(c.public_key_hex), counter: Number(c.contador), transports: c.transports },
          requireUserVerification: true,
        });
      } catch {
        throw new Recusa(400, 'Não foi possível confirmar a biometria. Tente de novo.', 'biometria');
      }
      if (!verificacao.verified) throw new Recusa(400, 'Não foi possível confirmar a biometria. Tente de novo.', 'biometria');

      await rpc('atualizar_contador_passkey', { p_credencial_id: c.id, p_contador: verificacao.authenticationInfo.newCounter });
      const qr = await rpc<{ token: string; expira_em: string; qr_token_id: string }>('emitir_qr_token', {
        p_pessoa_id: pessoaId, p_credencial_id: c.id, p_validade_segundos: VALIDADE_QR,
      });
      return responder(200, { token: qr.token, qr_token_id: qr.qr_token_id, expira_em: qr.expira_em, validade_segundos: VALIDADE_QR });
    }

    throw new Recusa(400, 'Ação inválida.');
  } catch (e) {
    if (e instanceof Recusa) return responder(e.status, { erro: e.message, codigo: e.codigo });
    console.error(e);
    return responder(500, { erro: 'Erro no servidor. Tente de novo em instantes.' });
  }
});
