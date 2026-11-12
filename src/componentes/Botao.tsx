import type { ButtonHTMLAttributes } from 'react'

/*
  Figma: "Botão/Primário", "Botão/Secundário" e "Botão/Contorno".
  Um componente só, com a prop "variante" escolhendo o estilo.

  Uso:  <Botao>Entrar</Botao>
        <Botao variante="contorno" onClick={...}>Voltar ao início</Botao>
*/
type Variante = 'primario' | 'secundario' | 'contorno'

type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante
}

const estilos: Record<Variante, string> = {
  primario: 'bg-amarelo text-marinho hover:brightness-95',
  secundario: 'bg-marinho text-branco hover:brightness-110',
  contorno: 'bg-branco text-institucional border border-borda hover:bg-fundo',
}

export function Botao({ variante = 'primario', className = '', type = 'button', ...resto }: BotaoProps) {
  return (
    <button
      type={type}
      className={`flex h-[52px] w-full items-center justify-center rounded-campo px-4 text-[16px] font-semibold transition disabled:opacity-60 ${estilos[variante]} ${className}`}
      {...resto}
    />
  )
}
