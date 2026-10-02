# Post-mortem — Onda 2 "Primeira impressão" (modelo)

Fazer **1 semana depois** do merge em produção (reunião de 1 h). Sem post-mortem, a Onda 3 não começa.

- **Data da reunião:** ___ · **Participantes:** ___
- **PR:** ___ · **Data do merge (produção):** ___

## 1. Métricas (Plano v4, Parte I.1)
| Métrica | Meta | Medido | Como mediu |
|---|---|---|---|
| Conclusão da apresentação | ≥ 60% | ___ | testes com alunos (3) |
| Tempo até a 1ª seleção | ≤ 30 s | ___ | testes com alunos |
| Travas sem resposta | 0 em 3 sessões | ___ | observação |
| Nota de utilidade | ≥ 4,0 | ___ | testes com alunos |
| Esqueleto em Fast 3G | < 15 s | ___ | `atlas-prod-check` (produção) |
| Transferido na abertura | < 2 MB | ___ | `atlas-prod-check` |
| Axe (sérias/críticas) | 0 | ___ | CI `atlas-a11y` |
| Bugs bloqueantes no aparelho real | 0 | ___ | `docs/atlas-qa/ios.md` |

## 2. Riscos (Plano v4, Parte II)
| Risco | Aconteceu? | O que vimos | Ação |
|---|---|---|---|
| R1 Apresentação irrita | | | |
| R2 Dica vira ruído | | | |
| R3 Barra de progresso volta | | | |
| R4 Pulso trava aparelho fraco | | | |
| R5 Selo confunde | | | |
| R6 Retomada do quiz quebra | | | |
| R7 Teste humano sem achados | | | |
| R8 Sem WebGL 2 | | | |
| R9 Abertura > 2 MB | | | |
| R10 Rollback falha | | | |

## 3. O que funcionou / o que não funcionou
- ___

## 4. Decisão
- [ ] Onda 3 começa · [ ] adia (motivo: ___) · [ ] volta para corrigir (itens: ___)
