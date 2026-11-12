import type { ReactNode } from 'react'

// Figma: "Mensagem/Ativo", "Mensagem/Erro" e "Mensagem/Aviso"
type Tipo = 'ativo' | 'erro' | 'aviso'

const estilos: Record<Tipo, string> = {
  ativo: 'bg-sucesso-claro text-sucesso',
  erro: 'bg-erro-claro text-erro',
  aviso: 'bg-aviso-claro text-aviso',
}

export function Mensagem({ tipo, children }: { tipo: Tipo; children: ReactNode }) {
  return (
    // role="alert" faz leitores de tela anunciarem os erros
    <div
      role={tipo === 'erro' ? 'alert' : 'status'}
      className={`flex min-h-12 items-center rounded-campo px-4 py-3 text-[14px] ${estilos[tipo]}`}
    >
      {children}
    </div>
  )
}
