/*
  Cabeçalho das telas internas: "PORTARIA INTELIGENTE" + título.
  O botão "Cenários" fica na mesma linha do "PORTARIA INTELIGENTE"
  (como no Figma) e só aparece quando a tela passa onCenarios.
*/
type CabecalhoProps = {
  titulo: string
  onCenarios?: () => void
}

export function Cabecalho({ titulo, onCenarios }: CabecalhoProps) {
  return (
    <header className="px-6 pt-10 pb-6">
      <div className="flex h-5 items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wide text-institucional uppercase">
          Portaria inteligente
        </p>
        {onCenarios && (
          <button
            type="button"
            onClick={onCenarios}
            className="-mr-2 flex h-11 items-center px-2 text-[14px] font-semibold text-institucional"
          >
            Cenários
          </button>
        )}
      </div>
      <h1 className="mt-3 text-[28px] leading-tight font-bold text-marinho">{titulo}</h1>
    </header>
  )
}
