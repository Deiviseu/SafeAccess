"""Teste de ponta a ponta do front da portaria no Chrome (headless).
Câmera falsa = vídeo com um QR Code emitido pelo banco."""
import json, os, re, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:8787'
SHOTS = '/tmp/shots'
os.makedirs(SHOTS, exist_ok=True)
SENHA = 'senha-teste-123'
erros, passos = [], []
expect.set_options(timeout=10000)


def ok(msg):
    passos.append(msg)
    print('OK ', msg, flush=True)


def log_servidor():
    return json.load(urllib.request.urlopen(BASE + '/__log'))


def abrir(p, video=None):
    args = ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    if video:
        args.append(f'--use-file-for-fake-video-capture={video}')
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True, args=args)
    ctx = b.new_context(viewport={'width': 1366, 'height': 820}, permissions=['camera'], accept_downloads=True,
                        locale='pt-BR', timezone_id='America/Sao_Paulo')
    pg = ctx.new_page()
    def console(m):
        if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text:
            erros.append(f'console.{m.type}: {m.text}')
    pg.on('console', console)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))
    return b, pg


def entrar(pg, email, senha=SENHA, destino='leitor'):
    pg.goto(BASE + '/login.html')
    pg.fill('#email', email)
    pg.fill('input[name=senha]', senha)
    pg.click('#entrar')
    if destino:
        pg.wait_for_url(f'**/{destino}.html*')


def sair(pg):
    pg.click('.user button')
    pg.wait_for_url('**/login.html*')


