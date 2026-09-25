# Plano de Implementação — Fase 3: Conexões, Visibilidade de Perfil e Mensageria E2EE

**Status:** planejamento (nenhum código escrito). Segue o fluxo do projeto:
plano → TDD → revisão → deploy → commit, uma fatia por vez.

Pontos que exigem aval do dono do produto estão marcados como
**DECISÃO PENDENTE (DP-n)**, cada um com uma recomendação explícita. A
lista consolidada está no fim da seção 8.

---

## 1. Resumo executivo

A Fase 3 adiciona três coisas à plataforma:
- **conexões** entre membros: pedido por nome de usuário exato ou telefone
  exato, aceitar, recusar, bloquear e denunciar, com uma fila de moderação
  só para admins;
- **visibilidade por campo** do perfil (LinkedIn, Instagram, escolaridade,
  interesses): `private` / `connections` / `public`, **padrão `private`**;
- **mensagens diretas 1:1 com criptografia de ponta a ponta**.

Os trade-offs abaixo **já estão decididos e não devem ser rediscutidos**:
- O servidor, os admins e o log de auditoria nunca leem conteúdo de mensagem.
- O par de chaves de mensageria de cada conta é **derivado
  deterministicamente de uma frase-senha própria**, que nunca sai do
  navegador. A mesma frase recria a mesma chave em qualquer dispositivo,
  sem sincronização de chaves.
- **Esqueceu a frase, perdeu o histórico, sem recuperação.**
- A criptografia v1 é ECDH estático → HKDF → AES-GCM. Não há sigilo
  futuro (forward secrecy) na v1.
- O **texto cifrado fica guardado no servidor indefinidamente**, enquanto
  a conta existir.
- A entrega é por **polling**. Durable Objects/WebSockets ficam como
  caminho de evolução para a v2, e não são pré-requisito da v1.

A arquitetura atual continua como está: `API_REGISTRY` fechado, services
por domínio, Neon via HTTP (um statement por chamada, CTEs para
atomicidade) e front-end vanilla ofuscado na publicação.

---

## 2. Modelo de dados

### Convenções (herdadas do projeto)
- Cada migração é aplicada pelo Neon MCP `run_sql` **um statement por
  vez**. Por isso os arquivos novos seguem o formato de
  `006_event_location.sql`: sem `BEGIN/COMMIT`, cada statement
  autocontido e idempotente. `CREATE TYPE` fica em bloco `DO ... EXCEPTION
  WHEN duplicate_object`, e o resto usa `IF NOT EXISTS`.
- Uma migração por sub-fase (007 a 010), para que cada fatia seja
  aplicável e reversível de forma isolada.
- **Política de FK**, seguindo o critério já documentado em `001_schema.sql`:
  - dados pessoais e relacionais (conexões, bloqueios, chaves, conversas,
    mensagens) usam `ON DELETE CASCADE`;
  - registros de governança e moderação (denúncias) usam
    `ON DELETE SET NULL`.

### 2.1 `sql/007_connections_moderation.sql` (Fase 3a)

```sql
DO $$ BEGIN
  CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_category AS ENUM ('harassment', 'spam', 'impersonation', 'inappropriate_content', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('open', 'under_review', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Telefone hoje é texto livre (8–30 chars), sem normalização e SEM unicidade.
-- Normalização conservadora BR: só dígitos, remove prefixo 55 (DDI) e 0 inicial.
-- Casos exóticos simplesmente não casam (a resposta ao cliente é uniforme
-- de qualquer forma). IMMUTABLE é exigido para uso em coluna gerada.
CREATE OR REPLACE FUNCTION normalize_phone_br(raw text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ /* corpo definido na implementação — ver regra acima */ $$;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_normalized TEXT
  GENERATED ALWAYS AS (normalize_phone_br(phone)) STORED;

-- DP-2: descoberta por telefone é opt-in.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_discoverable BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_profiles_phone_discovery
  ON profiles (phone_normalized) WHERE phone_discoverable;

CREATE TABLE IF NOT EXISTS connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status          connection_status NOT NULL DEFAULT 'pending',
  requested_via   VARCHAR(10) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ,
  declined_until  TIMESTAMPTZ,  -- ver nota "cooldown de recusa" abaixo
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT connections_not_self CHECK (requester_id <> addressee_id),
  CONSTRAINT connections_requested_via_enum CHECK (requested_via IN ('username', 'phone'))
);

-- Um único vínculo por par, independente de quem pediu.
CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_pair
  ON connections (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS idx_connections_addressee_pending
  ON connections (addressee_id, created_at DESC) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_connections_requester_status ON connections (requester_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_addressee_status ON connections (addressee_id, status);

DROP TRIGGER IF EXISTS trg_connections_updated_at ON connections;
CREATE TRIGGER trg_connections_updated_at BEFORE UPDATE ON connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Registro direcional; EFEITO bidirecional (ver guards abaixo).
CREATE TABLE IF NOT EXISTS profile_blocks (
  blocker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT profile_blocks_not_self CHECK (blocker_id <> blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_profile_blocks_blocked ON profile_blocks (blocked_id);

-- Denúncia: registro de moderação, sobrevive à exclusão das contas (SET NULL).
CREATE TABLE IF NOT EXISTS profile_reports (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reported_profile_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category             report_category NOT NULL,
  details              TEXT,
  evidence_excerpt     TEXT,          -- DP-4: trecho fornecido pelo denunciante
  status               report_status NOT NULL DEFAULT 'open',
  resolved_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,
  resolution_note      TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT profile_reports_details_len CHECK (details IS NULL OR char_length(details) <= 1000),
  CONSTRAINT profile_reports_evidence_len CHECK (evidence_excerpt IS NULL OR char_length(evidence_excerpt) <= 4000),
  CONSTRAINT profile_reports_note_len CHECK (resolution_note IS NULL OR char_length(resolution_note) <= 1000)
);
CREATE INDEX IF NOT EXISTS idx_profile_reports_status_created ON profile_reports (status, created_at);
CREATE INDEX IF NOT EXISTS idx_profile_reports_reported ON profile_reports (reported_profile_id);
-- Evita spam de denúncias repetidas do mesmo par enquanto uma está em aberto.
CREATE UNIQUE INDEX IF NOT EXISTS uq_profile_reports_open_pair
  ON profile_reports (reporter_id, reported_profile_id) WHERE status IN ('open', 'under_review');

DROP TRIGGER IF EXISTS trg_profile_reports_updated_at ON profile_reports;
CREATE TRIGGER trg_profile_reports_updated_at BEFORE UPDATE ON profile_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

**Gatilho de defesa em profundidade**, no mesmo padrão de
`guard_event_registration`/`guard_task_signup`:
`guard_connection_write()`, `BEFORE INSERT OR UPDATE ON connections`.
Ele exige que:
- as duas contas estejam `active` e com e-mail confirmado;
- o papel das duas esteja em (`member`, `admin`), conforme **DP-1**;
- não exista bloqueio em nenhuma direção;
- em UPDATE, `accepted`/`declined` só venha de `pending`;
- em UPDATE, `pending` só venha de `declined` **e** só quando
  `declined_until IS NULL OR now() > declined_until` (ver nota abaixo).

Mensagens em `RAISE EXCEPTION ... USING ERRCODE = 'P0001'` são traduzidas
pelo service, como `eventService.registerForEvent` já faz.

**Correção pós-revisão de segurança — cooldown de recusa (achado HIGH).**
O desenho original tinha um problema real: `uq_connections_pair` é um
índice único **permanente** (sem filtro de status), então a única forma
de registrar um novo pedido depois de uma recusa seria apagar a linha
`declined` via `removeConnection` e inserir outra — e nesse ponto não
sobra nada no banco pra `sendConnectionRequest` checar, então o cooldown
de recusa (pensado como proteção anti-assédio) seria **contornável
trivialmente** por quem foi recusado. A correção:
- `connections.declined_until` (adicionada acima) é preenchida por
  `respondToRequest` ao recusar: `now() + DECLINE_COOLDOWN_DAYS`;
- a transição `declined → pending` passa a ser **permitida pelo próprio
  gatilho**, mas só depois que `declined_until` vence — então
  `sendConnectionRequest`, depois do cooldown, faz um **UPDATE** na
  linha existente (não um INSERT novo), preservando o histórico e o
  controle;
- `removeConnection` (seção 5) fica restrito a `status = 'accepted'` —
  pedidos `pending`/`declined` deixam de ser apagáveis por qualquer uma
  das partes, exatamente para fechar essa brecha de "apagar e reenviar".

**Observações:**
- A coluna gerada **não é recalculada** se `normalize_phone_br` for
  substituída depois. Se a regra mudar, é preciso uma migração que recrie
  a coluna.
- `ADD COLUMN ... GENERATED STORED` reescreve a tabela. Para o tamanho
  atual de `profiles`, isso é irrelevante.

### 2.2 `sql/008_profile_visibility.sql` (Fase 3b)

```sql
DO $$ BEGIN
  CREATE TYPE profile_field_visibility AS ENUM ('private', 'connections', 'public');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DEFAULT 'private' + NOT NULL preenche TODAS as contas existentes como privadas
