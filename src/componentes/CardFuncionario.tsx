import type { Funcionario } from '../dados/demo'

// Figma: "Card/Funcionário"
export function CardFuncionario({ funcionario }: { funcionario: Funcionario }) {
  return (
    <div className="rounded-cartao border border-borda/60 bg-branco px-4 py-4">
      <p className="text-[11px] font-medium tracking-wide text-secundario uppercase">
        Funcionário · demonstração
      </p>
      <p className="mt-1 text-[18px] font-bold text-marinho">{funcionario.nome}</p>
      <p className="mt-1 text-[14px] text-secundario">
        Matrícula {funcionario.matricula} · {funcionario.setor}
      </p>
    </div>
  )
}
