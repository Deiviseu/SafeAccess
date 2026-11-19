import { Clock, ScanFace } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Botao } from '../componentes/Botao'
import { CardFuncionario } from '../componentes/CardFuncionario'
import { LayoutTela } from '../componentes/LayoutTela'
import { Mensagem } from '../componentes/Mensagem'
import type { Funcionario } from '../dados/tipos'
import { ErroPasskey, gerarQr, navegadorSuportaBiometria } from '../servicos/passkey'

/*
  Figma: 03 · Autenticação biométrica e 15 · Validando identidade.
  Agora é real: o celular pede a digital/rosto (passkey) e o servidor
  confere a assinatura antes de gerar o QR Code de uso único.
*/
export function Biometria({ funcionario }: { funcionario: Funcionario }) {
  const navegar = useNavigate()
  const [validando, setValidando] = useState(false)
  const [aviso, setAviso] = useState('')

  async function autenticar() {
    setAviso('')
    setValidando(true)
    try {
      const qr = await gerarQr()
      // "state" leva o QR para a próxima tela (não fica salvo em lugar nenhum)
      navegar('/qr', { replace: true, state: { qr } })
    } catch (e) {
      const falha = e as ErroPasskey
      setValidando(false)
      if (falha.codigo === 'cancelado' || falha.codigo === 'biometria') navegar('/falha-autenticacao')
      else if (falha.codigo === 'rede') navegar('/sem-conexao')
      else setAviso(falha.message) // sem celular cadastrado, celular bloqueado, cadastro inativo...
    }
  }

  return (
    <LayoutTela titulo="Confirme sua identidade">
      <div className="mt-2 flex flex-col items-center text-center">
        <div className="flex size-30 items-center justify-center rounded-full bg-info-claro text-institucional">
          <ScanFace size={40} strokeWidth={1.6} aria-hidden />
        </div>

        {/* aria-live: leitores de tela anunciam quando o texto muda */}
        <div aria-live="polite">
          <h2 className="mt-8 text-[26px] font-bold text-marinho">
            {validando ? 'Confirmando identidade…' : 'Acesso com biometria'}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-secundario">
            {validando
              ? 'Siga as instruções do celular.'
              : 'Use a biometria do seu dispositivo para continuar com segurança.'}
          </p>
        </div>
      </div>

      <div className="mt-8">
        <CardFuncionario funcionario={funcionario} />
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {aviso && <Mensagem tipo="aviso">{aviso}</Mensagem>}
        {!navegadorSuportaBiometria() && (
          <Mensagem tipo="aviso">Este navegador não permite biometria. Use o Chrome (Android) ou o Safari (iPhone).</Mensagem>
        )}

        {validando ? (
          // Figma: "Estado/Carregando"
          <div className="flex flex-col items-center gap-2 py-3 text-secundario">
            <Clock size={24} className="animate-pulse text-institucional" aria-hidden />
            <p className="text-[14px]">Confirmando identidade…</p>
          </div>
        ) : (
          <>
            <Botao onClick={autenticar} disabled={!navegadorSuportaBiometria()}>
              Autenticar
            </Botao>
            <Botao variante="contorno" onClick={() => navegar('/inicio')}>
              Cancelar solicitação
            </Botao>
          </>
        )}
      </div>
    </LayoutTela>
  )
}
