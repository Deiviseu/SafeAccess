import type { ComponentType } from 'react'
import { Navigate } from 'react-router-dom'
import type { Funcionario } from '../dados/demo'
import { useSessao } from '../sessao/useSessao'

/*
  Protege as telas que exigem login.
  - Ninguém logado → volta para o login.
  - Logado → desenha a tela, já entregando o funcionário por prop.

  Uso no App.tsx:  <RotaProtegida tela={Inicio} />
*/
type Props = {
  tela: ComponentType<{ funcionario: Funcionario }>
}

export function RotaProtegida({ tela: Tela }: Props) {
  const { funcionario } = useSessao()
  if (!funcionario) return <Navigate to="/" replace />
  return <Tela funcionario={funcionario} />
}
