/**
 * htmlTemplateSafety.test.js
 *
 * Regressão: já aconteceu DUAS vezes nesta base de código um comentário
 * explicando um risco de sintaxe conter, literalmente, a própria sintaxe
 * perigosa que ele descrevia:
 *
 *   1) Um comentário sobre risco de fechamento de <script> continha a
 *      substring "</script>" dentro de si, fechando o bloco de verdade e
 *      vazando texto como conteúdo visível da página.
 *   2) Um comentário sobre a tag de impressão do HtmlService continha a
 *      substring "<?= ?>" dentro de si — o HtmlService varre o arquivo
 *      procurando esse padrão como TEXTO BRUTO (não entende comentário de
 *      JS/HTML), então isso virou uma scriptlet vazia real que quebrou a
 *      geração do template em produção (erro só reproduzível no Apps
 *      Script de verdade, não em nenhum parser JS padrão — por isso não
 *      apareceu em nenhum teste anterior).
 *
 * Este teste varre o conteúdo inteiro de cada .html de src/ui e falha se
 * "</script" aparecer fora de uma tag de fechamento real, ou se "<?"
 * aparecer fora de uma scriptlet real e não-vazia do HtmlService.
 */
const fs = require('fs');
const path = require('path');

const UI_DIR = path.join(__dirname, '..', 'src', 'ui');

function listHtmlFiles() {
  return fs.readdirSync(UI_DIR).filter((f) => f.endsWith('.html'));
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) return count;
    count += 1;
    from = idx + needle.length;
  }
}

describe('Segurança de template HtmlService — nenhum comentário contém a sintaxe perigosa que descreve', () => {
  listHtmlFiles().forEach((file) => {
    const content = fs.readFileSync(path.join(UI_DIR, file), 'utf8');

    test(file + ': toda ocorrência de "</script" é uma tag de fechamento real', () => {
      const totalOccurrences = countOccurrences(content.toLowerCase(), '</script');
      const realClosingTags = countOccurrences(content, '</script>');
      expect(totalOccurrences).toBe(realClosingTags);
    });

    test(file + ': toda ocorrência de "<?" abre uma scriptlet real e não-vazia do HtmlService', () => {
      const totalOpenTags = countOccurrences(content, '<?');
      // Scriptlet real: "<?", opcionalmente "!", "=", espaços, e então
      // pelo menos um caractere que não seja espaço antes de "?>" (uma
      // scriptlet vazia como "<?= ?>" NÃO bate aqui, de propósito).
      const realScriptletPattern = /<\?!?=?\s*\S[\s\S]*?\?>/g;
      const realMatches = content.match(realScriptletPattern) || [];
      expect(totalOpenTags).toBe(realMatches.length);
    });
  });
});
