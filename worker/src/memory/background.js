/*
 * Plataforma de Membros LAIFT
 * © 2026 Daniel Pires Francisco. Todos os direitos reservados.
 * Licença proprietária: ver LICENSE na raiz do repositório.
 */
/**
 * memory/background.js
 * Trabalho de memória que NUNCA pode atrasar nem derrubar a resposta ao estudante (gravar o que aprendeu, drenar a
 * fila de exclusão). O index.js entrega `env.waitUntil` (ctx.waitUntil da requisição): o trabalho continua depois de a
 * resposta sair. Sem waitUntil (testes, scripts) devolve a promessa para o chamador aguardar. Qualquer falha é engolida
 * aqui: a memória é um extra, e perder um aprendizado é aceitável; atrasar ou quebrar a resposta, não.
 */
const swallow = () => undefined;

/**
 * @param {object} env  pode ter `waitUntil`
 * @param {Promise<unknown>|(() => Promise<unknown>)} work
 * @returns {Promise<void>|undefined}  undefined quando entregue ao waitUntil
 */
export function runInBackground(env, work) {
  let promise;
  try {
    promise = Promise.resolve(typeof work === 'function' ? work() : work).then(swallow, swallow);
  } catch (err) {
    return Promise.resolve();
  }
  if (env && typeof env.waitUntil === 'function') {
    try {
      env.waitUntil(promise);
      return undefined;
    } catch (err) {
      return promise;
    }
  }
  return promise;
}
