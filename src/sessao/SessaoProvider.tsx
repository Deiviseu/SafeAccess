import { useState, type ReactNode } from 'react'
import type { Funcionario } from '../dados/demo'
import { SessaoContexto } from './contexto'

/*
  O Provider "embrulha" o app inteiro (veja main.tsx) e guarda
  quem está logado. Por enquanto fica só na memória: se recarregar
  a página, a sessão some. Depois isso virá do Supabase.
*/
export function SessaoProvider({ children }: { children: ReactNode }) {
  const [funcionario, setFuncionario] = useState<Funcionario | null>(null)
  const [biometriaAtiva, setBiometriaAtiva] = useState(true)

  return (
    <SessaoContexto.Provider
      value={{
        funcionario,
        biometriaAtiva,
        entrar: (f) => setFuncionario(f),
        sair: () => setFuncionario(null),
        alternarBiometria: () => setBiometriaAtiva((atual) => !atual),
      }}
    >
      {children}
    </SessaoContexto.Provider>
  )
}
