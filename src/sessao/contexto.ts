import { createContext } from 'react'
import type { Funcionario } from '../dados/tipos'

/*
  CONTEXTO = um "estado global".
  Em vez de passar o funcionário logado de tela em tela por props,
  qualquer componente pode ler daqui com o hook useSessao().
*/
export type Sessao = {
  carregando: boolean // true enquanto verifica se já existe login salvo no celular
  funcionario: Funcionario | null // null = ninguém logado
  precisaTrocarSenha: boolean // primeiro acesso ou senha redefinida pelo RH
  // Lançam um Error com mensagem pronta para mostrar na tela
  entrar: (matricula: string, senha: string) => Promise<{ precisaTrocarSenha: boolean }>
  trocarSenha: (novaSenha: string) => Promise<void>
  sair: () => Promise<void>
}

export const SessaoContexto = createContext<Sessao | null>(null)