with sync_playwright() as p:
    # ===================== PORTEIRO + QR válido =====================
    base_qr = sum('rpc/consumir_qr_token' in l for l in log_servidor())
    b, pg = abrir(p, '/tmp/qr.y4m')
    pg.goto(BASE + '/leitor.html')
    pg.wait_for_url('**/login.html?volta=leitor')
    ok('sem login, a portaria redireciona para o login')

    entrar(pg, 'porteiro@sacchelli.com.br', 'senha-errada', destino=None)
    expect(pg.locator('#msg')).to_have_text('E-mail ou senha incorretos.')
    ok('senha errada mostra mensagem clara')

    pg.fill('input[name=senha]', SENHA)
    pg.click('#entrar')
    pg.wait_for_url('**/leitor.html')
    expect(pg.locator('.user strong')).to_have_text('Porteiro Teste')
    assert pg.locator('nav a', has_text='Operadores').count() == 0
    ok('login do porteiro; menu sem "Operadores"')

    expect(pg.locator('#resultado')).to_contain_text('ENTRADA AUTORIZADA', timeout=20000)
    expect(pg.locator('#resultado')).to_contain_text('João da Silva')
    expect(pg.locator('#resultado')).to_contain_text('Matrícula 024681')
    expect(pg.locator('#dentro')).to_contain_text('João da Silva')
    expect(pg.locator('#s-dentro')).to_have_text('1')
    pg.screenshot(path=f'{SHOTS}/01-portaria-qr.png', full_page=True)
    ok('câmera leu o QR (jsQR) → ENTRADA AUTORIZADA e João aparece em "Dentro agora"')

    pg.wait_for_timeout(5000)  # QR continua na frente da câmera
    expect(pg.locator('#resultado')).to_contain_text('ENTRADA AUTORIZADA')
    n = sum('rpc/consumir_qr_token' in l for l in log_servidor()) - base_qr
    assert n == 1, f'consumiu o QR {n} vezes'
    ok('QR parado na câmera não é consumido de novo (1 chamada ao servidor)')
    b.close()

    # Daqui em diante, câmera falsa padrão (sem QR) para os registros manuais
    b, pg = abrir(p)
    entrar(pg, 'porteiro@sacchelli.com.br')

    # ===================== Visitante novo =====================
    pg.click('nav a:has-text("Registrar Visitante")')
    pg.wait_for_url('**/visitante.html')
    pg.fill('#doc', '52998224725')
    expect(pg.locator('#doc')).to_have_value('529.982.247-25')
    expect(pg.locator('#doc-info')).to_contain_text('Primeira visita')
    pg.fill('#nome', 'Maria Souza')
    pg.select_option('#tipo', 'prestador')
    pg.fill('#empresa', 'ACME Ltda')
    pg.select_option('#setor', label='Compras')
    assert pg.locator('#setor option', has_text='Setor Antigo').count() == 0
    pg.fill('input[name=visitada]', 'Carlos')
    pg.fill('input[name=motivo]', 'Manutenção do compressor')
    pg.click('#enviar')
    expect(pg.locator('#msg')).to_contain_text('Entrada de Maria Souza registrada')
    expect(pg.locator('#msg')).to_contain_text('Cadastro criado')
    expect(pg.locator('#externos')).to_contain_text('Maria Souza')
    expect(pg.locator('#doc')).to_have_value('')
    ok('visitante novo: máscara de CPF, cadastro + entrada, lista lateral atualizada; setor inativo não aparece')

    pg.fill('#doc', '529.982.247-25')
    expect(pg.locator('#doc-info')).to_contain_text('já está dentro')
    expect(pg.locator('#nome')).to_have_value('Maria Souza')
    expect(pg.locator('#enviar')).to_be_disabled()
    pg.screenshot(path=f'{SHOTS}/02-visitante-ja-dentro.png', full_page=True)
    ok('mesmo CPF de novo: cadastro encontrado, avisa que já está dentro e bloqueia o envio')

    pg.click('#limpar')
    pg.fill('#doc', '111.111.111-11')
    expect(pg.locator('#doc-info')).to_have_text('CPF inválido. Confira os números.')
    expect(pg.locator('#nome')).to_have_value('')
    pg.fill('#nome', 'Fulano de Tal')
    pg.click('#enviar')
    expect(pg.locator('#msg')).to_have_text('Informe um CPF válido.')
    ok('CPF inválido é barrado antes de ir ao servidor')

    # ===================== Portaria: saída manual e nova entrada =====================
    pg.goto(BASE + '/leitor.html')
    pg.fill('#busca', 'maria')
    expect(pg.locator('#resultados')).to_contain_text('Dentro desde')
    expect(pg.locator('#resultados')).to_contain_text('Doc. •••4725')
    assert '529982' not in pg.content() and '52998224725' not in pg.content()
    btn = pg.locator("#resultados li", has_text="Maria Souza").locator("button")
    btn.click()
    expect(btn).to_have_text('Confirmar saída?')
    btn.click()
    expect(pg.locator('#resultado')).to_contain_text('SAÍDA REGISTRADA')
    expect(pg.locator('#resultado')).to_contain_text('Maria Souza')
    ok('busca manual mascara o documento; saída exige dois cliques')

    pg.click('#resultados a:has-text("Registrar entrada")')
    pg.wait_for_url('**/visitante.html?pessoa=*')
    expect(pg.locator('#doc-info')).to_contain_text('Cadastro encontrado')
    expect(pg.locator('#doc')).to_have_value('•••4725')
    expect(pg.locator('#nome')).to_have_value('Maria Souza')
    pg.fill('input[name=motivo]', 'Retorno da manutenção')
    pg.click('#enviar')
    expect(pg.locator('#msg')).to_contain_text('Entrada de Maria Souza registrada')
    ok('visitante conhecido: entra a partir da busca, sem redigitar o documento')

    pg.goto(BASE + '/leitor.html')
    linha = pg.locator('#dentro tr', has_text='João da Silva')
    linha.locator('button').click()
    linha.locator('button').click()
    expect(pg.locator('#resultado')).to_contain_text('SAÍDA REGISTRADA')
    expect(pg.locator('#dentro')).not_to_contain_text('João da Silva')
    expect(pg.locator('#dentro-total')).to_have_text('1')
    pg.screenshot(path=f'{SHOTS}/03-portaria-dentro.png', full_page=True)
    ok('saída pela lista "Dentro agora"; contadores atualizados')

    # ===================== Histórico =====================
    pg.click('nav a:has-text("Histórico")')
    pg.wait_for_url('**/logs.html')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–3 de 3')
    expect(pg.locator('#tbody')).to_contain_text('QR Code')
    expect(pg.locator('#s-entradas')).to_have_text('3')
    expect(pg.locator('#s-saidas')).to_have_text('2')
    pg.select_option('#situacao', 'dentro')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–1 de 1')
    pg.select_option('#situacao', '')
    pg.fill('#q', 'acme')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–2 de 2')
    pg.fill('#q', 'a.b,(c)%')
    expect(pg.locator('#info')).to_have_text('Nenhum registro')
    pg.fill('#q', '024681')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–1 de 1')
    pg.fill('#q', '')
    pg.select_option('#tipo', 'funcionario')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–1 de 1')
    pg.select_option('#tipo', '')
    expect(pg.locator('#info')).to_have_text('Exibindo 1–3 de 3')
    with pg.expect_download() as d:
        pg.click('#csv')
    csv = open(d.value.path(), encoding='utf-8-sig', newline='').read()
    assert csv.startswith('"Entrada";"Saída";"Nome"'), csv[:80]
    assert csv.count('\r\n') == 3 and 'Maria Souza' in csv and 'Porteiro Teste' in csv
    assert '52998224725' not in csv and '4725' not in csv and '12345678909' not in csv
    pg.screenshot(path=f'{SHOTS}/04-historico.png', full_page=True)
    ok('histórico: filtros no servidor (situação, busca, matrícula, tipo), caracteres especiais e CSV sem documento')

    pg.goto(BASE + '/usuarios.html')
    expect(pg.locator('main')).to_contain_text('Acesso restrito')
    ok('porteiro não acessa a tela de operadores')

    sair(pg)
    expect(pg.locator('#msg')).to_have_text('Você saiu do sistema.')
    pg.goto(BASE + '/logs.html')
    pg.wait_for_url('**/login.html?volta=logs')
    ok('sair encerra a sessão')

    # ===================== ADMIN =====================
    entrar(pg, 'admin@sacchelli.com.br', destino='leitor')
    pg.click('nav a:has-text("Operadores")')
    pg.wait_for_url('**/usuarios.html')
    expect(pg.locator('#tbody tr')).to_have_count(4)
    expect(pg.locator('#tbody tr', has_text='(você)').locator('button')).to_be_disabled()
    expect(pg.locator('#tbody')).to_contain_text('Nunca entrou')
    ok('admin vê operadores com e-mail e último acesso; não edita a si mesmo')

    def criar(nome, email, senha='senha-forte-2026', perfil='porteiro'):
        pg.click('#novo')
        f = pg.locator('#form-novo')
        f.locator('input[name=nome]').fill(nome)
        f.locator('input[name=email]').fill(email)
        f.locator('select[name=perfil]').select_option(perfil)
        f.locator('input[name=senha]').fill(senha)
        f.locator('button[type=submit]').click()

    criar('Paula Nogueira', 'paula@sacchelli.com.br')
    expect(pg.locator('#aviso')).to_contain_text('Operador Paula Nogueira criado')
    expect(pg.locator('#tbody tr')).to_have_count(5)
    ok('novo operador criado pela Edge Function (Deno)')

    criar('Paula Repetida', 'PAULA@sacchelli.com.br')
    expect(pg.locator('#msg-novo')).to_have_text('Já existe um login com esse e-mail.')
    pg.locator('#form-novo input[name=email]').fill('999@funcionarios.sacchelli.com.br')
    pg.locator('#form-novo button[type=submit]').click()
    expect(pg.locator('#msg-novo')).to_have_text('Esse domínio é reservado ao app dos funcionários.')
    pg.locator('#form-novo input[name=email]').fill('curta@sacchelli.com.br')
    pg.locator('#form-novo input[name=senha]').fill('123')
    pg.locator('#form-novo button[type=submit]').click()
    expect(pg.locator('#msg-novo')).to_contain_text('pelo menos 10 caracteres')
    pg.click('#dlg-novo [data-fechar]')
    ok('e-mail repetido, domínio de funcionário e senha curta são recusados')

    pg.locator('#tbody tr', has_text='Porteiro Teste').locator('button').click()
    pg.uncheck('#ed-ativo')
    pg.click('#form-editar button[type=submit]')
    expect(pg.locator('#tbody tr', has_text='Porteiro Teste')).to_contain_text('Inativo')
    pg.screenshot(path=f'{SHOTS}/05-operadores.png', full_page=True)
    ok('admin desativa operador')
    sair(pg)

    entrar(pg, 'paula@sacchelli.com.br', 'senha-forte-2026')
    expect(pg.locator('.user strong')).to_have_text('Paula Nogueira')
    ok('operador recém-criado consegue entrar')
    sair(pg)

    entrar(pg, 'porteiro@sacchelli.com.br', destino=None)
    expect(pg.locator('#msg')).to_contain_text('não tem acesso ao sistema da portaria')
    entrar(pg, '024681@funcionarios.sacchelli.com.br', destino=None)
    expect(pg.locator('#msg')).to_contain_text('não tem acesso ao sistema da portaria')
    ok('operador desativado e login de funcionário (app) são barrados no web')
    pg.goto(BASE + '/login.html')
    pg.screenshot(path=f'{SHOTS}/00-login.png')
    b.close()

    # ===================== QR que não é do SafeAccess =====================
    b, pg = abrir(p, '/tmp/qr-estranho.y4m')
    entrar(pg, 'paula@sacchelli.com.br', 'senha-forte-2026')
    expect(pg.locator('#resultado')).to_contain_text('QR CODE NÃO RECONHECIDO', timeout=20000)
    ok('QR de outro sistema é recusado sem consultar o servidor')
    b.close()

    # ===================== QR já usado =====================
    b, pg = abrir(p, '/tmp/qr.y4m')
    entrar(pg, 'paula@sacchelli.com.br', 'senha-forte-2026')
    expect(pg.locator('#resultado')).to_contain_text('ACESSO NEGADO', timeout=20000)
    expect(pg.locator('#resultado')).to_contain_text('já foi utilizado')
    pg.screenshot(path=f'{SHOTS}/06-qr-negado.png', full_page=True)
    ok('QR reaproveitado (print/foto) é negado pelo banco')
    b.close()

print(f'\n{len(passos)} verificações passaram.')
if erros:
    print('\nERROS NO CONSOLE DO NAVEGADOR:')
    for e in erros:
        print(' -', e)
    sys.exit(1)
print('Nenhum erro no console (inclui violações de CSP).')
