import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { LayoutTela } from '../componentes/LayoutTela'
import { ModalCenarios } from '../componentes/ModalCenarios'
import { VALIDADE_QR_SEGUNDOS } from '../dados/demo'
import type { Funcionario } from '../dados/tipos'

/*
  Figma: 04 · QR Code de acesso e 17 · QR Code · Últimos segundos.

  O conteúdo do QR aqui é ILUSTRATIVO (não abre a portaria).
  Na versão real, ele terá o token de 60 s gerado pela Edge Function,
  gravado na tabela qr_tokens do banco.
*/
function gerarCodigoDemo(matricula: string) {
  return `SAFEACCESS-DEMO:${matricula}:${crypto.randomUUID()}`
}

// 30 → "00:30"
function formatar(segundos: number) {
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function QrCode({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const local = useLocation()
  const [codigo, setCodigo] = useState(() => gerarCodigoDemo(funcionario.matricula))
  const [restante, setRestante] = useState(VALIDADE_QR_SEGUNDOS)
  const [cenariosAbertos, setCenariosAbertos] = useState(false)

  // Contagem regressiva: diminui 1 a cada segundo
  useEffect(() => {
    const intervalo = setInterval(() => {
      setRestante((atual) => Math.max(atual - 1, 0))
    }, 1000)
    return () => clearInterval(intervalo) // limpa ao sair da tela
  }, [codigo]) // reinicia quando um código novo é gerado

  // Quando chegar a zero, vai para "Código expirado"
  useEffect(() => {
    if (restante === 0) navegar('/codigo-expirado', { replace: true })
  }, [restante, navegar])

  // Sem passar pela biometria, não mostra o QR
  if (!local.state?.identidadeConfirmada) {
    return <Navigate to="/biometria" replace />
  }

  function novoCodigo() {
    setCodigo(gerarCodigoDemo(funcionario.matricula))
    setRestante(VALIDADE_QR_SEGUNDOS)
  }

  const ultimosSegundos = restante <= 10
  const porcentagem = (restante / VALIDADE_QR_SEGUNDOS) * 100

  return (
    <LayoutTela titulo="Seu QR Code de acesso" onCenarios={() => setCenariosAbertos(true)} comNavegacao>
      <div className="text-center">
        <h2 className="text-[19px] font-semibold text-marinho">Apresente o celular na portaria</h2>
        <p className="mt-1 text-[14px] text-secundario">Mantenha o código visível para a leitura.</p>
      </div>

      <div className="mx-auto mt-4 rounded-cartao bg-branco p-6">
        <QRCodeSVG value={codigo} size={240} marginSize={0} fgColor="#000000" title="QR Code de acesso" />
      </div>

      <div className="mt-3 text-center">
        <p className="text-[19px] font-semibold text-marinho">{funcionario.nome}</p>
        <p className="mt-1 text-[14px] text-secundario">Matrícula {funcionario.matricula}</p>
      </div>

      {/* Temporizador com barra de progresso */}
      <div className={`mt-4 rounded-campo p-4 ${ultimosSegundos ? 'bg-erro-claro' : 'bg-info-claro'}`}>
        <p
          className={`text-center text-[17px] font-semibold ${ultimosSegundos ? 'text-erro' : 'text-institucional'}`}
          aria-live="polite"
        >
          {ultimosSegundos ? 'Expira em' : 'Válido por'} {formatar(restante)}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-borda">
          <div
            className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
              ultimosSegundos ? 'bg-erro' : 'bg-institucional'
            }`}
            style={{ width: `${porcentagem}%` }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Botao onClick={() => navegar('/acesso/autorizado')}>Simular leitura</Botao>
        <Botao variante="contorno" onClick={novoCodigo}>
          Novo código
        </Botao>
      </div>
      <p className="mt-2 text-center text-[12px] text-secundario">Código ilustrativo · validade simulada</p>

      <ModalCenarios aberto={cenariosAbertos} onFechar={() => setCenariosAbertos(false)} />
    </LayoutTela>
  )
}