-- no momento do ADD COLUMN — ninguém sai de um estado público por omissão.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS linkedin_visibility  profile_field_visibility NOT NULL DEFAULT 'private';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS instagram_visibility profile_field_visibility NOT NULL DEFAULT 'private';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS education_visibility profile_field_visibility NOT NULL DEFAULT 'private';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS interests_visibility profile_field_visibility NOT NULL DEFAULT 'private';
```

Colunas em `profiles` (relação 1:1) em vez de tabela separada: a leitura
é uma única consulta e a atualização é um único UPDATE, como em
`updateMyProfile`.

### 2.3 `sql/009_messaging_keys.sql` (Fase 3d)

```sql
CREATE TABLE IF NOT EXISTS messaging_keys (
  profile_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_version     INTEGER NOT NULL,
  algorithm       VARCHAR(20) NOT NULL,
  public_key      TEXT NOT NULL,        -- base64url, sem padding
  kdf_algorithm   VARCHAR(30) NOT NULL,
  kdf_iterations  INTEGER NOT NULL,
  kdf_salt        TEXT NOT NULL,        -- base64url de 16 bytes aleatórios
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  superseded_at   TIMESTAMPTZ,
  PRIMARY KEY (profile_id, key_version),
  CONSTRAINT messaging_keys_version_positive CHECK (key_version >= 1),
  CONSTRAINT messaging_keys_algorithm_enum CHECK (algorithm IN ('X25519', 'P-256')),
  CONSTRAINT messaging_keys_kdf_enum CHECK (kdf_algorithm IN ('PBKDF2-SHA256')),
  CONSTRAINT messaging_keys_kdf_iterations_min CHECK (kdf_iterations >= 600000),
  CONSTRAINT messaging_keys_public_key_len CHECK (char_length(public_key) BETWEEN 40 AND 200),
  CONSTRAINT messaging_keys_salt_len CHECK (char_length(kdf_salt) BETWEEN 16 AND 64)
);
-- No máximo UMA chave ativa por conta; versões antigas ficam (necessárias para
-- o OUTRO participante continuar decifrando o histórico antigo).
CREATE UNIQUE INDEX IF NOT EXISTS uq_messaging_keys_active
  ON messaging_keys (profile_id) WHERE superseded_at IS NULL;
```

**Rotação.** É um único statement com CTE (substitui a versão N e insere
a N+1 condicionado ao `UPDATE ... RETURNING`), para ser atômica no driver
HTTP. É preciso validar numa branch do Neon que o índice parcial único
aceita a troca dentro do mesmo statement.

### 2.4 `sql/010_messages.sql` (Fase 3e)

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  participant_low    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  participant_high   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at    TIMESTAMPTZ,
  low_last_read_id   BIGINT NOT NULL DEFAULT 0,
  high_last_read_id  BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT conversations_ordered_pair CHECK (participant_low < participant_high),
  CONSTRAINT conversations_pair_unique UNIQUE (participant_low, participant_high)
);
CREATE INDEX IF NOT EXISTS idx_conversations_low_recent  ON conversations (participant_low,  last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_high_recent ON conversations (participant_high, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id        UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_message_id      UUID NOT NULL,
  crypto_version         SMALLINT NOT NULL DEFAULT 1,
  sender_key_version     INTEGER NOT NULL,
  recipient_key_version  INTEGER NOT NULL,
  iv                     VARCHAR(24) NOT NULL,   -- 12 bytes → 16 chars base64url
  ciphertext             TEXT NOT NULL,          -- inclui a tag GCM de 16 bytes
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_client_id_unique UNIQUE (sender_id, client_message_id),
  CONSTRAINT messages_iv_len CHECK (char_length(iv) = 16),
  CONSTRAINT messages_ciphertext_len CHECK (char_length(ciphertext) BETWEEN 24 AND 12000)
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, id DESC);
```

- **Id de mensagem `BIGINT IDENTITY`**, e não UUID como no resto do
  schema. Ele serve de cursor monotônico para paginação (`id < before`) e
  polling (`id > after`). O `client_message_id` dá idempotência em
  reenvios por falha de rede.
- **Par ordenado (`low < high`)** para garantir uma conversa por par sem
  depender de quem abriu.
- **Não existe coluna de texto claro, nem de "prévia"**, em lugar nenhum.
- **Gatilho `guard_message_insert()`** (`BEFORE INSERT ON messages`). Ele
  exige que:
  - o remetente seja participante da conversa;
  - as duas contas estejam ativas e confirmadas;
  - exista `connections.status = 'accepted'` para o par;
  - não haja bloqueio em nenhuma direção;
  - `sender_key_version` e `recipient_key_version` sejam as versões
    **ativas** atuais das duas contas.
- **`last_message_at` e o read-marker do próprio remetente** são
  atualizados no mesmo statement do INSERT (`WITH ins AS (INSERT ...
  RETURNING id, created_at) UPDATE conversations ...`).

---

## 3. Fluxo de criptografia

Toda a criptografia roda **no navegador, via `crypto.subtle` nativo**.
Todo binário trafega em base64url sem padding.

### 3.1 Escolha da curva — **DECISÃO PENDENTE (DP-6)**

O briefing recomenda P-256. Para **derivação determinística a partir de
frase-senha**, o P-256 esbarra numa limitação real da Web Crypto: **não há
API para calcular a chave pública a partir do escalar privado**.
- Importar em JWK exige `x`/`y` junto com `d`.
- Importar em PKCS#8 sem o campo `publicKey` tem suporte **inconsistente
  entre navegadores**.
- Fazer a multiplicação de ponto em JS puro exige uma biblioteca externa
  (ex.: `@noble/curves`).

**Recomendação: X25519 via Web Crypto nativa.**
- Qualquer sequência de 32 bytes é uma chave privada válida.
- A codificação PKCS#8 padrão do X25519 (RFC 8410) **não contém** a chave
  pública; é exatamente o formato que os próprios navegadores exportam.
- `exportKey('jwk')` da chave privada devolve `x` (a pública).
- Resultado: nenhuma biblioteca externa.
- Suporte: Chrome 133+, Firefox 130+, Safari 17+.

**Alternativa, se a DP-6 for recusada:** P-256 com `@noble/curves`
vendorizado em `frontend/vendor/`, versão fixa, auditado e sem CDN.

