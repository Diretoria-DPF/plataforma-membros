> **MINUTA — RECOMENDA-SE REVISÃO JURÍDICA ANTES DE TRATAR COMO DEFINITIVA.**
> Este texto foi redigido com base na Lei Geral de Proteção de Dados
> (Lei nº 13.709/2018 — LGPD) e nos dados efetivamente coletados por esta
> plataforma. Não substitui aconselhamento jurídico profissional — antes de
> publicar como versão final, um advogado deveria revisar especialmente as
> cláusulas de retenção, base legal e os canais de atendimento a titulares.

# Política de Privacidade — Plataforma de Membros LAIFT

**Versão: 2026-09-25** (deve corresponder exatamente a
`LEGAL_VERSIONS.PRIVACY` em `worker/src/constants.js` — atualize os dois
juntos sempre que o texto mudar de forma material; o aceite de uma versão
anterior fica preservado no histórico de consentimentos, nunca é
retroativamente alterado).

## 1. Quem é o controlador dos dados

Esta plataforma é operada pela **Liga Acadêmica Interdisciplinar de
Farmacologia e Toxicologia (LAIFT)**, associação estudantil vinculada ao
curso de Farmácia. Para qualquer assunto relacionado a esta Política ou
ao tratamento dos seus dados pessoais, o canal de contato é:
**laiftligauninassau@gmail.com**.

## 2. Dados que coletamos

**No cadastro (obrigatórios):** nome de usuário, nome completo, e-mail,
telefone e senha — a senha nunca é armazenada em texto puro, apenas como
hash criptográfico (`bcrypt`, calculado inteiramente no banco de dados via
`pgcrypto`, nunca no seu navegador ou em nossos servidores de aplicação).

**No cadastro (opcionais):** foto de perfil (avatar), perfil do LinkedIn,
usuário do Instagram, escolaridade e áreas de interesse. Campos opcionais
podem ser deixados em branco sem impedir o cadastro.

**Durante o uso:** preferência de tema da interface, inscrições em
eventos, propostas enviadas, votos (o voto em si é vinculado à sua conta
para impedir duplicidade — ver seção 6 sobre como isso é protegido),
adesões a tarefas, comentários e mensagens de feedback enviadas por você.

**Gerados automaticamente pelo sistema, nunca inseridos por você:**
registros de auditoria de ações administrativas e de autenticação
(associados a um identificador de conta, nunca ao conteúdo de senha ou
token), e registros técnicos de erro para diagnóstico.

## 3. Para que usamos cada dado (finalidade e base legal)

| Dado | Finalidade | Base legal (LGPD, art. 7º) |
|---|---|---|
| E-mail, senha (hash) | Autenticar seu acesso e proteger sua conta | Execução de contrato / procedimento preliminar (inciso V) |
| Nome completo, nome de usuário, telefone | Identificar você perante a comunidade da liga e permitir contato em caso de necessidade operacional | Execução de contrato (inciso V) |
| Avatar, LinkedIn, Instagram, escolaridade, interesses | Enriquecer seu perfil e facilitar conexão entre membros — sempre opcionais | Consentimento (inciso I), livremente revogável a qualquer momento |
| Inscrições, votos, adesões, propostas, feedback | Operar as funcionalidades de governança da liga (eventos, votação, tarefas) que você escolheu usar | Execução de contrato (inciso V) |
| Registros de auditoria e erro | Segurança da plataforma, prevenção a fraude e investigação de incidentes | Legítimo interesse do controlador (inciso IX), limitado ao mínimo necessário |

## 4. O que NÃO fazemos

- Não vendemos nem compartilhamos seus dados pessoais com terceiros para
  fins de marketing ou publicidade.
- Não usamos seus dados para nenhuma finalidade além das listadas na
  seção 3.
- Não armazenamos sua senha em texto puro em nenhum momento, em nenhum
  sistema, por nenhuma razão.
- Não exibimos telefone, e-mail completo ou hash de senha em nenhuma
  listagem — nem para outros membros, nem para administradores, além do
  estritamente necessário para a própria pessoa gerir a própria conta.
- Não usamos cookies de rastreamento nem ferramentas de analytics de
  terceiros.

## 5. Onde os dados ficam e como são protegidos

