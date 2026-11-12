import { createContext } from 'react'
import type { Funcionario } from '../dados/demo'

/*
  CONTEXTO = um "estado global".
  Em vez de passar o funcionário logado de tela em tela por props,
  qualquer componente pode ler daqui com o hook useSessao().
*/
export type Sessao = {
  funcionario: Funcionario | null // null = ninguém logado
  biometriaAtiva: boolean
  entrar: (funcionario: Funcionario) => void
  sair: () => void
  alternarBiometria: () => void
}

export const SessaoContexto = createContext<Sessao | null>(null)