**O primeiro passo da Fase 3d é um spike.** Ele deriva o vetor dourado
(seção 9) em Chrome desktop/Android, Firefox e Safari iOS, e testa o
build ofuscado (`frontend/dist/`).

### 3.2 KDF: PBKDF2-SHA-256, 600.000 iterações

- **Por que não Argon2id:** exigiria WASM de terceiros, CSP com
  `'wasm-unsafe-eval'` e um arquivo a mais no pipeline de ofuscação.
- **Por que PBKDF2:** é nativo, determinístico e segue o piso da OWASP
  para PBKDF2-HMAC-SHA256.
- **Evolução:** `kdf_algorithm`/`kdf_iterations` ficam por versão de
  chave, então dá para migrar para Argon2id no futuro via rotação.
- **Ponto crítico:** como a chave pública é publicada, **quem obtiver
  `public_key` + `kdf_salt` pode testar frases offline**. A segurança
  contra quem tem um dump do banco é "força da frase × custo do PBKDF2".
  Mitigações:
  - o salt só é devolvido ao **próprio dono**;
  - chaves públicas só vão para **conexões aceitas**;
  - política mínima de frase (DP-10).

### 3.3 Derivação do par de chaves (sempre no cliente)

1. `pass = frase.normalize('NFKC')`. Com isso, a mesma frase digitada em
   teclados diferentes produz os mesmos bytes.
2. `base = importKey('raw', utf8(pass), 'PBKDF2', false, ['deriveBits'])`
3. `ikm = deriveBits({name:'PBKDF2', hash:'SHA-256', salt: kdfSalt, iterations: 600000}, base, 256)`
4. `hk = importKey('raw', ikm, 'HKDF', false, ['deriveBits'])`
5. `seed = deriveBits({name:'HKDF', hash:'SHA-256', salt: vazio, info: utf8('laift-msg/v1/x25519-identity/' + profileId)}, hk, 256)`.
   Incluir o `profileId` separa os domínios por conta.
6. `pkcs8 = 302e020100300506032b656e04220420 ‖ seed`, ou seja, o prefixo
   fixo de 16 bytes do X25519 seguido dos 32 bytes da semente.
7. `tmp = importKey('pkcs8', pkcs8, {name:'X25519'}, true, ['deriveBits'])`,
   depois `exportKey('jwk', tmp).x` → **chave pública**.
8. `priv = importKey('pkcs8', pkcs8, {name:'X25519'}, false, ['deriveBits'])`.
   É **não-extraível** e é a única forma que fica em memória.
9. Zerar `ikm`/`seed`/`pkcs8` (`fill(0)`, melhor esforço) e descartar `tmp`.

**Verificação no desbloqueio:** a pública derivada tem que ser igual à
`public_key` ativa publicada. Se diferir, a mensagem é "frase incorreta".
Não há chamada ao servidor nessa checagem, nem verificador extra
armazenado.

O cliente **recusa** `kdf_iterations` abaixo de uma constante local
(600.000). Assim, um servidor malicioso não consegue rebaixar o custo.

### 3.4 Primeira publicação e rotação

- **Primeira vez:**
  1. o cliente gera `kdfSalt` (16 bytes, `crypto.getRandomValues`);
  2. deriva as chaves (3.3);
  3. chama `apiPublishMessagingKey` com `{algorithm, publicKey,
     kdfAlgorithm, kdfIterations, kdfSalt, expectedCurrentVersion: 0}`.
- **Rotação** ("esqueci a frase" ou "trocar a frase"): o mesmo fluxo, com
  salt novo e `expectedCurrentVersion = N`. O servidor marca N como
  `superseded_at` e grava N+1 (concorrência otimista).
- **Consequências da rotação:**
  - quem rotacionou **perde a leitura do próprio histórico anterior**,
    como decidido;
  - o **outro participante continua lendo** esse histórico, porque tem a
    própria privada e a pública antiga, que é mantida;
  - "desbloquear histórico antigo digitando a frase antiga" é possível
    porque os salts antigos ficam guardados, mas fica para a **v2**.
- **O que NUNCA vai ao servidor:** a frase, a semente, a chave privada
  (em qualquer forma, cifrada ou não) e as chaves de conversa.

### 3.5 Chave por conversa

- `peerPub = importKey('raw', b64u(peer.publicKey), {name:'X25519'}, false, [])`
- `shared = deriveBits({name:'X25519', public: peerPub}, priv, 256)`.
  A especificação Secure Curves obriga o navegador a lançar erro se o
  resultado for todo zero (ponto de ordem baixa).
- `K = deriveKey({name:'HKDF', hash:'SHA-256', salt: utf8(conversationId),
  info: utf8('laift-msg/v1/aesgcm|' + lowId + ':' + lowVer + '|' + highId + ':' + highVer)},
  importKey('raw', shared, 'HKDF', ...), {name:'AES-GCM', length:256}, false, ['encrypt','decrypt'])`
- A chave `K` fica em cache em memória por `(conversationId, lowVer, highVer)`.

### 3.6 Mensagem (payload)

- **Texto claro (dentro da cifra):**
  - formato `JSON {b: texto, t: ISO do cliente, p: preenchimento}`;
  - `p` completa o tamanho UTF-8 até um múltiplo de 256 bytes, para
    esconder o tamanho exato;
  - limite de **2.000 caracteres**, só aplicado no cliente (o servidor
    não vê o texto).
- `iv` = 12 bytes aleatórios **por mensagem**. Com IV aleatório de 96
  bits e uma chave por par, o limite de aniversário (~2³² mensagens)
  está muito além de qualquer volume real.
- **AAD** = `'laift-msg/v1|' + conversationId + '|' + senderId + '|' +
  senderKeyVersion + '|' + recipientKeyVersion + '|' + clientMessageId`.
  Isso vincula a cifra ao contexto: se o servidor trocar a mensagem de
  conversa, de remetente ou de versão, a decifragem falha.
- **Enviado ao servidor:** `{clientMessageId, senderKeyVersion,
  recipientKeyVersion, iv, ciphertext}`, com `ciphertext` = saída do
  AES-GCM incluindo a tag de 128 bits.
- **O servidor valida só a forma:** base64url, tamanhos, versões de chave
  atuais e relação permitida.
- **Deduplicação no cliente** por `clientMessageId`, que é autenticado
  via AAD. Isso cobre duplicação ou replay de linhas pelo servidor.

### 3.7 Troca de chave do contato (proteção contra MITM do diretório)

- O cliente guarda em `localStorage` o **fingerprint** da pública de cada
  contato por versão (TOFU). Não é segredo.
- Se a versão ativa do contato mudar, a conversa mostra o aviso "A chave
  de segurança de Fulano mudou".
- Cada conversa tem um "número de segurança" legível (SHA-256 das duas
  públicas ordenadas, em grupos de dígitos) para conferência presencial.

---

## 4. Superfície de API (`handlers.js` → `API_REGISTRY`)

Todas as entradas usam `runWithSession`, exceto `apiGetPublicProfile`,
que segue o padrão de `apiListEvents` com `run` + `resolveSession`
opcional.

"M/A" = `member`/`admin`, conforme DP-1. Os services chamam
`S.requireRole` sempre, **independente da UI**.

