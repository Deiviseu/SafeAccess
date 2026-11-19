import { createClient } from '@supabase/supabase-js'

/*
  CONEXÃO COM O SUPABASE
  ----------------------
  A URL e a chave PUBLICÁVEL vêm das variáveis de ambiente (arquivo .env.local
  no seu computador e "Environment Variables" no Vercel). O Vite só entrega
  ao navegador as variáveis que começam com VITE_.

  A chave publicável pode ficar no navegador: quem protege os dados é o RLS
  do banco. NUNCA use aqui a chave secreta (sb_secret_...) nem a service_role.
*/
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

export const supabaseConfigurado = Boolean(url && chave)

// Sem configuração, cria um cliente "vazio" só para o app abrir e mostrar o aviso
export const supabase = createClient(url || 'http://nao-configurado.invalid', chave || 'nao-configurado')

// O login do funcionário usa um e-mail interno montado a partir da matrícula
// (mesma regra da Edge Function rh-acesso-funcionario: tudo minúsculo).
export const DOMINIO_FUNCIONARIOS = 'funcionarios.sacchelli.com.br'
export const MATRICULA_VALIDA = /^[A-Za-z0-9._-]{1,30}$/

export function emailDaMatricula(matricula: string) {
  return `${matricula.trim().toLowerCase()}@${DOMINIO_FUNCIONARIOS}`
}
