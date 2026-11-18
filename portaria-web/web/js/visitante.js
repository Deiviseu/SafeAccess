/* Cadastro de visitante/prestador/fornecedor + registro da entrada. */
iniciarPagina('visitante', async () => {
  const form = $('#form'), msg = $('#msg'), info = $('#doc-info');
  const docTipo = $('#doc-tipo'), doc = $('#doc'), nome = $('#nome'), tipo = $('#tipo'), empresa = $('#empresa');
  const enviar = $('#enviar');

  // Pessoa já cadastrada. origem: 'documento' (digitou o doc) ou 'link' (veio da busca da portaria)
  let existente = null, origem = null, consultaSeq = 0;

  const TEXTO_INICIAL = info.textContent;
  function mostrarInfo(texto, classe = 'muted') { info.textContent = texto; info.className = 'full info-doc ' + classe; }

  function liberarCampos() {
    if (existente) { nome.value = ''; empresa.value = ''; } // dados preenchidos automaticamente
    existente = null; origem = null;
    for (const c of [nome, empresa]) c.readOnly = false;
    tipo.disabled = false;
    docTipo.disabled = false; doc.readOnly = false;
    enviar.disabled = false;
  }

  function aplicarExistente(p, via) {
    existente = p; origem = via;
    nome.value = p.nome; nome.readOnly = true;
    if (p.tipo !== 'funcionario') tipo.value = p.tipo;
    tipo.disabled = true;
    empresa.value = p.empresa || '';
    empresa.readOnly = via === 'link' || p.tipo === 'funcionario'; // pelo documento, a empresa pode ser atualizada
    if (!p.ativo) {
      mostrarInfo('Cadastro inativo: entrada não permitida. Procure o RH.', 'erro');
      enviar.disabled = true;
    } else if (p.aberta) {
      mostrarInfo(`${p.nome} já está dentro desde ${fmtDataHora(p.aberta.entrada_em)}. Registre a saída na tela Portaria.`, 'alerta');
      enviar.disabled = true;
    } else {
      mostrarInfo(`Cadastro encontrado: ${juntar(p.nome, TIPOS_PESSOA[p.tipo], p.empresa)}. Confira e informe o destino.`, 'ok');
      enviar.disabled = false;
    }
  }

  function limparTudo() {
    form.reset();
    liberarCampos();
    doc.removeAttribute('aria-invalid');
    mostrarInfo(TEXTO_INICIAL);
    msg.textContent = '';
    msg.className = 'msg';
    if (new URLSearchParams(location.search).has('pessoa')) history.replaceState(null, '', 'visitante.html');
    doc.focus();
  }

  // ---------- documento: máscara, validação e busca do cadastro ----------
  const ehCpf = () => docTipo.value === 'cpf';

  function documentoOk() {
    const v = doc.value.trim();
    if (ehCpf()) return cpfValido(v);
    return v.replace(/[^0-9A-Za-z]/g, '').length >= 4;
  }

  async function consultarDocumento() {
    if (origem === 'link') return;
    const atual = ++consultaSeq;
    if (existente) liberarCampos();
    if (!doc.value.trim()) { mostrarInfo(TEXTO_INICIAL); return; }
    if (!documentoOk()) {
      doc.setAttribute('aria-invalid', 'true');
      const completo = !ehCpf() || somenteDigitos(doc.value).length === 11;
      mostrarInfo(completo ? (ehCpf() ? 'CPF inválido. Confira os números.' : 'Documento muito curto.') : 'Continue digitando o CPF…', completo ? 'erro' : 'muted');
      return;
    }
    doc.removeAttribute('aria-invalid');
    mostrarInfo('Procurando cadastro…');
    try {
      const p = await API.pessoaPorDocumento(docTipo.value, doc.value);
      if (atual !== consultaSeq) return;
      if (p) aplicarExistente(p, 'documento');
      else mostrarInfo('Primeira visita: preencha os dados para criar o cadastro.', 'muted');
    } catch (e) { tratarErro(e); }
  }

  doc.addEventListener('input', () => {
    if (msg.classList.contains('ok')) { msg.textContent = ''; msg.className = 'msg'; } // começou outro registro
    if (ehCpf()) doc.value = mascararCpf(doc.value);
    if (ehCpf() && somenteDigitos(doc.value).length === 11) consultarDocumento();
    else if (existente && origem === 'documento') { liberarCampos(); mostrarInfo(TEXTO_INICIAL); }
  });
  doc.addEventListener('blur', consultarDocumento);
  docTipo.addEventListener('change', () => {
    doc.inputMode = ehCpf() ? 'numeric' : 'text';
    doc.value = ehCpf() ? mascararCpf(doc.value) : doc.value;
    consultarDocumento();
  });

  // ---------- envio ----------
  form.addEventListener('submit', async e => {
    e.preventDefault();
    msg.className = 'msg';
    const f = Object.fromEntries(new FormData(form));
    const extra = { setorId: f.setorId, visitada: f.visitada?.trim(), motivo: f.motivo?.trim(), observacao: f.observacao?.trim() };

    if (!existente) {
      if (!documentoOk()) { msg.textContent = ehCpf() ? 'Informe um CPF válido.' : 'Informe o número do documento.'; doc.focus(); return; }
      if ((f.nome || '').trim().length < 3) { msg.textContent = 'Informe o nome completo.'; nome.focus(); return; }
    }

    enviar.disabled = true;
    try {
      let r;
      if (existente && (origem === 'link' || existente.tipo === 'funcionario')) {
        r = await API.registrarEntrada(existente.id, extra);
      } else {
        r = await API.registrarEntradaExterno({
          tipo: tipo.value, nome: f.nome, documentoTipo: docTipo.value, documento: doc.value,
          empresa: empresa.value.trim(), ...extra,
        });
      }
      const texto = `Entrada de ${r.nome} registrada às ${fmtHora(r.em)}.` + (r.pessoa_nova ? ' Cadastro criado.' : '');
      limparTudo();
      msg.textContent = texto;
      msg.className = 'msg ok';
      await carregarExternos();
    } catch (err) {
      msg.textContent = err.message;
      if (err.codigo === 'sessao') tratarErro(err);
    } finally {
      if (!existente || (existente.ativo && !existente.aberta)) enviar.disabled = false;
    }
  });

  $('#limpar').addEventListener('click', limparTudo);

  // ---------- lista lateral ----------
  async function carregarExternos() {
    const lista = (await API.dentroAgora()).filter(m => m.tipo !== 'funcionario').reverse();
    $('#externos-total').textContent = lista.length;
    $('#externos').replaceChildren(...(lista.length ? lista.map(m => {
      const li = el('li'), t = el('div');
      filhos(t, el('strong', null, m.nome), el('div', 'muted', juntar(m.empresa, m.setor_destino || m.pessoa_visitada, 'desde ' + fmtHora(m.entrada_em))));
      li.append(t, botaoConfirmar('Saída', 'Confirmar?', async () => {
        const r = await API.registrarSaida(m.movimentacao_id);
        avisar(`Saída de ${r.nome} registrada às ${fmtHora(r.em)}.`, 'ok');
        await carregarExternos();
      }));
      return li;
    }) : [el('li', 'muted', 'Nenhum visitante dentro no momento.')]));
  }

  // ---------- início ----------
  const setores = await API.setores();
  for (const s of setores) $('#setor').append(new Option(s.nome, s.id));

  const pessoaId = new URLSearchParams(location.search).get('pessoa');
  if (pessoaId && /^[0-9a-f-]{36}$/i.test(pessoaId)) {
    const p = await API.pessoa(pessoaId);
    if (p) {
      docTipo.value = p.documento_tipo || 'outro';
      docTipo.disabled = true;
      doc.value = p.documento_final ? '•••' + p.documento_final : '';
      doc.readOnly = true;
      aplicarExistente(p, 'link');
    }
  }
  await carregarExternos();
  (existente ? $('#setor') : doc).focus();
});
