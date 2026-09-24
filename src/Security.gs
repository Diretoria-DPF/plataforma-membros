/**
 * Security.gs
 * Validação de entrada, geração/verificação de tokens opacos (sessão,
 * confirmação de e-mail, redefinição de senha), limitação de tentativas via
 * CacheService e checagens de sessão/papel usadas por TODA função chamável
 * pelo cliente (ver Code.gs).
 *
 * Sobre CacheService como limitador de tentativas: CacheService.getScriptCache()
 * é um cache compartilhado por todo o projeto, persistido pelo Google entre
 * execuções (ao contrário de uma variável em memória, que morre a cada
 * execução do Apps Script). Ainda assim é um cache best-effort: pode ser
 * despejado antes do TTL expirar sob pressão de memória do serviço, não é
 * atômico entre leitura e escrita (pequena janela de corrida sob concorrência
 * muito alta) e não substitui uma defesa dedicada contra automação maliciosa
 * (ex.: reCAPTCHA/WAF). É tratado aqui como mitigação de profundidade, não
 * como garantia absoluta — ver docs/SECURITY.md.
 *
 * Sobre sessão no cliente: o HtmlService serve a página dentro de um iframe
 * sandbox; não há como o servidor emitir um cookie HttpOnly nesse modelo, e
 * qualquer token mantido em JavaScript é, por definição, legível por script
 * no mesmo contexto. Por isso o token de sessão é mantido em uma variável
 * JavaScript em memória no cliente (nunca em localStorage/sessionStorage):
 * um recarregamento de página exige novo login, mas um payload de XSS
 * persistente não consegue reidratar um token gravado em armazenamento
 * duradouro. A defesa real contra esse risco é nunca injetar dados do banco
 * via innerHTML (ver src/ui/Scripts.html e docs/SECURITY.md).
 */

App.Errors = (function () {
  function makeError(name) {
    function CustomError(message) {
      const err = new Error(message);
      err.name = name;
      err.expected = true;
      return err;
    }
    return CustomError;
  }

  return {
    ValidationError: makeError('ValidationError'),
    AuthError: makeError('AuthError'),
    ForbiddenError: makeError('ForbiddenError'),
    RateLimitError: makeError('RateLimitError'),
    NotFoundError: makeError('NotFoundError'),
    ConflictError: makeError('ConflictError'),
  };
})();

