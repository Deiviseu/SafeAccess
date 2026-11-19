import { LoaderCircle } from 'lucide-react'

// Tela de espera enquanto o app confere se já existe login salvo
export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-[430px] flex-col items-center justify-center gap-3 bg-fundo text-secundario">
      <LoaderCircle size={32} className="animate-spin text-institucional" aria-hidden />
      <p className="text-[15px]" role="status">
        {texto}
      </p>
    </div>
  )
}
