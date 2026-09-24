> **MINUTA PARA REVISÃO JURÍDICA — NÃO CONSTITUI ACONSELHAMENTO JURÍDICO.**
> Este texto foi redigido como ponto de partida técnico (inclusive quanto a
> terminologia de proteção de dados) e **precisa ser revisado por um
> profissional de direito**, especialmente quanto à adequação a legislação
> de proteção de dados pessoais aplicável à sua jurisdição, antes de ser
> considerado definitivo.

# Política de Privacidade — Plataforma de Membros

**Versão: 2026-09-24** (deve corresponder exatamente a
`App.Constants.LEGAL_VERSIONS.PRIVACY` em `src/Constants.gs`).

## 1. Dados que coletamos

No cadastro: nome completo, e-mail, telefone, senha (armazenada apenas como
hash criptográfico, nunca em texto puro), e opcionalmente cidade e
escolaridade. Durante o uso: preferências de interface (tema, densidade,
notificações), inscrições em eventos, propostas enviadas, votos, adesões a
tarefas e mensagens de feedback.

## 2. Como os dados são usados

- **Autenticação e segurança da conta:** e-mail e senha (hash) para login;
  telefone não é usado para autenticação nesta versão.
- **Funcionamento da plataforma:** exibir eventos/propostas/tarefas
  relevantes para o seu papel, registrar sua participação (inscrições,
  votos, adesões).
- **Comunicação essencial:** e-mails de confirmação de conta e de
  redefinição de senha são sempre enviados, independentemente das
  preferências de notificação (são parte do funcionamento da conta, não
  marketing).
- **Auditoria e segurança:** ações administrativas e de autenticação são
  registradas com identificador de conta (não com telefone/e-mail
  completo/senha) para fins de segurança e responsabilização.

## 3. O que NÃO fazemos

- Não vendemos nem compartilhamos seus dados pessoais com terceiros para
  fins de marketing.
- Não armazenamos sua senha em texto puro em nenhum momento — apenas um
  hash criptográfico (`bcrypt`, via `pgcrypto` no Postgres) é persistido.
- Não exibimos telefone, e-mail completo ou hash de senha nas listagens
  administrativas além do estritamente necessário para a tarefa de gestão
  de conta.

## 4. Onde os dados ficam

Os dados são armazenados em um banco de dados PostgreSQL hospedado pelo
provedor Neon. O acesso ao banco é restrito por credencial e conexão
criptografada (TLS); ver `docs/SECURITY.md` para detalhes técnicos e
riscos residuais reconhecidos.

## 5. Retenção

- Dados operacionais (inscrições em eventos, adesões a tarefas) são
  removidos junto com o evento/tarefa relacionado ou com a conta, conforme
  a tabela.
- Registros de auditoria e votos individuais são mantidos como parte do
  histórico de governança da organização mesmo que a conta relacionada
  deixe de existir no futuro (o vínculo com a pessoa é desfeito, mas o
  registro do evento/voto em si permanece) — ver a justificativa técnica
  de cada política de exclusão em `sql/001_schema.sql`.

## 6. Seus direitos

Você pode, a qualquer momento enquanto sua conta estiver ativa: consultar
e editar seu nome, telefone, cidade, escolaridade e preferências
diretamente na plataforma (seção "Meu perfil"). Para solicitar alteração de
e-mail, exclusão de conta ou exportação de dados pessoais fora do que a
interface oferece diretamente, contate a administração da organização
responsável por esta implantação — esses fluxos ainda não têm uma tela
dedicada nesta versão (V1).

## 7. Cookies e armazenamento no navegador

Esta aplicação **não usa cookies de rastreamento**. O token de sessão é
mantido apenas em memória no navegador durante o uso (nunca em
`localStorage`/`sessionStorage`) — ver justificativa técnica completa em
`docs/SECURITY.md`.

## 8. Alterações desta Política

Alterações materiais geram uma nova versão numerada por data. O aceite de
uma nova versão é solicitado apenas para contas cadastradas a partir dessa
data; o registro do aceite de versões anteriores é preservado no histórico.

## 9. Contato

Dúvidas ou solicitações sobre seus dados pessoais devem ser dirigidas à
administração da organização responsável por esta implantação.
