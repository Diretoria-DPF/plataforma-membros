# Atlas 3D — licenças dos modelos: assuntos pendentes

> **Status: só registro.** Por decisão do dono (2026-10-13), **nada foi aplicado
> nos modelos nem na tela de Créditos**. Este arquivo existe para que as
> atribuições e substituições possam ser feitas no futuro, sem refazer a
> auditoria. Origem: relatório "ATLAS — Licenças dos modelos — 2026-10-13"
> (auditoria técnica somente leitura; **não é parecer jurídico**).

Resumo em uma frase: há partes dos GLBs com licença **não comercial (NC)** ou
**desconhecida**, e o app declara tudo como CC BY-SA 4.0. Para estudo gratuito
o risco é baixo; para **cobrança (ou contribuição por acessos maiores)** vira
um impedimento — ver o checklist "Antes de cobrar" no fim.

## 1. O que é suspeito (inferência forte, não prova definitiva)

O `License.txt` do Z-Anatomy (idêntico no commit `38649f41…`, que é o
`sourceVersion` dos GLBs, e na `master`) declara tudo como CC BY-SA 4.0 e lista
modelos de terceiros incluídos "e adaptados". Dois deles são NC. Os nomes
abaixo batem com os objetos dos GLBs; o `.blend` não guarda procedência por
objeto, então a associação é por nome + README + projeto derivado público.

### 1.1 Oito estruturas suspeitas de licença NC

| Arquivo | Nó GLB | sid | Origem provável | Licença |
|---|---|---|---|---|
| `models/zanatomy/urinario.glb` | `Kidney.l` / `Kidney.r` | `za:kidney-l` / `za:kidney-r` | "Kidney", Lissie Cowley | CC BY-NC 4.0 |
| `models/zanatomy/urinario.glb` | `Renal pelvis.l` / `.r` | `za:renal-pelvis-l` / `-r` | idem | CC BY-NC 4.0 |
| `models/zanatomy/nervoso.glb` | `Cochlea.l` / `.r` | `za:cochlea-l` / `-r` | "Anatomy of the Inner Ear", Univ. de Dundee | CC BY-NC-SA 4.0 |
| `models/zanatomy/nervoso.glb` | `Vestibule.l` / `.r` | `za:vestibule-l` / `-r` | idem | CC BY-NC-SA 4.0 |

Os LOD1 (`*.lod1.glb`) têm os mesmos nós. Suspeitos de menor grau (origem não
provada): `Cochlear nerve`, `Tympanic membrane.l/.r`, `Auditory tube.l/.r`. Os
ossículos (`Incus/Malleus/Stapes`) e a bexiga (`Urinary bladder`) **não** estão
na lista NC.

### 1.2 174 nós de cérebro de licença desconhecida

No `nervoso.glb`: materiais `Brain-Inner` (129 nós) + `White matter` (32) +
`Brain` (13) = **174** — exatamente os objetos que o issue #10 do Z-Anatomy
associa a "Brainder / White matter" (Univ. de Washington), **sem licença
informada** (a pergunta pública segue sem resposta). Sem licença = todos os
direitos reservados por padrão. A identificação por material é inferência:
alguns (Pons, bulbo, hipotálamo) podem ser obra original do Z-Anatomy.

### 1.3 `body.glb` sem origem documentada

`models/body.glb` (reserva do app; vem do repositório legado `o-bala-vip`) tem
só materiais `Mat_Bone_Pro`/`Mat_Muscle_Pro` (269 ossos, 557 músculos), sem rim,
cóclea, vestíbulo ou cérebro. A procedência original **não está documentada**
(o código só diz "Z-Anatomy, CC BY-SA"); ele não consta do `manifest.json` nem
de `ATTRIBUTION.md`.

### 1.4 O que não foi encontrado

HRA (`models/hra/*`, CC BY 4.0): sem itens NC. Dentes e demais estruturas OMF:
nenhum indício de terceiro NC. Fora os itens acima, o restante (~2,2 mil
estruturas) não tem problema identificado.

## 2. Lacunas de atribuição no app (hoje)

Arquivos: `frontend/modulos/anatomia-3d/models/LICENSES/ATTRIBUTION.md`,
`NOTICE.md` §2, `js/ui/credits.js` (modal "Créditos e licenças"),
`tools/atlas-pipeline/write-licenses.mjs`.

- Faltam os **terceiros** do `License.txt`: **Dundee** (orelha interna, NC-SA; e
  "Cranial Nerves", CC BY), **Cowley** (rim, NC) e **Univ. de Washington**
  (Brainder/White matter, sem licença). "Tudo CC BY-SA 4.0" nos GLBs que os
  contêm é uma declaração inexata.
- **BodyParts3D** (CC BY-SA 2.1 Japan) não é citado, embora o `License.txt`
  exija o crédito; o texto da licença previsto em `SOURCES.md` §3 não existe em
  `LICENSES/`.
- **Alterações não indicadas** (conversão Blender→GLB, simplificação, LOD,
  quantização, meshopt) — a CC BY exige indicar.
