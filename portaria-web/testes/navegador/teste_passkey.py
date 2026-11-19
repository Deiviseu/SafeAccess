"""Ciclo completo: RH libera → convite → cadastro do celular (Face ID) → QR → portaria lê → app mostra.
Usa o autenticador virtual do Chrome no lugar da digital/rosto."""
import json, os, re, subprocess, sys, urllib.request
from playwright.sync_api import sync_playwright, expect

APP = 'http://localhost:4174'
SB = 'http://127.0.0.1:8787'
SHOTS = '/tmp/shots'
os.makedirs(SHOTS, exist_ok=True)
erros, passos = [], []
expect.set_options(timeout=12000)
PORTEIRO = '00000000-0000-0000-0000-00000000000b'


def ok(msg):
    passos.append(msg); print('OK ', msg, flush=True)


def sql(q):
    return subprocess.run(['psql', '-h', '/tmp', '-p', '5433', '-U', 'postgres', '-d', 'safeaccess', '-qAt', '-c', q],
                          capture_output=True, text=True, check=True).stdout.strip()


def portaria_le(token):
    """O porteiro lê o QR (mesma função que a tela da portaria chama)."""
    saida = sql(f"begin; set local role authenticated; set local request.jwt.claim.sub = '{PORTEIRO}'; "
                f"select public.consumir_qr_token('{token}'); commit;")
    return json.loads([l for l in saida.splitlines() if l.startswith('{')][0])


def post(url, corpo, token=None):
    h = {'Content-Type': 'application/json'}
    if token: h['Authorization'] = 'Bearer ' + token
    return json.load(urllib.request.urlopen(urllib.request.Request(url, json.dumps(corpo).encode(), h)))


