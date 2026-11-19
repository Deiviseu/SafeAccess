import { supabase } from '../servicos/supabase'
import type { Funcionario, RegistroAcesso } from './tipos'

/*
  CONSULTAS DO FUNCIONÁRIO LOGADO
  -------------------------------
  O RLS do banco só deixa o funcionário ler os PRÓPRIOS dados.
  Por isso não precisamos filtrar "por segurança" aqui: mesmo que o app
  pedisse dados de outra pessoa, o banco não entregaria.
*/

// Dados do funcionário dono do login. null = o login não é de um funcionário ativo
// (cadastro desativado pelo RH, ou login de porteiro/admin da portaria).
export async function carregarFuncionario(): Promise<Funcionario | null> {
  const { data: id, error } = await supabase.rpc('pessoa_atual_id')
  if (error) throw error
  if (!id) return null

  const { data: pessoa, error: erroPessoa } = await supabase
    .from('pessoas')
    .select('id, nome, matricula, setor_id') // nunca "*": o documento completo é bloqueado
    .eq('id', id)
    .single()
  if (erroPessoa) throw erroPessoa

  let setor = ''
  if (pessoa.setor_id) {
    const { data: s } = await supabase.from('setores').select('nome').eq('id', pessoa.setor_id).maybeSingle()
    setor = s?.nome ?? ''
  }

  return {
    id: pessoa.id,
    nome: pessoa.nome,
    primeiroNome: pessoa.nome.split(' ')[0],
    matricula: pessoa.matricula,
    setor,
  }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const METODOS: Record<string, string> = { qr: 'QR Code', manual: 'Manual' }

// "2026-11-18T10:42:00Z" → "18 nov 2026 · 07:42" (no fuso do celular)
export function formatarDataHora(iso: string) {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]} ${d.getFullYear()} · ${hora}`
}

// Últimas entradas e saídas, da mais recente para a mais antiga
export async function buscarUltimosAcessos(pessoaId: string, quantidade = 3): Promise<RegistroAcesso[]> {
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('id, entrada_em, saida_em, metodo_entrada, metodo_saida')
    .eq('pessoa_id', pessoaId)
    .order('entrada_em', { ascending: false })
    .limit(quantidade)
  if (error) throw error

  // Cada movimentação pode virar até dois registros: a entrada e a saída
  const eventos = data.flatMap((m) => [
    ...(m.saida_em ? [{ id: m.id + '-s', descricao: 'Saída registrada', em: m.saida_em, metodo: m.metodo_saida }] : []),
    { id: m.id + '-e', descricao: 'Entrada registrada', em: m.entrada_em, metodo: m.metodo_entrada },
  ])

  return eventos
    .sort((a, b) => b.em.localeCompare(a.em))
    .slice(0, quantidade)
    .map((e) => ({ id: e.id, descricao: e.descricao, quando: formatarDataHora(e.em), metodo: METODOS[e.metodo] ?? '' }))
}

// ---------------------------------------------------------------------
// Situação agora: dentro (entrada sem saída) ou fora da empresa.
// Só serve para o app mostrar "entrada" ou "saída": quem decide de verdade
// é o banco, na hora em que a portaria lê o QR (registrar_passagem).
// ---------------------------------------------------------------------
export type Situacao = { dentro: true; desde: string } | { dentro: false }

export async function buscarSituacao(pessoaId: string): Promise<Situacao> {
  const { data, error } = await supabase
    .from('movimentacoes')
    .select('entrada_em')
    .eq('pessoa_id', pessoaId)
    .is('saida_em', null)
    .order('entrada_em', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data ? { dentro: true, desde: data.entrada_em } : { dentro: false }
}

// "2026-11-18T10:42:00Z" → "07:42" (hoje) ou "18 nov 2026 · 07:42" (outro dia)
export function formatarDesde(iso: string) {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return d.toDateString() === new Date().toDateString() ? hora : formatarDataHora(iso)
}

// ---------------------------------------------------------------------
// QR Code: a portaria já leu?
// O banco grava em qr_tokens quando o QR é usado e liga à movimentação.
// Se a entrada foi criada DEPOIS que o QR foi emitido, foi uma entrada;
// se já existia, aquela leitura registrou a saída.
// ---------------------------------------------------------------------
export type LeituraQr = { tipo: 'entrada' | 'saida'; quando: string }

export async function verificarLeituraDoQr(qrTokenId: string): Promise<LeituraQr | null> {
  const { data: qr, error } = await supabase
    .from('qr_tokens')
    .select('emitido_em, usado_em, movimentacao_id')
    .eq('id', qrTokenId)
    .maybeSingle()
  if (error) throw error
  if (!qr?.usado_em || !qr.movimentacao_id) return null

  const { data: mov, error: erroMov } = await supabase
    .from('movimentacoes')
    .select('entrada_em')
    .eq('id', qr.movimentacao_id)
    .single()
  if (erroMov) throw erroMov
  return { tipo: mov.entrada_em >= qr.emitido_em ? 'entrada' : 'saida', quando: qr.usado_em }
}

// ---------------------------------------------------------------------
// Celulares cadastrados (passkeys) do próprio funcionário
// ---------------------------------------------------------------------
export type Celular = { id: string; nome: string; cadastradoEm: string; ultimoUso: string | null }

export async function listarCelulares(): Promise<Celular[]> {
  const { data, error } = await supabase
    .from('credenciais_passkey')
    .select('id, dispositivo, created_at, ultimo_uso_em')
    .is('revogada_em', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data.map((c) => ({
    id: c.id,
    nome: c.dispositivo || 'Celular',
    cadastradoEm: formatarDataHora(c.created_at),
    ultimoUso: c.ultimo_uso_em ? formatarDataHora(c.ultimo_uso_em) : null,
  }))
}

// Remove (revoga) um celular: ele deixa de gerar QR. Não dá para desfazer.
export async function removerCelular(id: string) {
  const { error } = await supabase
    .from('credenciais_passkey')
    .update({ revogada_em: new Date().toISOString() }) // o banco grava o horário dele
    .eq('id', id)
  if (error) throw error
}
