import { useNavigate } from 'react-router-dom'
import { Botao } from './Botao'
import { Modal } from './Modal'

// Figma: "20 · Cenários da demonstração" — atalhos para testar cada estado
const cenarios = [
  { rotulo: 'Biometria não reconhecida', rota: '/falha-autenticacao' },
  { rotulo: 'Servidor sem conexão', rota: '/sem-conexao' },
  { rotulo: 'QR Code expirado', rota: '/codigo-expirado' },
  { rotulo: 'Acesso autorizado', rota: '/acesso/autorizado' },
  { rotulo: 'Acesso não autorizado', rota: '/acesso/recusado' },
]

export function ModalCenarios({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const navegar = useNavigate()

  return (
    <Modal
      aberto={aberto}
      onFechar={onFechar}
      titulo="Testar cenários"
      descricao="Simulações visuais, sem integração real."
    >
      {cenarios.map((c) => (
        <Botao key={c.rota} variante="contorno" onClick={() => navegar(c.rota)}>
          {c.rotulo}
        </Botao>
      ))}
      <button
        type="button"
        onClick={onFechar}
        className="mt-2 h-11 text-[15px] font-semibold text-institucional"
      >
        Fechar
      </button>
    </Modal>
  )
}