Os dados são armazenados em um banco de dados PostgreSQL hospedado pelo
provedor **Neon**, acessado por um backend em **Cloudflare Workers** —
ambos com conexão sempre criptografada (TLS). Senhas passam por hash
criptográfico antes de qualquer armazenamento. Toda ação sensível exige
sessão autenticada validada a cada chamada contra o banco de dados — nunca
apenas contra informação enviada pelo próprio navegador. Detalhes técnicos
completos, incluindo riscos residuais reconhecidos e como são mitigados,
estão documentados publicamente em `docs/SECURITY.md` deste repositório.

## 6. Sessão e armazenamento no seu navegador

Para evitar que você precise fazer login toda vez que abrir a página, o
token de sessão (um valor opaco, sem significado fora desta plataforma)
fica salvo no armazenamento local do seu navegador (`localStorage`) por
**até 30 minutos**, expirando e sendo apagado automaticamente depois
disso — o mesmo prazo de validade que o servidor já aplica à sessão. Esse
token não é uma senha nem contém dado pessoal legível; sozinho, ele só
funciona enquanto a sessão correspondente ainda for válida no servidor.
Ao fazer logout, esse token é apagado imediatamente.

## 7. Retenção e exclusão dos seus dados

Você pode solicitar a exclusão da sua conta e dos dados pessoais
vinculados a ela a qualquer momento, pelo canal de contato da seção 1.
**A exclusão é concluída em até 180 (cento e oitenta) dias contados da
solicitação.** Esse prazo existe para permitir verificação de identidade
de quem solicita, resolução de eventuais pendências (ex.: apuração de uma
denúncia em andamento envolvendo a conta) e para cumprir obrigação legal
de guarda de registros de auditoria de segurança pelo prazo mínimo exigido
pela legislação aplicável.

Após a exclusão: dados de identificação pessoal (nome, e-mail, telefone,
avatar, redes sociais) são apagados ou anonimizados de forma
irreversível. Registros de auditoria, votos e participações em decisões
coletivas da liga podem ser mantidos de forma **anonimizada** (o vínculo
com você é desfeito, mas o registro histórico da decisão em si permanece),
por constituírem parte do histórico de governança da organização.

Enquanto sua conta estiver ativa, você mesmo pode consultar e editar
telefone, cidade, escolaridade, redes sociais, interesses e preferências
diretamente na seção "Meu perfil" — sem precisar de nenhuma solicitação.

## 8. Seus direitos como titular dos dados (LGPD, art. 18)

Você tem direito a, mediante solicitação ao canal de contato da seção 1:
confirmação da existência de tratamento; acesso aos dados; correção de
dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou
eliminação de dados desnecessários ou tratados em desconformidade com a
LGPD; portabilidade dos dados a outro fornecedor, mediante requisição
expressa; eliminação dos dados tratados com base no seu consentimento
(observado o prazo da seção 7); informação sobre com quem seus dados
foram eventualmente compartilhados; informação sobre a possibilidade de
não fornecer consentimento e as consequências disso; e revogação do
consentimento a qualquer momento, para os dados cuja base legal seja o
consentimento (ver tabela da seção 3).

Respondemos solicitações de titulares em prazo razoável, observado o
volume de pedidos e a necessidade eventual de verificar sua identidade
antes de agir sobre a conta.

## 9. Violação de política e banimento de conta

O uso da plataforma em desacordo com esta Política, com os
[Termos de Uso](TERMOS_DE_USO.md) ou com o
[Código de Conduta](TERMOS_DE_USO.md#c%C3%B3digo-de-conduta) pode resultar
em **banimento da conta**, a critério da administração da liga, sem
prejuízo de outras medidas cabíveis. Uma conta banida perde acesso a
qualquer recurso autenticado da plataforma; os dados pessoais associados
continuam protegidos por esta Política e sujeitos aos mesmos direitos de
titular descritos na seção 8, inclusive ao direito de solicitar exclusão.

## 10. Alterações desta Política

Alterações materiais geram uma nova versão numerada por data. O aceite de
uma nova versão é solicitado a partir de então; o registro do aceite de
versões anteriores é preservado no seu histórico de consentimentos, nunca
apagado ou reescrito.

## 11. Autoridade Nacional de Proteção de Dados (ANPD)

Caso você entenda que sua solicitação não foi adequadamente atendida pelo
canal da seção 1, você tem o direito de peticionar diretamente à
Autoridade Nacional de Proteção de Dados (ANPD), nos termos da LGPD.