| Ação | Args | Service | Autorização |
|---|---|---|---|
| `apiSendConnectionRequest` | `sessionToken, {username}\|{phone}` | `ConnectionService.sendConnectionRequest` | M/A; rate limit; **resposta idêntica** exista ou não o alvo |
| `apiListIncomingConnectionRequests` | `sessionToken` | `ConnectionService.listIncomingRequests` | M/A; só pedidos onde é `addressee`, pendentes há ≤ 30 dias, de contas ativas |
| `apiRespondConnectionRequest` | `sessionToken, connectionId, 'accept'\|'decline'` | `ConnectionService.respondToRequest` | só o `addressee` do pedido |
| `apiListMyConnections` | `sessionToken` | `ConnectionService.listMyConnections` | M/A; só as próprias |
| `apiRemoveConnection` | `sessionToken, connectionId` | `ConnectionService.removeConnection` | qualquer uma das duas partes |
| `apiBlockProfile` | `sessionToken, targetProfileId` | `ConnectionService.blockProfile` | M/A; resposta uniforme |
| `apiUnblockProfile` | `sessionToken, targetProfileId` | `ConnectionService.unblockProfile` | só quem bloqueou |
| `apiListMyBlocks` | `sessionToken` | `ConnectionService.listMyBlocks` | M/A; só os próprios |
| `apiReportProfile` | `sessionToken, {targetProfileId, category, details, evidenceExcerpt}` | `ModerationService.submitReport` | M/A; exige vínculo prévio com o alvo (pedido, conexão, bloqueio ou conversa) |
| `apiAdminListReports` | `sessionToken, {status, page}` | `ModerationService.listReports` | admin |
| `apiAdminResolveReport` | `sessionToken, reportId, {status, resolutionNote}` | `ModerationService.resolveReport` | admin |
| `apiUpdateMyProfileVisibility` | `sessionToken, {linkedin, instagram, education, interests, phoneDiscoverable}` | `ProfileService.updateMyProfileVisibility` | qualquer sessão; só o próprio perfil |
| `apiGetPublicProfile` | `sessionToken\|'', username` | `ProfileService.getPublicProfile` | público; campos filtrados **no SQL** pela relação do visitante; rate limit por IP |
| `apiGetMyMessagingKey` | `sessionToken` | `MessagingKeyService.getMyMessagingKey` | M/A; só a própria (inclui o salt) |
| `apiPublishMessagingKey` | `sessionToken, input` | `MessagingKeyService.publishMessagingKey` | M/A; rate limit |
| `apiGetPeerMessagingKeys` | `sessionToken, peerProfileId` | `MessagingKeyService.getPeerMessagingKeys` | M/A; só de conexão aceita **ou** participante de conversa existente; nunca inclui salt |
| `apiOpenConversation` | `sessionToken, peerProfileId` | `MessageService.openConversation` | M/A; conexão aceita, sem bloqueio |
| `apiListConversations` | `sessionToken` | `MessageService.listConversations` | M/A; só as próprias |
| `apiListMessages` | `sessionToken, conversationId, {beforeId}\|{afterId}` | `MessageService.listMessages` | só participante |
| `apiSendMessage` | `sessionToken, conversationId, payload` | `MessageService.sendMessage` | só participante; conexão aceita; sem bloqueio; ambos ativos; rate limit |
| `apiMarkConversationRead` | `sessionToken, conversationId, lastReadMessageId` | `MessageService.markConversationRead` | só participante |
| `apiMessagingSync` | `sessionToken` | `MessageService.syncMessaging` | M/A; contadores próprios (não lidas + pedidos pendentes) |

**Total: 22 ações novas** (de 42 para 64). O teste de allowlist em
`worker/test/handlers.test.js` é atualizado a cada sub-fase.

**Mudanças de infraestrutura pequenas e necessárias:**
- **IP do cliente nos handlers:** `index.js` passa a enviar
  `request.headers.get('CF-Connecting-IP')` num 4º parâmetro `ctx`
  (`handler(sql, env, args, ctx)`). Os handlers atuais ignoram parâmetros
  extras, então nada quebra. Hoje os handlers não recebem o `request` e
  não há como limitar por IP.
- **`constants.js`:**
  - `LIMITS`: `MESSAGE_PLAINTEXT_MAX: 2000`, `MESSAGE_CIPHERTEXT_MAX: 12000`,
    `MESSAGE_PAGE_SIZE: 30`, `CONNECTION_REQUEST_TTL_DAYS: 30`,
    `DECLINE_COOLDOWN_DAYS: 30`, `REPORT_DETAILS_MAX: 1000`,
    `REPORT_EVIDENCE_MAX: 4000`, `KDF_MIN_ITERATIONS: 600000`,
    `REPORT_LIST_PAGE_SIZE: 25`;
  - `RATE_LIMITS`: `CONNECTION_REQUEST {20, 86400}`, `MESSAGE_SEND {30, 60}`,
    `REPORT {10, 86400}`, `KEY_PUBLISH {5, 86400}`,
    `PUBLIC_PROFILE_IP {60, 600}`;
  - novos `CONNECTION_STATUS`, `REPORT_STATUS`, `REPORT_CATEGORY` e
    `FIELD_VISIBILITY`, espelhando os ENUMs, como o arquivo já faz.
- **`adminService.dashboard`** ganha
  `(SELECT count(*) FROM profile_reports WHERE status = 'open') AS reports_open`.

---

## 5. Novos arquivos de serviço

Todos seguem o padrão existente:
- `import * as C/S/E/Logging`;
- a identidade vem sempre de `identity` e nunca de um id do cliente;
- validação antes de tocar o banco;
- tradução de exceções dos gatilhos em `E.*`;
- `Logging.logAudit` em toda mutação, com a exceção discutida na DP-7;
- **nunca** gravar telefone, username digitado, conteúdo de denúncia ou
  qualquer material criptográfico em `details`.

