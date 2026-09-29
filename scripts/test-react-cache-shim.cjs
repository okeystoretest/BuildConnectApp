/**
 * Preload dos testes de banco.
 *
 * `react@18.3` NÃO exporta `cache`: é uma API de servidor que o Next injeta
 * no runtime dele. Módulos do projeto a usam no topo do arquivo — por
 * exemplo `src/lib/auth/access.ts` — então qualquer teste que os importe
 * quebraria ao CARREGAR, antes de rodar asserção alguma.
 *
 * Aqui `cache` vira a identidade. Fora de uma requisição não há o que
 * memoizar por requisição, e chamar a função duas vezes é exatamente o
 * comportamento correto num teste.
 */
const React = require("react");
if (typeof React.cache !== "function") {
  React.cache = (fn) => fn;
}
