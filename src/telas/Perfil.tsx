import { User } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import { Modal } from '../componentes/Modal'
import type { Funcionario } from '../dados/tipos'
import { useSessao } from '../sessao/useSessao'

/*
  Figma: 10 · Perfil e configurações, 18 · Biometria desativada
         e 21 · Confirmar saída.
*/
export function Perfil({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const { biometriaAtiva, alternarBiometria, sair } = useSessao()
  const [confirmarSaida, setConfirmarSaida] = useState(false)

  const dados = [
    { rotulo: 'Matrícula', valor: funcionario.matricula },
    { rotulo: 'Setor', valor: funcionario.setor || 'Não informado' },
    { rotulo: 'Conta', valor: 'Funcionário' },
  ]

  async function sairDaConta() {
    await sair()
    navegar('/', { replace: true })
  }

  return (
    <LayoutTela titulo="Meu perfil" comNavegacao>
      <div className="flex flex-col items-center text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-info-claro text-institucional">
          <User size={34} strokeWidth={1.8} aria-hidden />
        </div>
        <p className="mt-4 text-[24px] font-bold text-marinho">{funcionario.nome}</p>
        <p className="mt-1 text-[15px] text-secundario">Matrícula {funcionario.matricula}</p>
      </div>

      <div className="mt-5">
        <Mensagem tipo="ativo">Cadastro ativo</Mensagem>
      </div>

      {/* <dl> = lista de "termo: valor", ideal para dados de perfil */}
      <dl className="mt-5 flex flex-col gap-6 rounded-cartao bg-branco p-4">
        {dados.map((d) => (
          <div key={d.rotulo} className="grid grid-cols-[100px_1fr] text-[14px]">
            <dt className="text-secundario">{d.rotulo}</dt>
            <dd className="font-medium text-texto">{d.valor}</dd>
          </div>
        ))}
      </dl>

      {/* Interruptor da biometria (ainda simulado: vira real com a passkey) */}
      <button
        type="button"
        role="switch"
        aria-checked={biometriaAtiva}
        onClick={alternarBiometria}
        className="mt-5 flex items-center justify-between rounded-cartao bg-branco p-4 text-left"
      >
        <span>
          <span className="block text-[16px] font-semibold text-marinho">Autenticação biométrica</span>
          <span className="mt-1 block text-[13px] text-secundario">
            {biometriaAtiva ? 'Ativada neste dispositivo' : 'Desativada · tocar para ativar'}
          </span>
        </span>
        <span
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            biometriaAtiva ? 'bg-institucional' : 'bg-borda'
          }`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-branco shadow transition-all ${
              biometriaAtiva ? 'left-6' : 'left-1'
            }`}
          />
        </span>
      </button>

      <Botao variante="contorno" className="mt-6" onClick={() => navegar('/trocar-senha')}>
        Alterar senha
      </Botao>
      <Botao variante="contorno" className="mt-3" onClick={() => setConfirmarSaida(true)}>
        Sair da conta
      </Botao>

      <Modal
        aberto={confirmarSaida}
        onFechar={() => setConfirmarSaida(false)}
        titulo="Sair da conta?"
        descricao="Para entrar de novo, use sua matrícula e senha."
      >
        <Botao variante="secundario" onClick={sairDaConta}>
          Sair
        </Botao>
        <Botao variante="contorno" onClick={() => setConfirmarSaida(false)}>
          Cancelar
        </Botao>
      </Modal>
    </LayoutTela>
  )
}
