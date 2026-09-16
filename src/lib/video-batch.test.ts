import assert from "node:assert/strict";
import test from "node:test";
import { MAX_BYTES } from "./storage/limits";
import { MAX_BATCH_FILES, titleFromFilename, validateBatch, runSequentially } from "./video-batch";

// ── Título sugerido ──────────────────────────────────────────────────────

test("o título sugerido é o nome do arquivo sem a extensão", () => {
  assert.equal(titleFromFilename("Treinamento de EPI.mkv"), "Treinamento de EPI");
  assert.equal(titleFromFilename("aula.final.v2.mp4"), "aula.final.v2");
});

test("separadores de nome de arquivo viram espaço", () => {
  assert.equal(titleFromFilename("uso_da_serra-circular.mp4"), "uso da serra circular");
});

test("arquivo sem nome útil cai em 'Vídeo'", () => {
  assert.equal(titleFromFilename(".mp4"), "Vídeo");
  assert.equal(titleFromFilename("___.mov"), "Vídeo");
});

// ── Validação do lote ────────────────────────────────────────────────────

test("o lote aceita no máximo 15 vídeos", () => {
  assert.equal(MAX_BATCH_FILES, 15);
  const ok = Array.from({ length: 15 }, (_, i) => ({ name: `v${i}.mp4`, size: 1 }));
  assert.equal(validateBatch(ok), null);
  const demais = [...ok, { name: "v15.mp4", size: 1 }];
  assert.match(validateBatch(demais) ?? "", /15/);
});

test("lote vazio é recusado", () => {
  assert.ok(validateBatch([]));
});

test("um vídeo acima do teto é recusado citando o nome do arquivo", () => {
  const erro = validateBatch([
    { name: "ok.mp4", size: 10 },
    { name: "grande.mkv", size: MAX_BYTES.video + 1 },
  ]);
  assert.ok(erro);
  assert.match(erro, /grande\.mkv/);
});

// ── Fila sequencial ──────────────────────────────────────────────────────

test("os itens são enviados um por vez, na ordem, nunca em paralelo", async () => {
  let emAndamento = 0;
  let pico = 0;
  const ordem: number[] = [];
  const resultados = await runSequentially([1, 2, 3], async (item) => {
    emAndamento++;
    pico = Math.max(pico, emAndamento);
    ordem.push(item);
    await new Promise((r) => setTimeout(r, 5));
    emAndamento--;
    return { ok: true };
  });
  assert.equal(pico, 1);
  assert.deepEqual(ordem, [1, 2, 3]);
  assert.deepEqual(resultados, [{ ok: true }, { ok: true }, { ok: true }]);
});

test("a falha de um item não interrompe os seguintes", async () => {
  const resultados = await runSequentially([1, 2, 3], async (item) =>
    item === 2 ? { ok: false, error: "rede" } : { ok: true },
  );
  assert.deepEqual(resultados, [{ ok: true }, { ok: false, error: "rede" }, { ok: true }]);
});

test("uma exceção no envio vira resultado de erro, e a fila continua", async () => {
  const resultados = await runSequentially([1, 2], async (item) => {
    if (item === 1) throw new Error("boom");
    return { ok: true };
  });
  assert.equal(resultados[0]?.ok, false);
  assert.equal(resultados[1]?.ok, true);
});
