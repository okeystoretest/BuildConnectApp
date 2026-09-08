import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BYTES, MAX_REQUEST_BYTES, maxMb, validateUploadSizes } from "./limits";

/**
 * A conferência que faltava.
 *
 * Sem ela, escolher um arquivo grande demais rendia minutos de barra de
 * progresso e uma tela genérica de "Algo deu errado": a validação de tamanho
 * mora DENTRO da Server Action, e a requisição era abortada pelo middleware
 * (10 MB, padrão do Next) muito antes de chegar lá.
 *
 * Os casos são escritos em cima das constantes, e não de números soltos, para
 * continuarem valendo quando os tetos mudarem.
 */

test("tudo dentro do limite passa", () => {
  assert.equal(
    validateUploadSizes([
      { label: "O vídeo", bytes: MAX_BYTES.video - 1, max: MAX_BYTES.video },
    ]),
    null,
  );
});

test("arquivo isolado acima do teto é recusado, citando o campo", () => {
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: MAX_BYTES.video + 1, max: MAX_BYTES.video },
  ]);
  assert.ok(erro, "deveria recusar");
  assert.match(erro, /^O vídeo tem/);
  assert.match(erro, /limite é/);
});

test("a soma estoura mesmo com cada arquivo dentro do seu teto", () => {
  // O que motivou o MAX_REQUEST_BYTES: os arquivos vão no MESMO FormData, e o
  // teto do corpo vale para o conjunto. Valores sintéticos de propósito — o
  // caso precisa continuar sendo testado mesmo quando nenhuma combinação REAL
  // de tetos estoura, que é a situação desejada (ver o invariante abaixo).
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: MAX_REQUEST_BYTES, max: MAX_REQUEST_BYTES },
    { label: "A instrução escrita", bytes: 1, max: MAX_REQUEST_BYTES },
  ]);
  assert.ok(erro, "deveria recusar pela soma");
  assert.match(erro, /somam/);
});

test("o pior envio LEGÍTIMO do modal de vídeo cabe no corpo da requisição", () => {
  // Vídeo + instrução escrita + transcrição viajam juntos. Se a soma dos três
  // tetos não coubesse, existiria um envio que passa em cada campo e é recusado
  // pelo conjunto — usuário escolhendo três arquivos válidos e levando "não".
  const pior = MAX_BYTES.video + MAX_BYTES.instruction + MAX_BYTES.transcript;
  assert.ok(
    pior <= MAX_REQUEST_BYTES,
    `os três tetos somam ${pior} e o corpo aceita ${MAX_REQUEST_BYTES}`,
  );
  assert.equal(
    validateUploadSizes([
      { label: "O vídeo", bytes: MAX_BYTES.video, max: MAX_BYTES.video },
      { label: "A instrução escrita", bytes: MAX_BYTES.instruction, max: MAX_BYTES.instruction },
      { label: "A transcrição", bytes: MAX_BYTES.transcript, max: MAX_BYTES.transcript },
    ]),
    null,
  );
});

test("o erro do arquivo vem antes do erro da soma", () => {
  // Quando os dois falham, "o vídeo passa do limite" é acionável; "a soma
  // passou" só diz que algo está grande.
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: MAX_REQUEST_BYTES * 2, max: MAX_BYTES.video },
    { label: "A transcrição", bytes: 1024, max: MAX_BYTES.transcript },
  ]);
  assert.ok(erro);
  assert.match(erro, /^O vídeo tem/);
});

test("lista vazia passa", () => {
  assert.equal(validateUploadSizes([]), null);
});

test("exatamente no teto passa; um byte acima, não", () => {
  assert.equal(
    validateUploadSizes([{ label: "O vídeo", bytes: MAX_BYTES.video, max: MAX_BYTES.video }]),
    null,
  );
  assert.ok(
    validateUploadSizes([{ label: "O vídeo", bytes: MAX_BYTES.video + 1, max: MAX_BYTES.video }]),
  );
});

test("nenhum teto individual passa do teto do corpo da requisição", () => {
  // Se um tipo puder ser maior do que a requisição aceita, o arquivo passa na
  // conferência do campo e morre na do corpo — que é exatamente a confusão que
  // este módulo existe para evitar. Vale para TODOS os tipos, não só vídeo.
  for (const [tipo, teto] of Object.entries(MAX_BYTES)) {
    assert.ok(
      teto <= MAX_REQUEST_BYTES,
      `o teto de ${tipo} (${teto}) passa do teto do corpo (${MAX_REQUEST_BYTES})`,
    );
  }
});

test("a transcrição é menor que os demais documentos", () => {
  // Ela não fica só no disco: o texto inteiro vai para uma coluna do banco.
  assert.ok(MAX_BYTES.transcript < MAX_BYTES.document);
});

test("maxMb devolve o inteiro que a interface exibe", () => {
  assert.equal(maxMb("image"), 50);
  assert.equal(maxMb("transcript"), 5);
});