- `LICENSE_LABELS/URLS` do modal só conhecem BY-SA-4.0, BY-4.0 e CC0: uma
  licença NC apareceria sem rótulo nem link.
- `body.glb` não aparece em `manifest.json` nem na lista de créditos.
- O texto de share-alike ("sob a mesma licença") contradiz os GLBs com partes
  NC/NC-SA (não se relicencia a parte NC como BY-SA).

## 3. Risco para uso comercial futuro

O dono prevê **contribuição por acessos maiores**. CC BY-NC/BY-NC-SA proíbem
uso "voltado primariamente a vantagem comercial"; cobrança, mensalidade ou
contribuição obrigatória tende a configurar uso comercial e a invalidar o
direito de distribuir Kidney, Renal pelvis, Cochlea e Vestibule — e mesmo
"gratuito com contribuição" cai numa zona cinzenta. Outros pontos:

- O Z-Anatomy republica essas obras NC dentro de um pacote declarado BY-SA; a
  declaração "tudo BY-SA" do upstream já é questionável e herdá-la não protege
  a LAIFT.
- BY-SA 2.1 JP (BodyParts3D) → 4.0: compatibilidade formal não validada.
- Os 174 nós do cérebro são um risco independente de NC.
- Pergunta jurídica já aberta como **P3** em `docs/cortex/PERGUNTAS-ABERTAS.md`.

## 4. Opções (nenhuma aplicada)

| # | Opção | Observação |
|---|---|---|
| 1 | **Remover** os nós suspeitos do pipeline e reexportar | Perde 8 objetos + fichas/quiz ligados a esses sids (checar `content/urinario.json`, `curated/nervoso.json`). Decidir também sobre os 174 do cérebro. |
| 2 | **Substituir pelo HRA (CC BY 4.0)** | Rim: o HRA já está no Atlas para o rim esquerdo feminino; dá para adicionar o direito/masculino pelo mesmo mecanismo. Cérebro: `hra/brain-female.glb` (Allen, 283 nós) pode substituir os 174. Orelha interna: não há alternativa HRA. |
| 3 | **Substituir por BodyParts3D (CC BY-SA 2.1 JP)** | Rim e orelha; exige texto de licença próprio e confirmar compatibilidade. Anatomia mais simples. |
| 4 | **Modelo próprio/contratado** (CC BY ou proprietário) | Maior custo, risco zero de terceiros. |
| 5 | **Rotular como esquemático/"uso não comercial" com flag que desliga** | Mitiga, não resolve o dia em que a plataforma monetizar. |
| 6 | **Pedir permissão** aos autores (Cowley; Dundee/CAHID; Univ. de Washington) e perguntar ao Z-Anatomy a procedência por objeto | Complemento; não confiar como única saída. |
| 7 | **Corrigir a atribuição** (independe das outras) | Acrescentar BodyParts3D, os 3 terceiros (com NC onde aplicável), "alterações feitas", `body.glb`, e ajustar a nota de share-alike. |

Ordem sugerida no relatório: (7) assim que possível; (1)+(2) para rim e cérebro
antes de qualquer cobrança; (4)/(6) para a orelha interna; manter no pipeline
uma lista de exclusão para esses nós.

## 5. Checklist "antes de cobrar"

Nenhum item abaixo foi feito. Marque quando for.

- [ ] Parecer jurídico sobre uso comercial de CC BY-NC / BY-NC-SA e sobre
  "contribuição por acessos maiores" (P3).
- [ ] Decidir e executar uma das opções 1–4 para **Kidney, Renal pelvis,
  Cochlea, Vestibule** (e os suspeitos de menor grau, se a origem for confirmada).
- [ ] Resolver os **174 nós de cérebro** (substituir pelo HRA, remover ou obter
  licença por escrito).
- [ ] Documentar (ou substituir/remover) a origem do **`body.glb`**.
- [ ] Corrigir a **tela de Créditos**, `ATTRIBUTION.md`, `NOTICE.md` e
  `write-licenses.mjs`: Dundee, Cowley, Univ. de Washington, BodyParts3D,
  alterações feitas, `body.glb`, rótulos/links de licenças NC.
- [ ] Reescrever a nota de share-alike para não afirmar "tudo na mesma licença".
- [ ] Incluir o texto de licença do BodyParts3D em `models/LICENSES/`.
- [ ] Pedir autorização aos autores, se a opção 6 for adotada, e guardar a
  resposta no repositório.
- [ ] Reexportar os GLBs (e os LOD1), regenerar o manifest, as fichas e o
  quiz, e rodar `atlas:validate` e as suítes e2e do Atlas.
- [ ] Conferir que a flag/lista de exclusão do pipeline impede a volta dos nós
  removidos em uma nova exportação.

## 6. O que a auditoria não conseguiu verificar

Qual malha do Z-Anatomy é de fato a do Cowley/Dundee (sem metadado por
objeto); a licença de Brainder/White matter; se o pipeline descaracterizou a
geometria (simplificação/LOD não muda a licença da obra de origem); e a licença
original do Cowley fora das fontes do próprio Z-Anatomy. Nenhuma consulta ao
Z-Anatomy foi feita.
