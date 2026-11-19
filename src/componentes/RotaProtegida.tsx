import type { ComponentType } from 'react'
import { Navigate } from 'react-router-dom'
import type { Funcionario } from '../dados/tipos'
import { useSessao } from '../sessao/useSessao'
import { Carregando } from './Carregando'

/*
  Protege as telas que exigem login.
  - Ainda conferindo o login salvo → tela de espera.
  - Ninguém logado → volta para o login.
  - Senha inicial (primeiro acesso) → obriga a trocar antes de tudo.
  - Logado → desenha a tela, já entregando o funcionário por prop.

  Uso no App.tsx:  <RotaProtegida tela={Inicio} />
*/
type Props = {
  tela: ComponentType<{ funcionario: Funcionario }>
}

export function RotaProtegida({ tela: Tela }: Props) {
  const { carregando, funcionario, precisaTrocarSenha } = useSessao()
  if (carregando) return <Carregando />
  if (!funcionario) return <Navigate to="/" replace />
  if (precisaTrocarSenha) return <Navigate to="/trocar-senha" replace />
  return <Tela funcionario={funcionario} />
}
