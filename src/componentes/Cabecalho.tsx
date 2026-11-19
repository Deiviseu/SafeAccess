/*
  Cabeçalho das telas internas: "PORTARIA INTELIGENTE" + título.
*/
export function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <header className="px-6 pt-10 pb-6">
      <p className="text-[11px] font-semibold tracking-wide text-institucional uppercase">Portaria inteligente</p>
      <h1 className="mt-3 text-[28px] leading-tight font-bold text-marinho">{titulo}</h1>
    </header>
  )
}
