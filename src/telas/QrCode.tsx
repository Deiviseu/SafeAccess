import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { LayoutTela } from '../componentes/LayoutTela'
import { verificarLeituraDoQr } from '../dados/funcionario'
import type { Funcionario } from '../dados/tipos'
import type { QrGerado } from '../servicos/passkey'

/*
  Figma: 04 · QR Code de acesso e 17 · QR Code · Últimos segundos.
  O QR contém o token de uso único gerado pelo servidor depois da biometria.
  Enquanto ele aparece, o app pergunta ao banco a cada 2 s se a portaria já leu.
*/

// 60 → "01:00"
function formatar(segundos: number) {
  const mm = String(Math.floor(segundos / 60)).padStart(2, '0')
  const ss = String(segundos % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export function QrCode({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const qr = useLocation().state?.qr as QrGerado | undefined
  const validade = qr?.validade_segundos ?? 60
  const [restante, setRestante] = useState(validade)

  // Contagem regressiva (relógio do próprio celular, a partir do recebimento)
  useEffect(() => {
    if (!qr) return
    const inicio = Date.now()
    const intervalo = setInterval(() => {
      setRestante(Math.max(validade - Math.floor((Date.now() - inicio) / 1000), 0))
    }, 250)
    return () => clearInterval(intervalo)
  }, [qr, validade])

  // Quando chegar a zero, vai para "Código expirado"
  useEffect(() => {
    if (restante === 0) navegar('/codigo-expirado', { replace: true })
  }, [restante, navegar])

  // A portaria já leu? Pergunta a cada 2 segundos
  useEffect(() => {
    if (!qr) return
    let ativo = true
    const intervalo = setInterval(async () => {
      try {
        const leitura = await verificarLeituraDoQr(qr.qr_token_id)
        if (ativo && leitura) navegar('/acesso/autorizado', { replace: true, state: leitura })
      } catch {
        /* sem conexão por um instante: tenta de novo em 2 s */
      }
    }, 2000)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [qr, navegar])

  // Mantém a tela acesa enquanto o QR aparece (se o celular permitir)
  useEffect(() => {
    let trava: WakeLockSentinel | undefined
    navigator.wakeLock?.request('screen').then((t) => (trava = t)).catch(() => {})
    return () => {
      trava?.release().catch(() => {})
    }
  }, [])

  // Sem passar pela biometria, não existe QR
  if (!qr) return <Navigate to="/biometria" replace />

  const ultimosSegundos = restante <= 10
  const porcentagem = (restante / validade) * 100

  return (
    <LayoutTela titulo="Seu QR Code de acesso" comNavegacao>
      <div className="text-center">
        <h2 className="text-[19px] font-semibold text-marinho">Apresente o celular na portaria</h2>
        <p className="mt-1 text-[14px] text-secundario">Mantenha o código visível para a leitura.</p>
      </div>

      <div className="mx-auto mt-4 rounded-cartao bg-branco p-6">
        <QRCodeSVG value={qr.token} size={240} marginSize={0} fgColor="#000000" title="QR Code de acesso" />
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
            className={`h-full rounded-full transition-[width] duration-300 ease-linear ${
              ultimosSegundos ? 'bg-erro' : 'bg-institucional'
            }`}
            style={{ width: `${porcentagem}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {/* Um código novo exige a biometria de novo */}
        <Botao variante="contorno" onClick={() => navegar('/biometria', { replace: true })}>
          Gerar novo código
        </Botao>
      </div>
      <p className="mt-2 text-center text-[12px] text-secundario">Código de uso único. Não envie prints dele.</p>
    </LayoutTela>
  )
}
