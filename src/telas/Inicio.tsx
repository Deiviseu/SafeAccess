import { Check } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { ModalCenarios } from '../componentes/ModalCenarios'
import { ultimosAcessosDemo, type Funcionario } from '../dados/demo'

// Figma: 02 · Início
export function Inicio({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const [cenariosAbertos, setCenariosAbertos] = useState(false)

  return (
    <LayoutTela
      titulo={`Olá, ${funcionario.primeiroNome}.`}
      onCenarios={() => setCenariosAbertos(true)}
      comNavegacao
    >
      <div className="flex flex-col gap-3">
        <CardFuncionario funcionario={funcionario} />
        <Mensagem tipo="ativo">Cadastro ativo</Mensagem>
      </div>

      {/* Cartão de destaque "Pronto para entrar?" */}
      <section className="mt-6 rounded-cartao bg-marinho p-5 text-branco">
        <p className="text-[11px] font-semibold tracking-wide text-amarelo uppercase">
          Seu acesso, na palma da mão
        </p>
        <h2 className="mt-3 text-[24px] font-bold">Pronto para entrar?</h2>
        <p className="mt-1 text-[15px] text-branco/85">Confirme sua identidade e gere seu QR Code.</p>
        <Botao className="mt-4" onClick={() => navegar('/biometria')}>
          Solicitar acesso
        </Botao>
      </section>

      <h2 className="mt-8 text-[20px] font-bold text-marinho">Últimos acessos</h2>
      {/* Listas: .map() transforma cada item do array em um pedaço de tela */}
      <ul className="mt-4 flex flex-col gap-5">
        {ultimosAcessosDemo.map((registro) => (
          <li key={registro.id} className="flex gap-4">
            <Check size={22} className="mt-0.5 shrink-0 text-institucional" aria-hidden />
            <div>
              <p className="text-[16px] text-texto">{registro.descricao}</p>
              <p className="text-[13px] text-secundario">{registro.dataHora}</p>
            </div>
          </li>
        ))}
      </ul>

      <ModalCenarios aberto={cenariosAbertos} onFechar={() => setCenariosAbertos(false)} />
    </LayoutTela>
  )
}
