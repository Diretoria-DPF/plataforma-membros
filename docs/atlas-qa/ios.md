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

Vibração ao tocar (Onda 2) não existe no iOS — é esperado.
