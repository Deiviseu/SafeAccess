import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { LayoutTela } from './LayoutTela'

/*
  Molde das telas de resultado: ícone no círculo + título colorido + texto.
  Usado por: Código expirado, Falha, Sem conexão, Acesso validado,
  Acesso recusado e Recuperação enviada. Escrevemos uma vez, usamos seis.
*/
type Tom = 'sucesso' | 'erro' | 'aviso' | 'info'

const cores: Record<Tom, { circulo: string; titulo: string }> = {
  sucesso: { circulo: 'bg-sucesso-claro text-sucesso', titulo: 'text-sucesso' },
  erro: { circulo: 'bg-erro-claro text-erro', titulo: 'text-erro' },
  aviso: { circulo: 'bg-aviso-claro text-aviso', titulo: 'text-aviso' },
  info: { circulo: 'bg-info-claro text-institucional', titulo: 'text-institucional' },
}

type TelaStatusProps = {
  tituloTela: string
  Icone: LucideIcon
  tom: Tom
  titulo: string
  texto: string
  conteudo?: ReactNode // cartões no meio (opcional)
  acoes: ReactNode // botões no fim
  corTitulo?: string // para usar outra cor no título (ex.: marinho)
}

export function TelaStatus({ tituloTela, Icone, tom, titulo, texto, conteudo, acoes, corTitulo }: TelaStatusProps) {
  return (
    <LayoutTela titulo={tituloTela} rodape="Protótipo · sem validação real de acesso">
      <div className="mt-4 flex flex-col items-center text-center">
        <div className={`flex size-28 items-center justify-center rounded-full ${cores[tom].circulo}`}>
          <Icone size={36} strokeWidth={1.8} aria-hidden />
        </div>
        <h2 className={`mt-8 text-[24px] font-bold ${corTitulo ?? cores[tom].titulo}`}>{titulo}</h2>
        <p className="mt-3 max-w-[320px] text-[15px] leading-relaxed text-secundario">{texto}</p>
      </div>

      {conteudo && <div className="mt-8 flex flex-col gap-4">{conteudo}</div>}

      {/* mt-auto empurra os botões para o fim da tela */}
      <div className="mt-auto flex flex-col gap-3 pt-8">{acoes}</div>
    </LayoutTela>
  )
}
