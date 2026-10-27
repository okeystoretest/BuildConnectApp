import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * O que o empacotador do Next reescreve e ninguém percebe.
 *
 * `require.resolve("pacote/arquivo")` NÃO sobrevive ao webpack: ele é trocado
 * pelo ID NUMÉRICO do módulo. O código continua compilando, o teste unitário
 * continua passando — porque o `tsx` compila para CJS, onde `require.resolve`
 * é a função de verdade — e a quebra só aparece em runtime, dentro do Next.
 *
 * Foi exatamente o que aconteceu com `standardFontDataUrl` no visor de
 * documentos: `path.dirname(15754)` estourava ERR_INVALID_ARG_TYPE em TODO
 * PDF. Imagem continuava abrindo, porque nem chega no pdfjs — então a falha
 * passou por lint, tipo, build, pelos testes e por uma conferência no
 * navegador feita com PNG.
 *
 * Este teste lê o CÓDIGO-FONTE, no mesmo molde de `auth/session-usage`:
 * é a única forma de prender uma regra sobre o que o empacotador faz.
 */

const RAIZ = path.join(process.cwd(), "src");

/** `require.resolve(...)`, em qualquer espaçamento. */
const USA_REQUIRE_RESOLVE = /\brequire\s*\.\s*resolve\s*\(/;

function arquivosTs(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) achados.push(...arquivosTs(alvo));
    else if (/\.tsx?$/.test(entrada.name)) achados.push(alvo);
  }
  return achados;
}

test("require.resolve não é usado em src — o webpack o troca por um número", () => {
  const infratores = arquivosTs(RAIZ)
    .filter((arquivo) => !arquivo.endsWith("bundler-safety.test.ts"))
    .filter((arquivo) => USA_REQUIRE_RESOLVE.test(readFileSync(arquivo, "utf-8")))
    .map((arquivo) => path.relative(process.cwd(), arquivo));

  assert.deepEqual(
    infratores,
    [],
    "Monte o caminho a partir de process.cwd(): require.resolve vira o ID do módulo no build do Next.",
  );
});
