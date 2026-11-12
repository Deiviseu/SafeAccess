import { useEffect, type ReactNode } from 'react'

/*
  Janela por cima da tela (Figma: "20 · Cenários", "21 · Confirmar saída",
  "22 · Ajuda de acesso"). Fecha com Esc ou tocando fora.
*/
type ModalProps = {
  aberto: boolean
  onFechar: () => void
  titulo: string
  descricao?: string
  children: ReactNode
}

export function Modal({ aberto, onFechar, titulo, descricao, children }: ModalProps) {
  // useEffect: roda código "de fora" do React — aqui, escutar a tecla Esc
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar()
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar) // limpeza
  }, [aberto, onFechar])

  if (!aberto) return null // não desenha nada quando fechado

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-marinho/50 p-6 sm:items-center"
      onClick={onFechar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-titulo"
        className="w-full max-w-[342px] rounded-cartao bg-branco p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()} // clicar dentro não fecha
      >
        <h2 id="modal-titulo" className="text-[24px] font-bold text-marinho">
          {titulo}
        </h2>
        {descricao && <p className="mt-2 text-[14px] leading-relaxed text-secundario">{descricao}</p>}
        <div className="mt-6 flex flex-col gap-2">{children}</div>
      </div>
    </div>
  )
}