rh = post(SB + '/auth/v1/token?grant_type=password', {'email': 'rh@sacchelli.com.br', 'password': 'senha-teste-123'})['access_token']
ana = sql("insert into public.pessoas (tipo, nome, matricula, setor_id) values ('funcionario','Ana Paula Pereira','100200','10000000-0000-0000-0000-000000000001') returning id").splitlines()[0]
bruno = sql("insert into public.pessoas (tipo, nome, matricula) values ('funcionario','Bruno Lima','100300') returning id").splitlines()[0]
acesso = post(SB + '/functions/v1/rh-acesso-funcionario', {'acao': 'criar', 'pessoa_id': ana}, rh)
convite = acesso['convite']['link'].split('#')[1]
convite_bruno = post(SB + '/functions/v1/rh-acesso-funcionario', {'acao': 'criar', 'pessoa_id': bruno}, rh)['convite']['link'].split('#')[1]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', headless=True)
    ctx = b.new_context(**p.devices['Pixel 7'], locale='pt-BR', timezone_id='America/Sao_Paulo')
    pg = ctx.new_page()
    pg.on('console', lambda m: erros.append(f'console.{m.type}: {m.text}') if m.type in ('error', 'warning') and 'Failed to load resource' not in m.text else None)
    pg.on('pageerror', lambda e: erros.append(f'pageerror: {e}'))

    # "Digital/rosto" virtual do celular
    cdp = ctx.new_cdp_session(pg)
    cdp.send('WebAuthn.enable')
    autenticador = cdp.send('WebAuthn.addVirtualAuthenticator', {'options': {
        'protocol': 'ctap2', 'transport': 'internal', 'hasResidentKey': True,
        'hasUserVerification': True, 'isUserVerified': True, 'automaticPresenceSimulation': True}})['authenticatorId']

    # ---------- 1. Funcionário lê o QR do convite ----------
    pg.goto(f'{APP}/convite#{convite}')
    expect(pg.get_by_role('heading', name='Use a biometria deste celular')).to_be_visible()
    expect(pg.get_by_text('Para continuar, entre com a sua matrícula e senha.')).to_be_visible()
    assert '#' not in pg.url, pg.url
    ok('link do convite abre o app, guarda o token e tira do endereço; pede login')

    pg.get_by_role('button', name='Entrar').click()
    pg.wait_for_url(APP + '/')
    pg.get_by_label('Matrícula').fill('100200')
    pg.get_by_label('Senha', exact=True).fill(acesso['senha'])
    pg.get_by_role('button', name='Entrar').click()
    pg.wait_for_url(APP + '/trocar-senha')
    pg.get_by_label('Nova senha', exact=True).fill('Portaria2026')
    pg.get_by_label('Confirme a nova senha').fill('Portaria2026')
    pg.get_by_role('button', name='Salvar senha').click()
    pg.wait_for_url(APP + '/convite')
    ok('login → troca de senha obrigatória → volta sozinho para o convite')

    pg.get_by_role('button', name='Cadastrar com biometria').click()
    expect(pg.get_by_role('heading', name='Celular cadastrado')).to_be_visible()
    pg.screenshot(path=f'{SHOTS}/30-celular-cadastrado.png')
    assert sql(f"select count(*) from public.credenciais_passkey where pessoa_id = '{ana}' and revogada_em is null") == '1'
    assert sql(f"select count(*) from public.convites_passkey where pessoa_id = '{ana}' and usado_em is not null") == '1'
    assert int(sql(f"select length(public_key) from public.credenciais_passkey where pessoa_id = '{ana}'")) >= 40  # COSE (Ed25519 = 42 bytes, ES256 ≈ 77)
    ok('celular cadastrado: chave pública gravada e convite marcado como usado')

    pg.get_by_role('button', name='Ir para o início').click()
    pg.wait_for_url(APP + '/inicio')
    expect(pg.get_by_role('button', name='Solicitar acesso')).to_be_visible()

    # ---------- 2. Gerar QR e passar na portaria (entrada) ----------
    def gerar_qr():
        pg.get_by_role('button', name='Solicitar acesso').click()
        pg.wait_for_url(APP + '/biometria')
        with pg.expect_response(lambda r: 'app-passkey' in r.url and r.request.method == 'POST'
                                and 'auth-verificar' in (r.request.post_data or '')) as resp:
            pg.get_by_role('button', name='Autenticar').click()
        pg.wait_for_url(APP + '/qr')
        dados = resp.value.json()
        assert re.fullmatch(r'[0-9a-f]{64}', dados['token']) and dados['validade_segundos'] == 60, dados
        return dados['token']

    token1 = gerar_qr()
    expect(pg.get_by_text(re.compile(r'Válido por 00:(5\d|60)'))).to_be_visible()
    expect(pg.locator('svg:has(title)')).to_have_count(1)
    pg.screenshot(path=f'{SHOTS}/31-qr-real.png')
    ok('Face ID confirmado pelo servidor → QR real de 60 s na tela')

    r = portaria_le(token1)
    assert r['status'] == 'autorizado' and r['tipo'] == 'entrada' and r['pessoa']['nome'] == 'Ana Paula Pereira', r
    pg.wait_for_url(APP + '/acesso/autorizado', timeout=8000)
    expect(pg.get_by_role('heading', name='Entrada autorizada')).to_be_visible()
    expect(pg.get_by_text('Portaria · leitura do QR Code')).to_be_visible()
    pg.screenshot(path=f'{SHOTS}/32-entrada-autorizada.png')
    ok('portaria lê o QR → app mostra "Entrada autorizada" sozinho, com a hora real')

    assert portaria_le(token1)['status'] == 'ja_usado'
    ok('o mesmo QR (print/foto) é recusado na segunda leitura')

    # ---------- 3. Saída ----------
    pg.get_by_role('button', name='Voltar ao início').click()
    expect(pg.locator('ul').first).to_contain_text('Entrada registrada')
    token2 = gerar_qr()
    assert portaria_le(token2)['tipo'] == 'saida'
    expect(pg.get_by_role('heading', name='Saída registrada')).to_be_visible(timeout=8000)
    contador, uso = sql(f"select contador, ultimo_uso_em is not null from public.credenciais_passkey where pessoa_id = '{ana}'").split('|')
    assert int(contador) >= 2 and uso == 't', (contador, uso)
    ok('segunda leitura registra a saída; contador anti-clonagem e último uso atualizados')

    # ---------- 4. Biometria recusada ----------
    pg.get_by_role('button', name='Voltar ao início').click()
    cdp.send('WebAuthn.setUserVerified', {'authenticatorId': autenticador, 'isUserVerified': False})
    pg.get_by_role('button', name='Solicitar acesso').click()
    pg.get_by_role('button', name='Autenticar').click()
    pg.wait_for_url(APP + '/falha-autenticacao')
    expect(pg.get_by_role('heading', name='Não foi possível reconhecer')).to_be_visible()
    cdp.send('WebAuthn.setUserVerified', {'authenticatorId': autenticador, 'isUserVerified': True})
    ok('biometria não confirmada → tela "Não foi possível reconhecer", sem QR')

    # ---------- 5. Convite reaproveitado e convite de outra pessoa ----------
    pg.goto(f'{APP}/convite#{convite}')
    pg.get_by_role('button', name='Cadastrar com biometria').click()
    expect(pg.get_by_role('alert')).to_contain_text('Convite inválido, já usado ou vencido')
    pg.goto(f'{APP}/convite#{convite_bruno}')
    pg.get_by_role('button', name='Cadastrar com biometria').click()
    expect(pg.get_by_role('alert')).to_contain_text('Convite inválido')
    assert sql(f"select count(*) from public.credenciais_passkey where pessoa_id = '{bruno}'") == '0'
    ok('convite já usado e convite de OUTRO funcionário são recusados')

    # ---------- 6. Remover o celular pelo Perfil ----------
    pg.goto(APP + '/perfil')
    expect(pg.get_by_role('heading', name='Celulares com biometria')).to_be_visible()
    lista = pg.locator('li', has=pg.get_by_role('button', name=re.compile('^Remover')))
    expect(lista).to_have_count(1)
    expect(lista).to_contain_text('último uso')
    pg.screenshot(path=f'{SHOTS}/33-perfil-celulares.png')
    lista.get_by_role('button').click()
    pg.get_by_role('dialog').get_by_role('button', name='Remover').click()
    expect(pg.get_by_text('Nenhum celular cadastrado. Peça o convite ao RH.')).to_be_visible()
    assert sql(f"select revogada_em is not null from public.credenciais_passkey where pessoa_id = '{ana}'") == 't'
    ok('funcionário remove o celular no Perfil (revogação gravada pelo banco)')

    pg.get_by_role('link', name='Início').click()
    expect(pg.get_by_text('Antes, cadastre este celular')).to_be_visible()
    pg.goto(APP + '/biometria')
    pg.get_by_role('button', name='Autenticar').click()
    expect(pg.get_by_role('status').filter(has_text='Nenhum celular cadastrado')).to_be_visible()
    ok('sem celular: Início orienta pedir o convite e a biometria explica o motivo')
    b.close()

print(f'\n{len(passos)} verificações passaram.')
if erros:
    print('\nERROS NO CONSOLE:'); [print(' -', e) for e in erros]; sys.exit(1)
print('Nenhum erro no console.')
