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
