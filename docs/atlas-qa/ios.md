# Checklist de aparelho físico — Atlas 3D

Uma rodada por onda, alternando **iPhone (Safari)** e **Android (Chrome)**. Anote ✅/❌ e o modelo do aparelho; para cada ❌, use o modelo de relato de bug de `docs/ATLAS_PLANO_RECUPERACAO.md`.

| # | Passo | Esperado | Observação iOS |
|---|---|---|---|
| 1 | Abrir Aprender → Anatomia (com 4G) | Esqueleto visível em ≤ 5 s; músculos aparecem logo depois | — |
| 2 | Abrir em 3G/economia de dados ligada | Só o esqueleto; ligar Camadas → Músculos baixa os músculos | iOS não informa a conexão: lá os músculos sempre vêm em segundo plano |
| 3 | Barra lateral: Camadas, Isolar, ⋯ | 3 botões; ⋯ abre a folha "Ferramentas" embaixo, botões grandes | Conferir que a folha não fica sob a barra inferior do Safari (`env(safe-area-inset-bottom)`) |
| 4 | Tocar fora da folha | Fecha sem selecionar estrutura | — |
| 5 | Selecionar uma estrutura → Isolar → "Desfazer" | Tudo volta | — |
| 6 | Quiz: tocar no órgão certo do 1º caso | "Acerto!" com o nome da estrutura | — |
| 7 | Trocar de app por 1 min e voltar | O 3D continua (ou mostra "Recarregando o 3D…" e volta) | Safari descarta o contexto WebGL com mais frequência |
| 8 | Fechar a aba e abrir de novo | Oferece "Continuar de onde parou"; "Continuar" repõe a seleção | Safari (ITP) pode apagar o armazenamento após 7 dias sem uso — aceitável |
| 9 | Girar para paisagem | Barra em linha embaixo, à esquerda da aba do painel; nada cortado | Conferir a altura com a barra de endereço visível e escondida (`dvh`) |
| 10 | Ajustes → Acessibilidade → Reduzir movimento ligado | Sem animações de câmera longas | — |
| 11 | VoiceOver/TalkBack: navegar pela barra e pela ficha | Cada botão é lido com nome em português | — |

## Itens da Onda 2
| # | Passo | Esperado | Observação iOS |
|---|---|---|---|
| 12 | Abrir o atlas "zerado" (janela privada) | Apresentação de 3 telas em tela cheia, sem texto cortado; "Pular" visível em todas | Conferir com a barra de endereço visível e escondida |
| 13 | Abrir de novo | A apresentação não volta | Safari pode apagar o armazenamento após 7 dias sem uso (ITP) — aí ela volta, aceitável |
| 14 | Ligar uma camada nova (ex.: Linfático) | Linha de progresso sob a barra do topo; no celular, "Carregando linfático…" no lugar do título; some ao terminar | — |
| 15 | Tocar numa estrutura | Destaque pisca rapidinho; vibração curta (Android); dica "Deslize a ficha…" na 1ª vez | iOS não vibra — esperado |
| 16 | Ficha no painel: selos e "Ver mais" | Nome, sistema, lado, selo de revisão; "Ver mais" abre a ficha | — |
| 17 | Quiz: errar de propósito | Cartão treme, resposta certa + explicação, botão "Próximo caso" | — |
| 18 | Android: botão Voltar com a ficha aberta | Fecha o painel/limpa a seleção; só depois sai do atlas | iOS: gesto de voltar do Safari sai da página (sem equivalente) |
| 19 | Celular deitado: tocar numa estrutura | A ficha aparece no painel lateral | — |
| 20 | Ajustes → Acessibilidade → Reduzir movimento | Sem pulso, sem confete, seta do painel parada | — |