### `worker/src/services/connectionService.js`
- `sendConnectionRequest(sql, identity, input, correlationId)`: resolve o
  alvo por username exato, ou por `phone_normalized` com
  `phone_discoverable`, conta ativa e confirmada. Só age se houver
  **exatamente 1** resultado. Se já existir uma linha `declined` para o
  par e o cooldown já tiver vencido, faz **UPDATE** dela para `pending`
  (nunca um novo INSERT — ver seção 2.1); se o cooldown ainda estiver
  ativo, ou houver bloqueio, é um no-op silencioso. Devolve sempre a
  mesma mensagem ("Se existir uma conta com esses dados, o pedido foi
  enviado.").
- `listIncomingRequests(sql, identity)`: pedidos pendentes recebidos, com
  cartão básico do solicitante (nome, username, avatar).
- `respondToRequest(sql, identity, connectionId, decision, correlationId)`:
  aceitar/recusar. O `UPDATE ... WHERE addressee_id = identity` torna a
  checagem de posse atômica. Ao recusar, grava `declined_until = now() +
  DECLINE_COOLDOWN_DAYS` (ver correção pós-revisão na seção 2.1).
- `listMyConnections(sql, identity)`: conexões aceitas com contas ativas.
- `removeConnection(sql, identity, connectionId, correlationId)`: `DELETE`
  condicionado a ser uma das partes **e** `status = 'accepted'` (achado
  HIGH da revisão de segurança — pedidos `pending`/`declined` não são
  apagáveis, exatamente para o cooldown de recusa não virar
  contornável via "apagar e reenviar").
- `blockProfile(sql, identity, targetProfileId, correlationId)`: um único
  statement com CTE (INSERT em `profile_blocks ON CONFLICT DO NOTHING` +
  DELETE da conexão do par).
- `unblockProfile(sql, identity, targetProfileId, correlationId)`: remove o
  bloqueio. **Não** restaura a conexão.
- `listMyBlocks(sql, identity)`: bloqueios feitos por mim.
- `getRelationship(sql, viewerProfileId, targetProfileId)`: helper exportado
  que devolve `{isSelf, isConnection, isBlockedEitherWay}`. É usado por
  `profileService` e `messageService`.

### `worker/src/services/moderationService.js`
- `submitReport(sql, identity, input, correlationId)`: valida categoria e
  tamanhos, exige vínculo prévio e aplica rate limit.
- `listReports(sql, identity, input)`: somente admin; paginado como
  `listFeedback`. Devolve nome e username das partes, nunca e-mail ou
  telefone.
- `resolveReport(sql, identity, reportId, input, correlationId)`: somente
  admin. Transições fechadas `open → under_review → resolved|dismissed`
  (e `open → resolved|dismissed`). O banimento continua sendo feito pela
  ação existente `apiAdminBanUser`.

### `worker/src/services/profileService.js` (extensão)
- `updateMyProfileVisibility(sql, identity, input, correlationId)`:
  valida cada campo contra a lista fechada `FIELD_VISIBILITY`; um UPDATE.
- `getPublicProfile(sql, viewerIdentityOrNull, username)`: uma consulta
  com CTE que resolve o alvo e a relação. Os campos vêm filtrados **no
  SELECT**, como abaixo:
  ```sql
  CASE WHEN is_self OR p.linkedin_visibility = 'public'
            OR (p.linkedin_visibility = 'connections' AND is_connection)
       THEN p.linkedin_url END AS linkedin_url
  ```
  Assim, o valor bruto nunca sai do banco para quem não pode vê-lo. É o
  mesmo princípio do `visibilitySql()` de eventos, mas aqui com
  parâmetros ligados, sem interpolação de texto. Regras:
  - bloqueio em qualquer direção, conta banida ou inexistente →
    **o mesmo** `NotFoundError('Perfil não encontrado.')`;
  - visitante não autenticado: 404 se nenhum campo for `public` (DP-5).
- `getMyProfile` passa a devolver também as 4 visibilidades e
  `phoneDiscoverable`.

### `worker/src/services/messagingKeyService.js`
- `getMyMessagingKey(sql, identity)`: `{hasKey, keyVersion, algorithm,
  publicKey, kdf: {algorithm, iterations, salt}}` da versão ativa.
- `publishMessagingKey(sql, identity, input, correlationId)`: valida
  algoritmo, base64url, tamanho decodificado (32 bytes para X25519), salt
  de 16 bytes e iterações ≥ piso. Primeira publicação ou rotação atômica
  por `expectedCurrentVersion`. A auditoria registra
  `PUBLISH_MESSAGING_KEY {keyVersion}`.
- `getPeerMessagingKeys(sql, identity, peerProfileId)`: todas as versões
  (só a pública + versão + algoritmo) de um contato autorizado.

### `worker/src/services/messageService.js`
- `openConversation(sql, identity, peerProfileId, correlationId)`: upsert
  idempotente do par ordenado; exige conexão aceita e ausência de bloqueio.
- `listConversations(sql, identity)`: caixa de entrada com
  `{conversationId, peer: {id, fullName, username, avatarUrl, status},
  lastMessageAt, unreadCount}`. Sem prévia de conteúdo, porque ela não
  existe.
- `listMessages(sql, identity, conversationId, input)`: página por
  `beforeId` (histórico) ou `afterId` (polling), `LIMIT` fixo.
- `sendMessage(sql, identity, conversationId, payload, correlationId)`:
  valida a forma, aplica rate limit e faz o INSERT com CTE que atualiza
  `conversations`. Um reenvio com o mesmo `clientMessageId` devolve a
  mensagem já gravada.
- `markConversationRead(sql, identity, conversationId, lastReadMessageId)`:
  `GREATEST` no marcador do lado correto do par.
- `syncMessaging(sql, identity)`: **uma** consulta leve para os badges
  (não lidas por conversa + total de pedidos pendentes).

---

## 6. Front-end

### Restrições atuais que moldam o desenho
- `frontend/app.js` já tem ~1.600 linhas, acima do teto flexível de 800.
  A mensageria adicionaria algo como 700 a 900.
- `build.js` ofusca **só `app.js`**, com `selfDefending` e
  `controlFlowFlattening`.
- Os auxiliares `h`/`text`/`callApi` vivem dentro da IIFE.
- **Não há CSP.** O Chart.js vem do jsDelivr com SRI.

### Organização proposta
- **`frontend/msg-crypto.js` (novo):** IIFE em estilo ES5, **sem DOM e
  sem rede**, expondo um objeto congelado `window.LaiftMsgCrypto`
  (derivar identidade, derivar chave de conversa, cifrar, decifrar,
  fingerprint, gerar frase). Também faz `module.exports` quando
  `module` existir, para rodar no Jest em Node (Node 20+ tem
  `crypto.subtle` com X25519). A razão é isolar o código mais sensível
  num módulo pequeno, puro e com vetores de teste.
- **`build.js`** passa a ofuscar também `msg-crypto.js`.
- **`index.html`** carrega `msg-crypto.js` antes de `app.js`.
- **A UI continua em `app.js`** na v1 (ver risco R12).

### Painéis novos
1. **"Mensagens"**: um botão novo na barra inferior (`data-scope="member"`)
   com badge de não lidas, abrindo `panel-messages` com três abas
   internas. Um botão só evita sobrecarregar a barra, que já tem 6 itens
   para admins.
   - *Conversas:* lista de conversas → visão da conversa (histórico
     paginado para cima, campo de envio, estados "enviando", "falhou" e
     "não foi possível decifrar").
   - *Conexões:* lista, formulário "Adicionar por nome de usuário ou
     telefone", bloquear/desbloquear, denunciar.
   - *Pedidos:* pedidos recebidos com o cartão básico do solicitante e
     botões Aceitar / Recusar / Bloquear.
2. **Perfil → cartão "Privacidade do perfil":**
   - 4 seletores (Privado / Conexões / Público);
   - checkbox "Permitir que me encontrem pelo telefone" (DP-2);
   - prévia "como um desconhecido vê" calculada **localmente** a partir
     dos próprios dados, sem endpoint extra.
3. **Perfil público:** `panel-public-profile` dentro do app (acessado a
   partir de conexões, pedidos e conversas), mais `screen-public-profile`
   no `public-shell` via deep link `?mode=profile&u=<username>`.
   `readDeepLink()` já existe e é estendido.
4. **Admin → "Denúncias":** `panel-admin-reports` na barra admin, com
   filtros de status, ações de transição e atalho para a ação de banir
   que já existe. O dashboard ganha o indicador `reports_open`.

**Todo conteúdo decifrado é tratado como entrada hostil.** A renderização
é só via `text()`/`textContent`, nunca `innerHTML`, conforme o risco
residual nº 1 de `docs/SECURITY.md`.

### Fluxo da frase-senha
- **Quando pede:** só ao entrar na aba *Conversas*, ou ao abrir uma
  conversa, sem chave em memória. Conexões e pedidos funcionam sem frase.
- **Conta sem chave (`hasKey:false`) → tela de configuração:**
  - explica em linguagem simples: a frase não sai do aparelho e,
    esquecida, o histórico se perde para sempre;
  - frase + confirmação, com botão "Gerar frase para mim" (5 palavras de
    uma lista embutida de 2.048 palavras em português, ≈55 bits);
  - checkbox obrigatório "Entendo que não há recuperação";
  - "Derivando chave…" enquanto o PBKDF2 roda (~0,5–2 s no celular),
    depois publicação.
- **Conta com chave → modal "Desbloquear mensagens":** busca salt e
  iterações, deriva e compara com a pública publicada. Uma frase errada é
  detectada localmente, com atraso crescente entre tentativas no cliente.
- **Aparelho novo:** é exatamente o fluxo de desbloqueio. Não existe
  sincronização; a frase é a chave.
- **Cache (DP-9):** a `CryptoKey` privada **não-extraível** e as chaves
  de conversa ficam **só em memória JS**. São descartadas:
  - no logout;
  - no temporizador de expiração de sessão (`scheduleSessionExpiry`);
  - no botão "Bloquear mensagens";
  - ao recarregar a página.

  Cada aba desbloqueia por conta própria.
- **"Esqueci minha frase":** confirmação dupla → rotação (3.4). As
  mensagens antigas aparecem como "cifrada com uma chave anterior".

### Polling
- **Conversa aberta e aba visível:** `apiListMessages({afterId})` a cada
  5 s, com recuo gradual até 30 s depois de 2 min sem novidade; volta a
  5 s ao receber mensagem ou ao digitar.
- **Resto do app:** `apiMessagingSync` a cada 30 s e em
  `refreshNavBadges()`.
- **`document.hidden`:** o polling é suspenso.
- **Erro:** recuo exponencial.
- **Sessão inválida:** para tudo.
- **Janela de sobreposição:** IDs `IDENTITY` podem ser confirmados fora
  de ordem sob concorrência. Por isso o cliente pede `afterId` = maior id
  visto há mais de ~10 s e deduplica por id e `clientMessageId`.
- **O polling não conta como "atividade"** para a sessão. Só clique,
  tecla e toque contam, e isso já é o comportamento de
  `resetSessionExpiryOnActivity`.

### Endurecimento (junto da Fase 3f)
- **CSP via `<meta http-equiv>`**, porque o GitHub Pages não permite
  cabeçalhos: `default-src 'self'`,
  `script-src 'self' https://cdn.jsdelivr.net`, `connect-src` restrito à
  URL do Worker, `img-src 'self' data:` + a origem R2, `object-src 'none'`,
  `base-uri 'none'`.
- **A validar antes:**
  - atributos `style=` inline no `index.html` (exigem
    `style-src 'unsafe-inline'` ou refatoração);
  - se o código ofuscado com `selfDefending` exige `'unsafe-eval'`.

---

## 7. Ordem de implementação faseada

Cada sub-fase segue o mesmo ciclo: migração (se houver) aplicada via MCP
→ testes Jest verdes (os 73 atuais + os novos) → `wrangler deploy` e/ou
publicação do front → commit → push. Fases só de backend vão ao ar
"escuras", sem UI que as chame, e são verificadas por chamada direta.

**Fase 3.0 — Pré-requisito recomendado (renovação de sessão).**
- **Problema:** hoje `createSession` fixa `expires_at = now() + 30 min`
  no login e **nada renova esse prazo no servidor**. O "expira só por
  inatividade" do front renova apenas o cache local, então uma pessoa
  ativa leva "Sessão inválida" 30 min após o login.
- **Correção:** nova ação `apiTouchSession`, chamada pelo
  `resetSessionExpiryOnActivity` já existente (com throttle), estendendo
  `expires_at` com um teto absoluto (ex.: 12 h).
- **Nunca pelo polling:** senão a sessão nunca expiraria.
- Pequena, independente e já útil hoje.

**Fase 3a — Conexões e moderação (backend).**
- `007`, `connectionService.js`, `moderationService.js`, rate limits, IP
  em `ctx`, indicador no dashboard, 11 ações.
- **Depende de:** DP-1, DP-2, DP-3, DP-4.

**Fase 3b — Visibilidade de perfil (backend).**
- `008`, `updateMyProfileVisibility`, `getPublicProfile`, `getMyProfile`
  estendido, 2 ações.
- **Depende de:** 3a (relação "conexão") e DP-5.

**Fase 3c — UI social (primeira entrega visível).**
- Aba Conexões/Pedidos, cartão de privacidade, perfil público (in-app e
  deep link), painel admin de denúncias.
- Atualização de `docs/POLITICA_DE_PRIVACIDADE.md` e
  `docs/TERMOS_DE_USO.md`: conexões, bloqueio, denúncias, descoberta por
  telefone opt-in e, já antecipado, o tratamento de metadados de
  mensagens. Com isso, sobe `LEGAL_VERSIONS` + o texto fixo em
  `index.html`.
- Conferir se existe fluxo de re-aceite de nova versão. Se não existir,
  é um item desta fase.

**Fase 3d — Chaves de mensageria.**
- (1) Spike de compatibilidade (DP-6) com o vetor dourado em 4
  navegadores, incluindo o build ofuscado.
- (2) `frontend/msg-crypto.js` + testes.
- (3) `009` + `messagingKeyService.js` + 3 ações.
- Sem UI ainda.

**Fase 3e — Mensagens (backend).**
- `010`, `messageService.js`, gatilho `guard_message_insert`, 6 ações,
  sync.
- **Depende de:** 3a e 3d; DP-7 e DP-8.

**Fase 3f — UI de mensageria.**
- Configuração e desbloqueio da frase, caixa de entrada, visão da
  conversa, polling, TOFU/número de segurança, badges, CSP meta.
- **Depende de:** 3.0 (fortemente recomendado), 3d e 3e.

**Caminho v2 (fora de escopo):**
- Durable Object por conversa com WebSocket Hibernation, retransmitindo
  só "chegou a mensagem id X". O texto cifrado continua no Neon e o
  modelo E2EE não muda.
- Double Ratchet.
- Desbloqueio de versões antigas de chave.
- "Apagar para todos".
- Argon2id.

---

## 8. Riscos e limitações honestas

- **R1. Sem sigilo futuro na v1.**
  - A chave de conversa é estática por par e por versão, e o texto
    cifrado é guardado **para sempre**.
  - Se uma frase vazar anos depois (ou a privada for exposta por XSS com
    as mensagens desbloqueadas), **todo o histórico daquela conta**, nas
    duas direções, fica legível para quem tiver uma cópia do banco.
  - Esse é o preço direto da combinação "histórico permanente + chaves
    estáticas".
- **R2. Força bruta offline da frase.**
  - `public_key` + `kdf_salt` bastam para testar palpites.
  - Mitigações:
    - o salt só vai ao dono;
    - chaves públicas só vão a conexões;
    - PBKDF2 com 600 mil iterações;
    - política mínima (DP-10) e gerador de frase.
  - Frases humanas fracas continuam sendo o elo fraco.
- **R3. Sem recuperação, por decisão.** Esquecer a frase, ou rotacioná-la,
  torna o próprio histórico anterior ilegível. A UI deixa isso explícito
  antes da configuração.
- **R4. Confiança no JavaScript publicado.**
  - Em qualquer E2EE web, quem controla o código servido controla as
    chaves: acesso de escrita ao repositório/GitHub Actions/GitHub Pages
    ou um XSS pode capturar a frase no momento da digitação.
  - A proteção vale **contra o banco e o Worker**, não contra quem publica
    o front.
  - Mitigações: CSP, SRI, zero `innerHTML`, revisão obrigatória de
    mudanças em `msg-crypto.js`.
- **R5. Substituição de chave pelo servidor (MITM).** O servidor pode
  entregar uma pública falsa. Mitigações: TOFU com aviso de troca e
  número de segurança para conferência fora da plataforma.
- **R6. Metadados não são cifrados.** O servidor sabe:
  - quem fala com quem, quando e quanto;
  - o tamanho aproximado das mensagens (o preenchimento reduz isso);
  - o grafo de conexões.

  A Política precisa dizer isso claramente. O servidor também pode
  **descartar ou atrasar** mensagens sem que isso seja detectado na v1,
  mas **não pode forjá-las nem alterá-las** (AES-GCM + AAD).
- **R7. Latência e custo do polling.**
  - A latência é de até ~5 s com a conversa aberta.
  - Cada ciclo é 1 requisição ao Worker + 2 a 3 consultas HTTP ao Neon.
  - Custos:
    - consome a cota de requisições do Workers;
    - **impede o scale-to-zero do Neon** enquanto houver abas abertas.
  - Medir o consumo de compute no painel do Neon depois da 3f. Se ficar
    alto, antecipar o caminho v2.
- **R8. Banimento com vínculos em andamento.**
  - `banUser` já revoga as sessões.
  - Pedidos e conexões envolvendo a conta banida **não são apagados**:
    ficam invisíveis nas listagens (filtro `status = 'active'`) e os
    gatilhos recusam aceite e envio.
  - Pedidos pendentes expiram por TTL de 30 dias, filtrados na consulta,
    sem cron.
  - Um desbanimento dentro desse prazo restaura o estado.
  - O histórico de mensagens permanece, e a conversa mostra "conta
    indisponível".
- **R9. Exclusão de conta (prazo de 180 dias da Política).**
  - Hoje **não existe fluxo automatizado**: a exclusão é manual.
  - O plano inclui um roteiro de operação em `docs/DEPLOYMENT.md`:
    `DELETE FROM profiles WHERE id = ...`.
  - **Removido por CASCADE:** `messaging_keys`, `connections`,
    `profile_blocks`, `conversations` → `messages`, além do que já
    cascateia hoje.
  - **Vira NULL:** `profile_reports.reporter_id`/`reported_profile_id`
    (junto com `audit_logs` e votos, como já acontece).
  - **Antes do DELETE:**
    - limpar `details`/`evidence_excerpt` de denúncias já encerradas
      que envolvam a conta;
    - denúncias em aberto justificam segurar a exclusão, como a própria
      Política já prevê.
  - Lacuna **pré-existente**, fora do escopo: o avatar no R2 não é
    apagado por CASCADE e precisa estar no mesmo roteiro.
  - Conversas do outro participante: ver DP-8.
- **R10. Compatibilidade.**
  - X25519 na Web Crypto exige navegador de 2024/2025 em diante.
  - Detectar o suporte e mostrar "Seu navegador não suporta mensagens
    cifradas" em vez de falhar em silêncio.
- **R11. Ofuscação.** O `dist/` ofuscado pode se comportar diferente do
  fonte. O vetor dourado precisa ser verificado **no build publicado**
  (`scripts/serve-dist.js`), não só no fonte.
- **R12. Tamanho de `app.js`.** Vai passar de 2.000 linhas (achado MEDIUM
  pela regra do projeto).
  - **Mitigação v1:** crypto isolado em módulo próprio.
  - **Recomendado depois:** extrair a UI de mensageria para
    `frontend/messaging.js` com um namespace interno.
- **R13. Canais laterais na busca por telefone.**
  - A resposta é textualmente uniforme, mas o tempo de resposta não é
    garantidamente constante (mesma ressalva já documentada para login).
  - O rate limit (20/dia) limita a varredura.

### Decisões pendentes (consolidado)

- **DP-1 — Visitantes em conexões e mensagens?** (bloqueia 3a)
  - **Recomendação:** não. Só `member`/`admin`, que são contas já
    avaliadas pela administração.
  - Visitantes ainda veem perfis públicos e podem configurar a própria
    visibilidade.
- **DP-2 — Descoberta por telefone opt-in** (`phone_discoverable`
  padrão `false`) + atualização da Política. (bloqueia 3a)
  - O telefone foi coletado "para contato operacional"; usá-lo para
    descoberta é finalidade nova sob a LGPD.
- **DP-3 — O solicitante vê a lista de pedidos enviados?** (bloqueia 3a)
  - **Recomendação:** não. Se uma entrada aparecesse só quando o
    telefone existe, a lista viraria um oráculo de enumeração.
  - O solicitante só vê o vínculo depois de aceito.
  - A recusa não é informada. Um novo pedido ao mesmo alvo dentro de 30
    dias é ignorado, com a mesma resposta uniforme.
- **DP-4 — Denúncia pode anexar trecho da conversa?** (bloqueia 3a)
  - **Recomendação:** sim, opcional. O trecho é escolhido e enviado pelo
    próprio denunciante, que legitimamente tem o texto claro.
  - Na fila aparece como "fornecido pelo denunciante, não verificável
    criptograficamente".
  - Nenhum outro caminho dá a admins acesso a conteúdo.
- **DP-5 — Identidade básica (nome, username, avatar) no perfil
  público.** (3b)
  - **Recomendação:** visível para qualquer sessão autenticada (como já
    acontece hoje em comentários de tarefa).
  - Para não autenticados: só se o dono tornar ao menos um campo
    `public`. Caso contrário, 404 idêntico ao de inexistente.
- **DP-6 — X25519 em vez de P-256** (seção 3.1). (3d)
- **DP-7 — Não auditar cada mensagem enviada.** (3e)
  - É uma exceção à regra "toda mutação chama `logAudit`".
  - Motivos: volume, e metadado social duplicado numa tabela cujo
    `actor_id` sobrevive à exclusão.
  - Continuam auditados: publicação/rotação de chave, pedidos, respostas,
    bloqueios, denúncias e resoluções. Falhas de envio vão para
    `error_logs`.
- **DP-8 — Excluir uma conta apaga a conversa também para o outro
  participante (CASCADE).** (3e)
  - É a opção mais simples e a que honra integralmente a garantia de
    exclusão.
  - A alternativa (manter para o outro lado, anonimizado) exige
    preservar a pública do excluído e não é recomendada na v1.
- **DP-9 — Chave desbloqueada só em memória.** (3f)
  - Não persistir em IndexedDB, mesmo como não-extraível.
  - Custo: pedir a frase de novo a cada recarga.
- **DP-10 — Política mínima da frase.** (3d/3f)
  - Mínimo de 12 caracteres, recusa de frases triviais (repetição,
    sequências) e sugestão ativa do gerador de 5 palavras.

---

## 9. Plano de testes

Padrão existente:
- Jest ESM (`node --experimental-vm-modules`);
- `makeSql()` com `mockResolvedValueOnce` na ordem das chamadas;
- estrutura AAA;
- um arquivo de teste por service;
- os 73 testes atuais continuam verdes em toda sub-fase.

**3.0**
- `authService`/`security`: o touch estende apenas sessões válidas, não
  revogadas e não expiradas.
- O teto absoluto é respeitado.
- Sessão inválida → `AuthError`.

**3a — `worker/test/connectionService.test.js` e `moderationService.test.js`**
- Validação antes do banco: username com formato inválido; telefone
  vazio; ambos ou nenhum informado → `ValidationError` sem chamar `sql`.
- `visitor` → `ForbiddenError` (se DP-1 for aprovada).
- **Resposta idêntica** (mesmo objeto) para: alvo inexistente, telefone
  não descobrível, múltiplos resultados, alvo bloqueado/bloqueador,
  cooldown e pedido a si mesmo.
- `respondToRequest` por quem não é o `addressee` → nenhuma linha
  afetada → erro genérico.
- `blockProfile` executa um único statement (CTE).
- Unblock não recria a conexão.
- `submitReport`:
  - sem vínculo → `ForbiddenError`;
  - categoria fora da lista → `ValidationError`;
  - excesso de tamanho → `ValidationError`;
  - duplicata em aberto → `ConflictError`, traduzido do índice único.
- `listReports`/`resolveReport` exigem admin; transições inválidas →
  `ConflictError`.
- **`logAudit` nunca recebe telefone ou username digitado em `details`**:
  asserção explícita sobre os argumentos do mock.
- `handlers.test.js`: allowlist atualizada; `ctx` com IP repassado.
- **Integração (branch do Neon, roteiro manual via MCP; o projeto não tem
  infraestrutura de testes de banco):**
  - gatilho `guard_connection_write`;
  - índice `uq_connections_pair` nas duas direções;
  - `normalize_phone_br` com os formatos `(81) 9xxxx-xxxx`,
    `+55 81 9...`, `081...`.

**3b — `profileService.test.js` (estendido)**
- Visibilidade fora da lista fechada → `ValidationError`.
- Mapeamento de linha para resposta no `getPublicProfile` para os casos
  self, conexão, desconhecido autenticado e anônimo.
- Anônimo sem nenhum campo público → `NotFoundError` com **a mesma
  mensagem** de username inexistente e de bloqueado.
- **Integração na branch do Neon (obrigatória, porque a filtragem vive no
  SQL):** matriz 4 relações × 3 visibilidades × 4 campos, conferindo que
  o valor bruto não volta.

**3c (UI)**
- Checklist manual em dois navegadores com duas contas: pedido, aceite,
  recusa, bloqueio, denúncia, resolução admin, prévia de privacidade e
  deep link de perfil público deslogado.
- Opcional: Playwright para o fluxo pedido → aceite.

**3d**
- **`frontend/test/msg-crypto.test.js`** (Jest novo em
  `frontend/package.json`):
  - **vetor dourado**: frase + salt + profileId fixos → pública fixa.
    Esse teste congela a derivação para sempre; qualquer mudança
    acidental trancaria todos os usuários do lado de fora;
  - ida e volta de cifrar/decifrar;
  - AAD adulterado, IV trocado ou chave errada → falha;
  - IVs distintos em N cifragens;
  - NFKC: composições Unicode equivalentes → mesma chave;
  - iterações abaixo do piso → recusa;
  - preenchimento em múltiplos de 256;
  - chave de conversa simétrica (A→B == B→A).
- **`worker/test/messagingKeyService.test.js`:**
  - base64url inválido, tamanho decodificado ≠ 32 e salt curto →
    `ValidationError`;
  - `expectedCurrentVersion` desatualizado → `ConflictError`;
  - o salt **não** aparece em `getPeerMessagingKeys`;
  - pedir chave de alguém sem vínculo → `ForbiddenError`.
- **Spike manual:** o vetor dourado bate em Chrome desktop, Chrome
  Android, Firefox e Safari iOS, **no `dist/` ofuscado**.

**3e — `worker/test/messageService.test.js`**
- Payload malformado (iv ≠ 16 chars, ciphertext acima do limite, UUID
  inválido) rejeitado antes do banco.
- Não participante → `ForbiddenError`.
- Erros do gatilho traduzidos para mensagens genéricas: sem conexão,
  bloqueado, versão de chave desatualizada ("atualize a conversa").
- Reenvio com o mesmo `clientMessageId` → idempotente.
- `listMessages` respeita `LIMIT` e escolhe o cursor certo
  (`beforeId`/`afterId`).
- `markConversationRead` atualiza o lado correto do par.
- `sendMessage` **não** chama `logAudit` (DP-7) e nunca registra
  ciphertext/iv em nenhum log.
- **Integração (branch):** gatilho `guard_message_insert` com a matriz
  completa; CASCADE da exclusão de perfil removendo
  conversas/mensagens/chaves; SET NULL nas denúncias.

**3f (UI)**
- Checklist manual com duas contas em navegadores diferentes:
  - configuração da frase;
  - desbloqueio em outro aparelho com a mesma frase;
  - frase errada;
  - envio e recebimento por polling;
  - suspensão com a aba oculta;
  - rotação ("esqueci") → aviso de troca de chave para o contato;
  - histórico antigo legível para o contato e marcado como ilegível
    para quem rotacionou;
  - bloqueio no meio de uma conversa;
  - logout zera a chave (tentar ler depois exige a frase de novo);
  - CSP sem violações no console.
- Rodar `docs/SECURITY.md` pelo agente security-reviewer antes do deploy
  da 3f.
- Atualizar `docs/SECURITY.md` com uma seção "Mensageria E2EE" contendo
  R1–R6.

---

## 10. Revisão de segurança pré-implementação (achados e veredito)

Este plano passou por revisão do agente `security-reviewer` antes de
qualquer código ser escrito. Achado HIGH (cooldown de recusa) já foi
corrigido diretamente nas seções 2.1 e 5 acima. Os demais achados ficam
registrados aqui, com a seção onde cada um deve ser incorporado quando
essa sub-fase for implementada.

**Veredito do revisor:** prosseguir com mudanças específicas, sem
necessidade de redesenho profundo de nenhuma peça. A construção
criptográfica central (X25519 ECDH estático → HKDF → AES-GCM com AAD
vinculando conversa/remetente/versões/clientMessageId, chaves derivadas
não-extraíveis, privada nunca transmitida) é sólida e consistente com o
padrão de defesa em profundidade já usado no projeto (pré-checagem no
service + gatilho como autoridade final, filtragem de visibilidade com
parâmetros ligados). Nenhum achado restante bloqueia o início da 3a.

- **#2 (MEDIUM, Fase 3d) — Iterações do PBKDF2.** 600.000 é o piso mínimo
  da OWASP, não um alvo — e a seção 3.7 já tolera até ~2s no celular,
  ou seja, o orçamento de UX permite mais custo do que está sendo usado.
  **Ação para a 3d:** calibrar no cliente para um tempo-alvo (~0,8–1s) e
  usar o número de iterações resultante como padrão, mantendo 600.000
  só como piso mínimo recusado pelo cliente (`kdf_iterations` já é por
  versão de chave, não exige mudança de schema).
- **#3 (MEDIUM, Fase 3d) — `apiGetPeerMessagingKeys` sem checagem de
  bloqueio.** Ao contrário de `openConversation`/`sendMessage`, a tabela
  da seção 4 não exige "sem bloqueio" para essa ação — como o bloqueio
  só apaga a linha de `connections` (a conversa fica, para preservar
  histórico), uma conta bloqueada continuaria conseguindo buscar chaves
  **novas** rotacionadas da outra parte indefinidamente. **Ação:**
  adicionar a mesma condição de bloqueio já usada nas outras duas ações.
- **#4 (MEDIUM, Fase 3a) — Limites de taxa dimensionados para uma
  plataforma genérica, não para uma liga de poucas dezenas/centenas de
  membros.** `CONNECTION_REQUEST {20, 86400}` e `PUBLIC_PROFILE_IP {60,
  600}` permitem varrer a base inteira de membros em poucos dias, mesmo
  a partir de uma única conta legítima. **Ação:** reduzir
  `CONNECTION_REQUEST` (ex.: 5/dia, já que o uso normal é um punhado de
  pedidos no total) e adicionar um teto global (não só por IP) de
  buscas de perfil público por dia.
- **#5 (MEDIUM, Fase 3c) — Trecho de denúncia (DP-4) não verificável
  precisa de aviso explícito na hora da decisão do admin.** O plano já
  documenta que o `evidence_excerpt` é auto-declarado e não verificável
  criptograficamente, mas isso precisa aparecer como rótulo visível
  **no momento em que o admin decide**, não só na documentação — e
  `resolveReport` deveria considerar o histórico do próprio denunciante
  (denúncias anteriores arquivadas) antes de uma única denúncia embasar
  um banimento. **Ação:** UI do painel de denúncias sempre mostra
  "não verificável, fornecido pelo denunciante" junto ao trecho.
- **#6 (LOW/MEDIUM, Fase 3f) — TOFU só avisa na troca de chave, não no
  primeiro contato.** R5 já reconhece que o servidor poderia trocar a
  chave desde o início; o aviso proposto só dispara quando a versão
  ativa muda depois, não já na primeira vez que a conversa é aberta —
  que é exatamente o momento em que uma substituição inicial passaria
  despercebida. **Ação:** mostrar o número de segurança (não bloqueante)
  já na primeira abertura de uma conversa com cada contato, não só em
  rotações futuras.
- **#7 (LOW, Fase 3a, plano de testes) — `normalize_phone_br` sem
  unicidade pode mascarar múltiplos matches.** Se dois perfis
  normalizarem para o mesmo telefone (número compartilhado, caso de
  borda na normalização), a regra de "exatamente 1 resultado" vira um
  no-op silencioso sem erro pra ninguém — falha de forma segura, mas
  faltou como caso de teste explícito na seção 9. **Ação:** adicionar
  esse caso à lista de testes da 3a.
