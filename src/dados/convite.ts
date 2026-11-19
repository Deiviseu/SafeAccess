/*
  CONVITE PARA CADASTRAR O CELULAR
  --------------------------------
  O RH mostra um QR com o link  https://<app>/convite#<token>.
  O token vem depois do "#": ele não vai para o servidor do site nem para
  os logs. Guardamos na aba (sessionStorage) enquanto a pessoa faz login,
  e apagamos assim que o celular é cadastrado.
*/
const CHAVE = 'safeaccess-convite'
const FORMATO = /^[0-9a-f]{64}$/

// Lê o token do endereço (se houver), guarda e limpa o endereço
export function capturarConviteDoEndereco() {
  const token = window.location.hash.slice(1).toLowerCase()
  if (FORMATO.test(token)) {
    sessionStorage.setItem(CHAVE, token)
    window.history.replaceState(null, '', window.location.pathname)
  }
}

export function lerConvite(): string | null {
  const token = sessionStorage.getItem(CHAVE)
  return token && FORMATO.test(token) ? token : null
}

export function esquecerConvite() {
  sessionStorage.removeItem(CHAVE)
}

// Para onde ir depois do login: troca de senha, convite pendente ou início
export function destinoDepoisDoLogin(precisaTrocarSenha: boolean) {
  if (precisaTrocarSenha) return '/trocar-senha'
  return lerConvite() ? '/convite' : '/inicio'
}