App.Security = (function () {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function normalizeText(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function isValidEmail(email) {
    const v = normalizeText(email).toLowerCase();
    return EMAIL_RE.test(v) && v.length <= 255;
  }

  function isLengthValid(value, min, max) {
    const len = normalizeText(value).length;
    return len >= min && len <= max;
  }

  function toHex(bytes) {
    return bytes.map(function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    }).join('');
  }

  /** Token opaco de alta entropia (duas UUIDv4 concatenadas, CSPRNG do runtime). */
  function generateRawToken() {
    return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  }

  /** SHA-256(pepper + token). Só o hash é persistido; o valor bruto nunca chega ao banco. */
  function hashToken(rawToken) {
    const pepper = App.Config.getSessionPepper();
    const digest = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      pepper + ':' + rawToken,
      Utilities.Charset.UTF_8
    );
    return toHex(digest);
  }

  function newCorrelationId() {
    return Utilities.getUuid();
  }

  /**
   * Limitador de tentativas por (bucket, chave). Lança RateLimitError com
   * mensagem genérica quando o limite é excedido dentro da janela.
   */
  function enforceRateLimit(bucket, identifier, maxAttempts, windowSeconds) {
    const cache = CacheService.getScriptCache();
    const idHash = toHex(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizeText(identifier).toLowerCase(), Utilities.Charset.UTF_8)
    );
    const key = 'rl:' + bucket + ':' + idHash;
    const current = Number(cache.get(key) || '0');

    if (current >= maxAttempts) {
      throw App.Errors.RateLimitError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
    }

    cache.put(key, String(current + 1), Math.min(windowSeconds, 21600));
  }

  /** Cria uma sessão persistida (Database) e devolve o token BRUTO (só existe neste retorno). */
  function createSession(profileId, userAgent) {
    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const ttlMinutes = App.Constants.LIMITS.SESSION_TTL_MINUTES;

    App.Database.execute(
      'INSERT INTO sessions (profile_id, token_hash, expires_at, user_agent) ' +
        "VALUES (?::uuid, ?, now() + (? || ' minutes')::interval, ?)",
      [profileId, tokenHash, ttlMinutes, userAgent || null]
    );

    return rawToken;
  }

  /**
   * Resolve uma sessão a partir do token bruto recebido do cliente. SEMPRE
   * consulta o banco (join sessions+profiles) — nunca confia em papel/status
   * enviados pelo navegador. Retorna null se inválida/expirada/revogada, ou
   * se a conta está banida/sem e-mail confirmado.
   */
  function resolveSession(rawToken) {
    const token = normalizeText(rawToken);
    if (!token) return null;

    const tokenHash = hashToken(token);
    const rows = App.Database.query(
      'SELECT s.profile_id AS profile_id, p.role AS role, p.status AS status, ' +
        '       p.full_name AS full_name, p.email AS email, p.email_confirmed_at AS email_confirmed_at ' +
        'FROM sessions s ' +
        'JOIN profiles p ON p.id = s.profile_id ' +
        'WHERE s.token_hash = ? ' +
        '  AND s.revoked_at IS NULL ' +
        '  AND s.expires_at > now() ' +
        'LIMIT 1',
      [tokenHash]
    );

    if (!rows.length) return null;

    const row = rows[0];
    if (row.status === App.Constants.ACCOUNT_STATUS.BANNED) return null;
    if (!row.email_confirmed_at) return null;

    return {
      profileId: row.profile_id,
      role: row.role,
      status: row.status,
      fullName: row.full_name,
      email: row.email,
      sessionToken: token,
    };
  }

  /** Lança AuthError genérico se a sessão não for válida; caso contrário devolve a identidade. */
  function requireSession(rawToken) {
    const identity = resolveSession(rawToken);
    if (!identity) {
      throw App.Errors.AuthError('Sessão inválida ou expirada. Faça login novamente.');
    }
    return identity;
  }

  function requireRole(identity, allowedRoles) {
    if (!identity || allowedRoles.indexOf(identity.role) === -1) {
      throw App.Errors.ForbiddenError('Acesso não autorizado para este recurso.');
    }
  }

  function revokeSession(rawToken) {
    const tokenHash = hashToken(normalizeText(rawToken));
    App.Database.execute(
      'UPDATE sessions SET revoked_at = now() WHERE token_hash = ? AND revoked_at IS NULL',
      [tokenHash]
    );
  }

  function revokeAllSessionsForProfile(profileId) {
    App.Database.execute(
      'UPDATE sessions SET revoked_at = now() WHERE profile_id = ?::uuid AND revoked_at IS NULL',
      [profileId]
    );
  }

  /**
   * Serializa um valor para embutir com segurança dentro de um bloco
   * <script> de um template HtmlService via scriptlet NÃO escapada (<?!= ?>).
   *
   * Por quê: a tag padrão <?= ?> do HtmlService escapa para contexto HTML
   * (`"` vira `&quot;`), o que QUEBRA a sintaxe JavaScript quando usada
   * dentro de <script>. A alternativa óbvia — JSON.stringify cru via
   * <?!= ?> — reintroduz um risco real: o parser HTML procura a sequência
   * literal "</script>" para fechar o bloco de script ANTES mesmo de
   * qualquer interpretação como JavaScript, então um valor controlado por
   * quem monta a URL (ex.: ?token=...</script><script>...) poderia escapar
   * do bloco. Esta função neutraliza isso escapando `<`, `>` e `&` como
   * sequências \\uXXXX depois do JSON.stringify: o resultado continua um
   * literal JavaScript válido, mas nunca contém a sequência "</script>"
   * nem abre um comentário HTML "<!--" em texto cru.
   */
  function toSafeInlineJson(value) {
    return JSON.stringify(value)
      .replace(/</g, '\\u003c')
      .replace(/>/g, '\\u003e')
      .replace(/&/g, '\\u0026');
  }

  return {
    normalizeText: normalizeText,
    isValidEmail: isValidEmail,
    isLengthValid: isLengthValid,
    generateRawToken: generateRawToken,
    hashToken: hashToken,
    newCorrelationId: newCorrelationId,
    enforceRateLimit: enforceRateLimit,
    createSession: createSession,
    resolveSession: resolveSession,
    requireSession: requireSession,
    requireRole: requireRole,
    revokeSession: revokeSession,
    revokeAllSessionsForProfile: revokeAllSessionsForProfile,
    toSafeInlineJson: toSafeInlineJson,
  };
})();
