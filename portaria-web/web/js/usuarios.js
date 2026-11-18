/* Gestão de operadores (somente administradores). */
iniciarPagina('usuarios', async eu => {
  const TAMANHO = 10;
  let todos = [], filtrados = [], editando = null;

  for (const [valor, rotulo] of Object.entries(PERFIS)) $('#perfil').append(new Option(rotulo, valor));

  const pag = criarPaginador({ info: $('#info'), prev: $('#prev'), next: $('#next'), tamanho: TAMANHO, aoMudar: desenhar });

  function linha(u) {
    const quem = el('div');
    filhos(quem, el('strong', null, u.nome + (u.id === eu.id ? ' (você)' : '')), el('div', 'muted', u.email));
    const editar = el('button', 'btn btn-sm', 'Editar');
    editar.type = 'button';
    editar.setAttribute('aria-label', 'Editar ' + u.nome);
    if (u.id === eu.id) { editar.disabled = true; editar.title = 'Você não pode alterar o próprio perfil.'; }
    editar.addEventListener('click', () => abrirEdicao(u));
    const tr = el('tr');
    tr.append(td(quem), td(PERFIS[u.perfil] || u.perfil), td(badge(u.ativo ? 'ok' : 'neutro', u.ativo ? 'Ativo' : 'Inativo')),
      td(u.ultimo_acesso ? fmtDataHora(u.ultimo_acesso) : 'Nunca entrou'), td(editar));
    return tr;
  }

  function desenhar(pagina = pag.pagina) {
    const ini = (pagina - 1) * TAMANHO, fatia = filtrados.slice(ini, ini + TAMANHO);
    $('#tbody').replaceChildren(...(fatia.length ? fatia.map(linha) : [linhaVazia(5)]));
    pag.definirTotal(filtrados.length);
  }

  function filtrar() {
    const q = $('#q').value.toLowerCase().trim(), pf = $('#perfil').value, st = $('#status').value;
    filtrados = todos.filter(u => `${u.nome} ${u.email}`.toLowerCase().includes(q)
      && (!pf || u.perfil === pf) && (!st || String(u.ativo) === st));
    pag.reiniciar();
    desenhar(1);
  }

  async function carregar() {
    todos = await API.operadores();
    $('#t-total').textContent = todos.length;
    $('#t-admin').textContent = todos.filter(u => u.perfil === 'admin' && u.ativo).length;
    $('#t-ativos').textContent = todos.filter(u => u.ativo).length;
    filtrar();
  }

  $('#q').addEventListener('input', filtrar);
  $('#perfil').addEventListener('change', filtrar);
  $('#status').addEventListener('change', filtrar);

  // Fechar diálogos
  for (const b of document.querySelectorAll('[data-fechar]')) b.addEventListener('click', () => b.closest('dialog').close());

  // ---------- novo operador ----------
  const dlgNovo = $('#dlg-novo'), formNovo = $('#form-novo'), msgNovo = $('#msg-novo');
  $('#novo').addEventListener('click', () => { formNovo.reset(); msgNovo.textContent = ''; dlgNovo.showModal(); });

  formNovo.addEventListener('submit', async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(formNovo));
    f.nome = f.nome.trim().replace(/\s+/g, ' ');
    f.email = f.email.trim().toLowerCase();
    if (f.nome.length < 3) { msgNovo.textContent = 'Informe o nome completo.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) { msgNovo.textContent = 'Informe um e-mail válido.'; return; }
    if (f.senha.length < 10) { msgNovo.textContent = 'A senha inicial precisa ter pelo menos 10 caracteres.'; return; }
    const b = formNovo.querySelector('[type=submit]');
    b.disabled = true;
    try {
      await API.criarOperador(f);
      dlgNovo.close();
      avisar(`Operador ${f.nome} criado. Entregue a senha inicial pessoalmente.`, 'ok');
      await carregar();
    } catch (err) {
      msgNovo.textContent = err.message;
    } finally { b.disabled = false; }
  });

  // ---------- editar perfil / ativar / desativar ----------
  const dlgEd = $('#dlg-editar'), formEd = $('#form-editar'), msgEd = $('#msg-editar');
  function abrirEdicao(u) {
    editando = u;
    $('#ed-nome').textContent = u.nome;
    $('#ed-email').textContent = u.email;
    $('#ed-perfil').value = u.perfil;
    $('#ed-ativo').checked = u.ativo;
    msgEd.textContent = '';
    dlgEd.showModal();
  }

  formEd.addEventListener('submit', async e => {
    e.preventDefault();
    const campos = { perfil: $('#ed-perfil').value, ativo: $('#ed-ativo').checked };
    if (campos.perfil === editando.perfil && campos.ativo === editando.ativo) { dlgEd.close(); return; }
    const b = formEd.querySelector('[type=submit]');
    b.disabled = true;
    try {
      await API.atualizarOperador(editando.id, campos);
      dlgEd.close();
      avisar(`Operador ${editando.nome} atualizado.`, 'ok');
      await carregar();
    } catch (err) {
      msgEd.textContent = err.message;
    } finally { b.disabled = false; }
  });

  await carregar();
});
