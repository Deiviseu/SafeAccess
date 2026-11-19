/*
  FORMATOS DOS DADOS (TypeScript)
  -------------------------------
  "type" descreve o formato de um objeto. Os valores reais vêm do Supabase.
*/

export type Funcionario = {
  id: string // id da pessoa no banco (tabela pessoas)
  nome: string
  primeiroNome: string
  matricula: string
  setor: string // '' quando não informado
}

export type RegistroAcesso = {
  id: string
  descricao: string // "Entrada registrada" / "Saída registrada"
  quando: string // data e hora já formatadas para a tela
  metodo: string // "QR Code" / "Manual"
}
