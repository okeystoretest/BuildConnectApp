import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BYTES, MAX_REQUEST_BYTES, validateUploadSizes } from "./limits";

const MB = 1024 * 1024;

/**
 * A conferência que faltava.
 *
 * Sem ela, escolher um vídeo grande demais rendia dois minutos de barra de
 * progresso e uma tela genérica de "Algo deu errado": a validação de tamanho
 * mora DENTRO da Server Action, e a requisição morria antes de chegar lá.
 */

test("tudo dentro do limite passa", () => {
  assert.equal(
    validateUploadSizes([
      { label: "O vídeo", bytes: 120 * MB, max: MAX_BYTES.video },
      { label: "A instrução escrita", bytes: 2 * MB, max: MAX_BYTES.instruction },
    ]),
    null,
  );
});

test("arquivo isolado acima do teto é recusado, citando o campo", () => {
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: 780 * MB, max: MAX_BYTES.video },
  ]);
  assert.ok(erro, "deveria recusar");
  assert.match(erro, /^O vídeo tem/);
  assert.match(erro, /limite é/);
});

test("a soma estoura mesmo com cada arquivo dentro do seu teto", () => {
  // O caso que motivou o MAX_REQUEST_BYTES: os três arquivos vão no MESMO
  // FormData, e o teto do Next vale para o corpo inteiro. Um vídeo de 500 MB
  // (no limite, válido) mais os anexos passa do que a requisição aceita.
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: 500 * MB, max: MAX_BYTES.video },
    { label: "A instrução escrita", bytes: 25 * MB, max: MAX_BYTES.instruction },
    { label: "A transcrição", bytes: 1 * MB, max: MAX_BYTES.transcript },
  ]);
  assert.ok(erro, "deveria recusar pela soma");
  assert.match(erro, /somam/);
});

test("o erro do arquivo vem antes do erro da soma", () => {
  // Quando os dois falham, "o vídeo passa do limite" é acionável; "a soma
  // passou" só diz que algo está grande.
  const erro = validateUploadSizes([
    { label: "O vídeo", bytes: 900 * MB, max: MAX_BYTES.video },
    { label: "A transcrição", bytes: 1 * MB, max: MAX_BYTES.transcript },
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

test("o teto do corpo cabe o maior arquivo permitido", () => {
  // Se um dia alguém subir MAX_BYTES.video acima do teto do corpo, o vídeo no
  // limite passaria na conferência do campo e morreria na do corpo — que é
  // exatamente a confusão que este módulo existe para evitar.
  assert.ok(
    MAX_BYTES.video <= MAX_REQUEST_BYTES,
    "o teto de vídeo não pode passar do teto do corpo da requisição",
  );
});
