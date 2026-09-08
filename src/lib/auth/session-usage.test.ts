import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * `getSession` fica dentro do módulo de auth.
 *
 * O cookie é a fotografia do login: assinado e com prazo, mas cego para o que
 * mudou depois. Só `getCurrentUser` e `getVerifiedSession` comparam o
 * `sessionVersion` com o banco, e é essa comparação que faz desligamento,
 * troca de senha e rebaixamento valerem na requisição SEGUINTE, em vez de
 * esperarem o token vencer.
 *
 * A rota de /uploads chamava `getSession` direto e, por isso, seguia
 * entregando o acervo — documentos do DHO, comprovantes, evidências de
 * denúncia — a quem já tinha sido desligado, por até oito horas. Este teste
 * não é sobre aquela rota, que já foi corrigida: é sobre a próxima que nascer.
 *
 * Casa o IMPORT, não a menção: três arquivos citam `getSession` em comentário
 * justamente para explicar por que não o usam.
 */

const RAIZ = path.join(process.cwd(), "src");
const MODULO_DE_AUTH = path.join("lib", "auth");

/** Import de getSession, inclusive quebrado em várias linhas. */
const IMPORTA_GET_SESSION = /import\s*(?:type\s*)?\{[\s\S]*?\bgetSession\b[\s\S]*?\}\s*from/;

function arquivosTs(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const alvo = path.join(dir, entrada.name);
    if (entrada.isDirectory()) {
      achados.push(...arquivosTs(alvo));
    } else if (/\.tsx?$/.test(entrada.name)) {
      achados.push(alvo);
    }
  }
  return achados;
}

test("getSession não é importado fora de src/lib/auth", () => {
  const infratores = arquivosTs(RAIZ)
    .filter((arquivo) => !path.relative(RAIZ, arquivo).startsWith(MODULO_DE_AUTH))
    .filter((arquivo) => IMPORTA_GET_SESSION.test(readFileSync(arquivo, "utf-8")))
    .map((arquivo) => path.relative(process.cwd(), arquivo));

  assert.deepEqual(
    infratores,
    [],
    "Use getCurrentUser ou getVerifiedSession: eles revalidam o sessionVersion no banco.",
  );
});
