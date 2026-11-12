import { House, QrCode, User } from 'lucide-react'
import { NavLink } from 'react-router-dom'

/*
  Figma: "Navegação/Início", "Navegação/Acesso" e "Navegação/Perfil".
  O NavLink sabe sozinho qual aba está ativa (isActive),
  então não precisamos de três componentes diferentes.
*/
const abas = [
  { para: '/inicio', rotulo: 'Início', Icone: House },
  { para: '/qr', rotulo: 'Acesso', Icone: QrCode },
  { para: '/perfil', rotulo: 'Perfil', Icone: User },
]

export function NavegacaoInferior() {
  return (
    <nav className="sticky bottom-0 border-t border-borda bg-branco pb-[env(safe-area-inset-bottom)]">
      <ul className="grid h-[88px] grid-cols-3">
        {abas.map(({ para, rotulo, Icone }) => (
          <li key={para}>
            <NavLink
              to={para}
              className={({ isActive }) =>
                `relative flex h-full flex-col items-center justify-center gap-1 text-[13px] ${
                  isActive ? 'font-semibold text-institucional' : 'text-secundario'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Tracinho amarelo em cima da aba ativa */}
                  {isActive && <span className="absolute top-0 h-[3px] w-8 rounded-full bg-amarelo" />}
                  <Icone size={24} strokeWidth={isActive ? 2.2 : 1.8} />
                  {rotulo}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
