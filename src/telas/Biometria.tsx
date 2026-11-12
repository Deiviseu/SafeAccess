import { Check, Clock, ScanFace } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { LayoutTela } from '../componentes/LayoutTela'
import { ModalCenarios } from '../componentes/ModalCenarios'
import type { Funcionario } from '../dados/demo'

/*
  Figma: 03 · Autenticação biométrica, 15 · Validando identidade
         e 16 · Identidade confirmada — uma tela, três etapas.

  POR ENQUANTO É SIMULADO: espera 1,5 s e "confirma".
  Na versão real, o botão Autenticar chamará a passkey (WebAuthn)
  do celular, e quem confirma é o servidor (Edge Function do Supabase).
*/
type Etapa = 'inicial' | 'validando' | 'confirmada'

export function Biometria({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const [etapa, setEtapa] = useState<Etapa>('inicial')
  const [cenariosAbertos, setCenariosAbertos] = useState(false)

  // Quando a etapa vira "validando", espera 1,5 s e confirma
  useEffect(() => {
    if (etapa !== 'validando') return
    const timer = setTimeout(() => setEtapa('confirmada'), 1500)
    return () => clearTimeout(timer) // se sair da tela antes, cancela
  }, [etapa])

  const confirmada = etapa === 'confirmada'

  return (
    <LayoutTela
      titulo="Confirme sua identidade"
      onCenarios={etapa === 'inicial' ? () => setCenariosAbertos(true) : undefined}
      rodape="Protótipo · dados fictícios"
    >
      <div className="mt-2 flex flex-col items-center text-center">
        <div
          className={`flex size-30 items-center justify-center rounded-full ${
            confirmada ? 'bg-sucesso-claro text-sucesso' : 'bg-info-claro text-institucional'
          }`}
        >
          {confirmada ? <Check size={40} aria-hidden /> : <ScanFace size={40} strokeWidth={1.6} aria-hidden />}
        </div>

        {/* aria-live: leitores de tela anunciam quando o texto muda */}
        <div aria-live="polite">
          <h2 className="mt-8 text-[26px] font-bold text-marinho">
            {etapa === 'inicial' && 'Acesso com biometria'}
            {etapa === 'validando' && 'Confirmando identidade…'}
            {confirmada && 'Identidade confirmada'}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-secundario">
            {etapa === 'inicial' && 'Use a biometria do seu dispositivo para continuar com segurança.'}
            {etapa === 'validando' && 'Aguarde um instante.'}
            {confirmada && 'Tudo certo. Preparando seu QR Code.'}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <CardFuncionario funcionario={funcionario} />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {etapa === 'inicial' && (
          <>
            <Botao onClick={() => setEtapa('validando')}>Autenticar</Botao>
            <Botao variante="contorno" onClick={() => navegar('/inicio')}>
              Cancelar solicitação
            </Botao>
          </>
        )}

        {etapa === 'validando' && (
          <>
            {/* Figma: "Estado/Carregando" */}
            <div className="flex flex-col items-center gap-2 py-3 text-secundario">
              <Clock size={24} className="animate-pulse text-institucional" aria-hidden />
              <p className="text-[14px]">Confirmando identidade…</p>
            </div>
            <Botao variante="contorno" onClick={() => navegar('/inicio')}>
              Cancelar
            </Botao>
          </>
        )}

        {confirmada && (
          // "state" leva um recado para a próxima tela: a identidade foi confirmada
          <Botao onClick={() => navegar('/qr', { state: { identidadeConfirmada: true } })}>
            Continuar para o QR Code
          </Botao>
        )}
      </div>

      <ModalCenarios aberto={cenariosAbertos} onFechar={() => setCenariosAbertos(false)} />
    </LayoutTela>
  )
}
