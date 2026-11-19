import type { ReactNode } from 'react'
import { Cabecalho } from './Cabecalho'
import { NavegacaoInferior } from './NavegacaoInferior'

/*
  Molde comum das telas internas: cabeçalho + conteúdo + rodapé.
  - comNavegacao: mostra as abas Início / Acesso / Perfil
  - rodape: texto pequeno no fim (opcional)
*/
type LayoutTelaProps = {
  titulo: string
  children: ReactNode
  comNavegacao?: boolean
  rodape?: string
}

export function LayoutTela({ titulo, children, comNavegacao = false, rodape }: LayoutTelaProps) {
  return (
    // Coluna de largura de celular, centralizada se abrir no computador
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col bg-fundo">
      <Cabecalho titulo={titulo} />
      <main className="flex flex-1 flex-col px-6 pb-6">{children}</main>
      {rodape && <p className="px-6 pb-8 text-center text-[12px] text-secundario">{rodape}</p>}
      {comNavegacao && <NavegacaoInferior />}
    </div>
  )
}
