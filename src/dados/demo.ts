/*
  DADOS DE DEMONSTRAÇÃO
  ---------------------
  Tudo aqui é fictício, igual ao protótipo do Figma.
  Quando o app for ligado ao Supabase, estes dados virão do banco
  e este arquivo deixa de ser usado.

  Nunca coloque senhas ou dados reais em arquivos do código.
*/

// "type" (TypeScript) descreve o formato de um objeto.
export type Funcionario = {
  nome: string
  primeiroNome: string
  matricula: string
  setor: string
  unidade: string
}

export type RegistroAcesso = {
  id: number
  descricao: string
  dataHora: string
}

export const funcionarioDemo: Funcionario = {
  nome: 'Lucas Almeida Costa',
  primeiroNome: 'Lucas',
  matricula: '024681',
  setor: 'Operações',
  unidade: 'Portaria principal',
}

// Credenciais aceitas no login de demonstração
export const loginDemo = {
  matricula: '024681',
  senha: 'demo1234',
}

export const ultimosAcessosDemo: RegistroAcesso[] = [
  { id: 1, descricao: 'Entrada autorizada', dataHora: '10 nov 2026 · 07:42' },
  { id: 2, descricao: 'Saída registrada', dataHora: '09 nov 2026 · 17:36' },
]

// Validade do QR Code na demonstração (o protótipo usa 30 segundos)
export const VALIDADE_QR_SEGUNDOS = 30
