import { useContext } from 'react'
import { SessaoContexto } from './contexto'

// Hook (função que começa com "use") para ler a sessão em qualquer tela.
export function useSessao() {
  const sessao = useContext(SessaoContexto)
  if (!sessao) {
    throw new Error('useSessao precisa estar dentro de <SessaoProvider>')
  }
  return sessao
}
