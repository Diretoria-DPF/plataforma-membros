/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * sessionCookie (SEC-08, ADR 0011): leitura e montagem do cookie de sessão, regra de origem do mesmo
 * site e troca do marcador pelo token. Quem usa: `npm test -- -i sessionCookie`.
 */
import {
  COOKIE_NAME, COOKIE_MARKER, parseCookies, readSessionCookie, originInSite, cookieAllowedForOrigin,
  buildSetCookie, buildClearCookie, isMarker, resolveArgs, splitLoginResult, SESSION_CREATING_ACTIONS, SESSION_ENDING_ACTIONS,
} from '../src/sessionCookie.js';

const TOKEN = 'a'.repeat(64);
const requestWith = (cookie) => ({ headers: { get: (name) => (name === 'Cookie' ? cookie : null) } });

describe('leitura do cookie', () => {
  test('parseCookies lê pares, ignora lixo e a primeira repetição vale', () => {
    expect(parseCookies('a=1; b=dois; =x; solto')).toEqual({ a: '1', b: 'dois' });
    expect(parseCookies('a=1; a=2')).toEqual({ a: '1' });
    expect(parseCookies('')).toEqual({});
    expect(parseCookies(null)).toEqual({});
  });

  test('readSessionCookie devolve só token com a forma certa', () => {
    expect(readSessionCookie(requestWith(`x=1; ${COOKIE_NAME}=${TOKEN}`))).toBe(TOKEN);
    expect(readSessionCookie(requestWith(`${COOKIE_NAME}=curto`))).toBe('');
    expect(readSessionCookie(requestWith(`${COOKIE_NAME}=${'<script>'.repeat(4)}`))).toBe('');
    expect(readSessionCookie(requestWith(null))).toBe('');
  });
});

describe('origem do mesmo site', () => {
  test('aceita o domínio e subdomínios em https; recusa outros sites, http e parecidos', () => {
    expect(originInSite('https://laift.com.br', 'laift.com.br')).toBe(true);
    expect(originInSite('https://staging.laift.com.br', 'laift.com.br')).toBe(true);
    expect(originInSite('https://diretoria-dpf.github.io', 'laift.com.br')).toBe(false);
    expect(originInSite('https://evil-laift.com.br', 'laift.com.br')).toBe(false);
    expect(originInSite('https://laift.com.br.evil.com', 'laift.com.br')).toBe(false);
    expect(originInSite('http://laift.com.br', 'laift.com.br')).toBe(false);
    expect(originInSite('https://laift.com.br/caminho', 'laift.com.br')).toBe(false);
    expect(originInSite('https://laift.com.br', '')).toBe(false);
    expect(originInSite(undefined, 'laift.com.br')).toBe(false);
  });

  test('cookieAllowedForOrigin exige estar na lista permitida E no site', () => {
    const allowed = ['https://laift.com.br', 'https://diretoria-dpf.github.io'];
    expect(cookieAllowedForOrigin('https://laift.com.br', allowed, 'laift.com.br')).toBe(true);
    expect(cookieAllowedForOrigin('https://diretoria-dpf.github.io', allowed, 'laift.com.br')).toBe(false);
    expect(cookieAllowedForOrigin('https://staging.laift.com.br', allowed, 'laift.com.br')).toBe(false);
  });
});

describe('montagem do cookie', () => {
  test('Set-Cookie é __Host-, HttpOnly, Secure, SameSite=Lax, Path=/ e sem Domain', () => {
    const header = buildSetCookie(TOKEN);
    expect(header.startsWith(`__Host-pm_session=${TOKEN};`)).toBe(true);
    ['Path=/', 'Secure', 'HttpOnly', 'SameSite=Lax', 'Max-Age=86400'].forEach((part) => expect(header).toContain(part));
    expect(header).not.toMatch(/Domain=/i);
  });

  test('recusa token com forma estranha (injeção de atributo)', () => {
    expect(() => buildSetCookie('abc; Domain=.evil.com')).toThrow();
    expect(() => buildSetCookie('')).toThrow();
  });

  test('o cookie de saída expira na hora', () => {
    const header = buildClearCookie();
    expect(header).toContain('Max-Age=0');
    expect(header.startsWith(`${COOKIE_NAME}=;`)).toBe(true);
  });
});

describe('marcador e resposta de login', () => {
  test('resolveArgs troca o marcador pelo token do cookie sem alterar a lista original', () => {
    const args = [COOKIE_MARKER, { a: 1 }];
    expect(resolveArgs(args, TOKEN)).toEqual([TOKEN, { a: 1 }]);
    expect(args[0]).toBe(COOKIE_MARKER);
    expect(resolveArgs(args, '')).toEqual([COOKIE_MARKER, { a: 1 }]);
    expect(resolveArgs([TOKEN, 1], 'outro')).toEqual([TOKEN, 1]);
    expect(resolveArgs('nao-lista', TOKEN)).toBe('nao-lista');
    expect(isMarker('cookie')).toBe(true);
    expect(isMarker(TOKEN)).toBe(false);
  });

  test('splitLoginResult tira o token do corpo e o devolve à parte', () => {
    const out = splitLoginResult({ success: true, sessionToken: TOKEN, profile: { id: 1 } });
    expect(out.token).toBe(TOKEN);
    expect(out.body).toEqual({ success: true, profile: { id: 1 }, sessionToken: COOKIE_MARKER, sessionCookie: true });
    expect(JSON.stringify(out.body)).not.toContain(TOKEN);
  });

  test('sem token na resposta (erro, MFA pendente) o corpo segue igual', () => {
    const erro = { success: false, message: 'x' };
    expect(splitLoginResult(erro)).toEqual({ body: erro, token: '' });
    expect(splitLoginResult(null)).toEqual({ body: null, token: '' });
    const pendente = { success: true, mfaRequired: true, mfaToken: 'abc' };
    expect(splitLoginResult(pendente).body).toBe(pendente);
  });

  test('as ações que criam e encerram sessão são as conhecidas', () => {
    expect(SESSION_CREATING_ACTIONS).toEqual(['apiLogin', 'apiLoginMfa']);
    expect(SESSION_ENDING_ACTIONS).toEqual(['apiLogout']);
  });
});
