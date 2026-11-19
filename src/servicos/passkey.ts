import { browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { supabase } from './supabase'

/*
  FACE ID / DIGITAL (passkey WebAuthn)
  ------------------------------------
  Como funciona, em 3 passos:
  1. O servidor (Edge Function app-passkey) manda um "desafio" aleatório.
  2. O celular pede a biometria e ASSINA o desafio com uma chave que nunca sai do aparelho.
  3. O servidor confere a assinatura com a chave PÚBLICA guardada no banco.
  A digital ou o rosto nunca saem do celular: nem o app nem o servidor os veem.
*/

export class ErroPasskey extends Error {
  // codigo ajuda a tela a decidir o que mostrar (ex.: 'sem_celular', 'cancelado', 'rede')
  codigo: string
  constructor(mensagem: string, codigo = 'erro') {
    super(mensagem)
    this.codigo = codigo
  }
}

export const navegadorSuportaBiometria = () => browserSupportsWebAuthn()

// Chama a Edge Function e transforma qualquer erro em ErroPasskey com mensagem pronta
async function chamar<T>(corpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('app-passkey', { body: corpo })
  if (error) {
    let info: { erro?: string; codigo?: string } | null = null
    try {
      info = await error.context.json()
    } catch {
      /* sem resposta do servidor */
    }
    if (info?.erro) throw new ErroPasskey(info.erro, info.codigo ?? 'erro')
    throw new ErroPasskey('Sem conexão com o servidor. Verifique sua internet.', 'rede')
  }
  return data as T
}

// Erros do próprio celular (cancelou, recusou, não tem biometria...)
function traduzirErroDoCelular(e: unknown): ErroPasskey {
  const nome = (e as { name?: string })?.name ?? ''
  const codigo = (e as { code?: string })?.code ?? ''
  if (codigo === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' || nome === 'InvalidStateError') {
    return new ErroPasskey('Este celular já está cadastrado.', 'ja_cadastrado')
  }
  if (nome === 'NotAllowedError' || codigo === 'ERROR_CEREMONY_ABORTED') {
    return new ErroPasskey('A biometria foi cancelada ou não foi reconhecida.', 'cancelado')
  }
  return new ErroPasskey('Não foi possível usar a biometria neste celular.', 'biometria')
}

// "Galaxy S24", "iPhone", "Android"... só para o RH reconhecer o aparelho na lista
async function nomeDoDispositivo(): Promise<string> {
  const ua = navigator.userAgent
  try {
    const dados = (navigator as Navigator & {
      userAgentData?: { getHighEntropyValues: (h: string[]) => Promise<{ model?: string }> }
    }).userAgentData
    const modelo = (await dados?.getHighEntropyValues(['model']))?.model
    if (modelo) return modelo
  } catch {
    /* navegador sem essa informação */
  }
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Celular Android'
  if (/Windows/.test(ua)) return 'Computador Windows'
  if (/Mac OS/.test(ua)) return 'Mac'
  return 'Celular'
}

type Opcoes<T> = { opcoes: T; desafio_id: string }

// Cadastra ESTE celular usando o convite que o RH gerou
export async function cadastrarCelular(convite: string) {
  const { opcoes, desafio_id } = await chamar<Opcoes<Parameters<typeof startRegistration>[0]['optionsJSON']>>({
    acao: 'registro-opcoes',
    convite,
  })
  let resposta
  try {
    resposta = await startRegistration({ optionsJSON: opcoes })
  } catch (e) {
    throw traduzirErroDoCelular(e)
  }
  await chamar({ acao: 'registro-verificar', convite, desafio_id, resposta, dispositivo: await nomeDoDispositivo() })
}

export type QrGerado = {
  token: string // conteúdo do QR (64 caracteres)
  qr_token_id: string // para acompanhar se a portaria já leu
  validade_segundos: number
}

// Pede a biometria e, se o servidor confirmar, recebe o QR de uso único
export async function gerarQr(): Promise<QrGerado> {
  const { opcoes, desafio_id } = await chamar<Opcoes<Parameters<typeof startAuthentication>[0]['optionsJSON']>>({
    acao: 'auth-opcoes',
  })
  let resposta
  try {
    resposta = await startAuthentication({ optionsJSON: opcoes })
  } catch (e) {
    throw traduzirErroDoCelular(e)
  }
  return chamar<QrGerado>({ acao: 'auth-verificar', desafio_id, resposta })
}
