/* Funções compartilhadas por todas as telas: elementos, formatação,
 * menu lateral, controle de sessão, paginação, CSV e validação de CPF. */

const $ = (s, r = document) => r.querySelector(s);

function el(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

// Monta filhos ignorando valores vazios (evita aparecer "undefined" na tela)
function filhos(pai, ...itens) {
  pai.replaceChildren(...itens.filter(i => i != null && i !== false && i !== ''));
  return pai;
}

const td = (...kids) => filhos(el('td'), ...kids);
const badge = (tipo, txt) => el('span', 'badge ' + tipo, txt);

const TIPOS_PESSOA = { funcionario: 'Funcionário', visitante: 'Visitante', prestador: 'Prestador de serviço', fornecedor: 'Fornecedor', outro: 'Outro' };
const PERFIS = { admin: 'Administrador', rh: 'RH', porteiro: 'Porteiro' };
const METODOS = { qr: 'QR Code', manual: 'Manual' };

const fmtDataHora = d => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtHora = d => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function horasDesde(d) { return (Date.now() - new Date(d).getTime()) / 3600000; }

function tempoDesde(d) {
  const min = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60000));
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h${String(min % 60).padStart(2, '0')}`;
  const dias = Math.floor(h / 24);
  return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

const juntar = (...partes) => partes.filter(Boolean).join(' · ');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const pausa = ms => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------------------------------
// CPF: máscara e dígitos verificadores (o banco valida de novo)
// ---------------------------------------------------------------------
const somenteDigitos = v => String(v || '').replace(/\D/g, '');

function cpfValido(v) {
  const c = somenteDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = n => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(c[i]) * (n + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

function mascararCpf(v) {
  const d = somenteDigitos(v).slice(0, 11);
  let s = d.slice(0, 3);
  if (d.length > 3) s += '.' + d.slice(3, 6);
  if (d.length > 6) s += '.' + d.slice(6, 9);
  if (d.length > 9) s += '-' + d.slice(9);
  return s;
}

// ---------------------------------------------------------------------
// Estrutura da página, sessão e avisos
// ---------------------------------------------------------------------
const PAGINAS = {
  leitor: { titulo: 'Portaria', desc: 'Leitura do QR Code, registro manual e pessoas dentro da empresa.', href: 'leitor.html' },
  visitante: { titulo: 'Registrar Visitante', desc: 'Cadastre visitantes, prestadores e fornecedores e registre a entrada.', href: 'visitante.html' },
  logs: { titulo: 'Histórico de Acessos', desc: 'Consulte, filtre e exporte as movimentações da portaria.', href: 'logs.html' },
  funcionarios: { titulo: 'Funcionários', desc: 'Cadastre funcionários e libere o acesso pelo app do celular.', href: 'funcionarios.html', perfis: ['admin', 'rh'] },
  usuarios: { titulo: 'Operadores', desc: 'Gerencie quem acessa o sistema e com qual perfil.', href: 'usuarios.html', perfis: ['admin'] },
};

function marca() {
  const brand = el('div', 'brand');
  brand.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="#f5b82e" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>';
  const nome = el('div', null, 'SafeAccess');
  nome.append(el('small', null, 'Sacchelli'));
  brand.append(nome);
  return brand;
}

let saindoPorClique = false;

function irParaLogin(mensagem, volta) {
  const p = new URLSearchParams();
  if (mensagem) p.set('msg', mensagem);
  if (volta) p.set('volta', volta);
  location.replace('login.html' + (p.toString() ? '?' + p : ''));
}

function montarShell(pagina, op) {
  const nav = el('nav');
  nav.setAttribute('aria-label', 'Principal');
  for (const [chave, cfg] of Object.entries(PAGINAS)) {
    if (cfg.perfis && !cfg.perfis.includes(op.perfil)) continue;
    const a = el('a', null, cfg.titulo);
    a.href = cfg.href;
    if (chave === pagina) a.setAttribute('aria-current', 'page');
    nav.append(a);
  }
  $('#side').append(marca(), nav, el('div', 'foot', 'Sistema protegido'));

  const titulo = el('div');
  titulo.append(el('h1', null, PAGINAS[pagina].titulo), el('p', null, PAGINAS[pagina].desc));
  const quem = el('div');
  quem.append(el('strong', null, op.nome), el('br'), el('small', null, PERFIS[op.perfil] || op.perfil));
  const sair = el('button', 'btn btn-sm', 'Sair');
  sair.type = 'button';
  sair.addEventListener('click', async () => {
    sair.disabled = true;
    saindoPorClique = true;
    await API.sair();
    irParaLogin('Você saiu do sistema.');
  });
  const user = el('div', 'user');
  user.append(quem, sair);
  $('#top').append(titulo, user);

  const aviso = el('div', 'aviso');
  aviso.id = 'aviso';
  aviso.setAttribute('role', 'status');
  aviso.hidden = true;
  $('#main').prepend(aviso);

  document.title = PAGINAS[pagina].titulo + ' · SafeAccess Sacchelli';
}

let avisoTimer;
function avisar(msg, tipo = 'erro') {
  const a = $('#aviso');
  if (!a) { alert(msg); return; }
  a.textContent = msg;
  a.className = 'aviso ' + tipo;
  a.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { a.hidden = true; }, tipo === 'erro' ? 12000 : 6000);
}

function tratarErro(e) {
  if (e && e.codigo === 'sessao') { irParaLogin(e.message, document.body.dataset.page); return; }
  avisar((e && e.message) || 'Erro inesperado.');
}

function telaSemConfiguracao() {
  const c = el('div', 'card');
  c.append(el('h2', null, 'Sistema não configurado'),
    el('p', null, 'Preencha a URL e a chave publicável do Supabase no arquivo js/config.js.'));
  document.body.replaceChildren(c);
  document.body.className = 'pagina-login';
}

// Toda página protegida começa por aqui
async function iniciarPagina(pagina, init) {
  if (!API.configurado) { telaSemConfiguracao(); return; }
  const main = $('#main');
  try {
    if (!(await API.sessao())) { irParaLogin(null, pagina); return; }
    const op = await API.operadorAtual();
    if (!op) {
      await API.sair();
      irParaLogin('Seu usuário não tem acesso ao sistema da portaria.', pagina);
      return;
    }
    montarShell(pagina, op);
    API.aoSair(() => { if (!saindoPorClique) irParaLogin('Sua sessão foi encerrada.', pagina); });
    const cfg = PAGINAS[pagina];
    if (cfg.perfis && !cfg.perfis.includes(op.perfil)) {
      const c = el('section', 'card');
      c.append(el('h2', null, 'Acesso restrito'), el('p', 'muted', 'Esta tela é exclusiva para administradores.'));
      main.replaceChildren(c);
      main.hidden = false;
      return;
    }
    main.hidden = false;
    await init(op);
  } catch (e) {
    main.hidden = false;
    tratarErro(e);
  }
}

// ---------------------------------------------------------------------
// Botões com ação assíncrona e confirmação em dois cliques
// ---------------------------------------------------------------------
function botaoAcao(rotulo, acao, cls = 'btn btn-sm btn-primary') {
  const b = el('button', cls, rotulo);
  b.type = 'button';
  b.addEventListener('click', async () => {
    b.disabled = true;
    try { await acao(); } catch (e) { tratarErro(e); } finally { b.disabled = false; }
  });
  return b;
}

function botaoConfirmar(rotulo, rotuloConfirma, acao, cls = 'btn btn-sm') {
  const b = el('button', cls, rotulo);
  b.type = 'button';
  let armado = false, timer;
  const desarmar = () => { armado = false; b.textContent = rotulo; b.classList.remove('btn-alerta'); };
  b.addEventListener('click', async () => {
    if (!armado) {
      armado = true;
      b.textContent = rotuloConfirma;
      b.classList.add('btn-alerta');
      timer = setTimeout(desarmar, 4000);
      return;
    }
    clearTimeout(timer);
    b.disabled = true;
    try { await acao(); } catch (e) { tratarErro(e); } finally { b.disabled = false; desarmar(); }
  });
  return b;
}

// ---------------------------------------------------------------------
// Tabelas: linha vazia e paginação
// ---------------------------------------------------------------------
function linhaVazia(colunas, texto = 'Nenhum registro encontrado.') {
  const tr = el('tr'), c = el('td', 'muted', texto);
  c.colSpan = colunas;
  tr.append(c);
  return tr;
}

function criarPaginador({ info, prev, next, tamanho, aoMudar }) {
  let pagina = 1, total = 0;
  const paginas = () => Math.max(1, Math.ceil(total / tamanho));
  function desenhar() {
    const ini = total ? (pagina - 1) * tamanho + 1 : 0;
    const fim = Math.min(pagina * tamanho, total);
    info.textContent = total ? `Exibindo ${ini}–${fim} de ${total}` : 'Nenhum registro';
    prev.disabled = pagina <= 1;
    next.disabled = pagina >= paginas();
  }
  prev.addEventListener('click', () => { if (pagina > 1) { pagina--; aoMudar(pagina); } });
  next.addEventListener('click', () => { if (pagina < paginas()) { pagina++; aoMudar(pagina); } });
  return {
    get pagina() { return pagina; },
    reiniciar() { pagina = 1; },
    definirTotal(t) { total = t; if (pagina > paginas()) pagina = paginas(); desenhar(); },
  };
}

// ---------------------------------------------------------------------
// CSV (abre direto no Excel em português: ";" e BOM UTF-8)
// ---------------------------------------------------------------------
function baixarCsv(nomeArquivo, linhas) {
  const esc = v => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // impede fórmula no Excel
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const conteudo = '﻿' + linhas.map(l => l.map(esc).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = el('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function hojeIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
