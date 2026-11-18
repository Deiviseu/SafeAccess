/* Login dos operadores (porteiro, RH, admin) pelo Supabase Auth. */
(async () => {
  if (!API.configurado) { telaSemConfiguracao(); return; }
  $('#marca').replaceWith(marca());

  const params = new URLSearchParams(location.search);
  const pedida = params.get('volta');
  const volta = Object.hasOwn(PAGINAS, pedida || '') ? PAGINAS[pedida].href : PAGINAS.leitor.href;
  const msg = $('#msg');
  if (params.get('msg')) { msg.textContent = params.get('msg'); msg.className = 'msg muted'; }

  // Já está logado? Vai direto para o sistema.
  try {
    if (await API.sessao() && await API.operadorAtual()) { location.replace(volta); return; }
  } catch { /* segue para o login */ }

  const form = $('#form'), botao = $('#entrar');
  $('#email').focus();

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const { email, senha } = Object.fromEntries(new FormData(form));
    if (!email.trim() || !senha) { msg.textContent = 'Informe e-mail e senha.'; return; }
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    msg.textContent = '';
    msg.className = 'msg';
    try {
      await API.entrar(email, senha);
      location.replace(volta);
    } catch (err) {
      msg.textContent = err.message;
      form.senha.value = '';
      form.senha.focus();
      botao.disabled = false;
      botao.textContent = 'Entrar';
    }
  });
})();
