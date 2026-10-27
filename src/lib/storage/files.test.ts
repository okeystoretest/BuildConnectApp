import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * O UPLOADS_ROOT é lido na carga do módulo, então a pasta temporária precisa
 * existir no ambiente ANTES do import — por isso o `import` dinâmico dentro
 * do `before`, e não no topo do arquivo.
 */
let root: string;
let files: typeof import("./files");

test.before(async () => {
  root = await mkdtemp(path.join(tmpdir(), "bc-files-"));
  process.env.UPLOADS_DIR = root;
  files = await import("./files");
});

test.after(async () => {
  await rm(root, { recursive: true, force: true });
});

test("vídeo .mkv sem MIME é aceito pela extensão", async () => {
  // Firefox e o Explorador do Windows mandam .mkv com `type` vazio (não há
  // MIME registrado para Matroska na maioria dos sistemas). Recusar por
  // "formato inválido" um arquivo que a regra já aceita por extensão era o
  // que impedia o envio de MKV.
  const file = new File([new Uint8Array([1, 2, 3])], "treinamento.mkv", { type: "" });
  const stored = await files.storeFile(file, "video", "conteudo");
  assert.match(stored.publicPath, /\.mkv$/);
  assert.equal(stored.sizeBytes, 3);
});

test("vídeo com extensão fora da lista é recusado, mesmo com MIME de vídeo", async () => {
  const file = new File([new Uint8Array([1])], "payload.svg", { type: "video/mp4" });
  await assert.rejects(
    () => files.storeFile(file, "video", "conteudo"),
    (e: unknown) => e instanceof files.FileStorageError && /Extensão inválida/.test(e.message),
  );
});

test("documento .pptx com MIME de apresentação é aceito", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "treinamento.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
  const stored = await files.storeFile(file, "document", "conteudo");
  assert.match(stored.publicPath, /\.pptx$/);
  assert.equal(stored.sizeBytes, 4);
});

test("documento .pptx sem MIME é aceito pela extensão", async () => {
  // O Explorador do Windows manda `type` vazio para .pptx em algumas
  // instalações — mesma situação do .mkv em vídeo, aqui na regra document.
  const file = new File([new Uint8Array([1, 2])], "treinamento.pptx", { type: "" });
  const stored = await files.storeFile(file, "document", "conteudo");
  assert.match(stored.publicPath, /\.pptx$/);
  assert.equal(stored.sizeBytes, 2);
});

test("foto e digitalização de documento são aceitas", async () => {
  // Celular entrega JPEG, scanner entrega TIFF. Sem eles o RG fotografado era
  // recusado por "formato inválido", e a pasta ficava vazia por culpa do
  // aparelho, não do colaborador.
  for (const [nome, mime] of [
    ["rg.jpg", "image/jpeg"],
    ["cpf.jpeg", "image/jpeg"],
    ["residencia.webp", "image/webp"],
    ["ctps.tiff", "image/tiff"],
    ["aso.tif", "image/tiff"],
  ] as const) {
    const file = new File([new Uint8Array([1, 2])], nome, { type: mime });
    const stored = await files.storeFile(file, "document", "pessoal");
    assert.ok(stored.publicPath.endsWith(path.extname(nome)), stored.publicPath);
  }
});

test("imagem que o visor não abriria continua recusada", async () => {
  // HEIC: o sharp LÊ o formato nesta instalação, mas o suporte depende de
  // codec que nem toda imagem de produção traz — e documento arquivado que
  // não abre é pior que envio recusado. O iPhone converte para JPEG ao enviar
  // pela web, então o caso prático está coberto. SVG é recusa de SEGURANÇA:
  // executa script se for servido na origem da aplicação.
  for (const [nome, mime] of [
    ["foto.heic", "image/heic"],
    ["payload.svg", "image/png"],
  ] as const) {
    const file = new File([new Uint8Array([1])], nome, { type: mime });
    await assert.rejects(
      () => files.storeFile(file, "document", "pessoal"),
      (e: unknown) => e instanceof files.FileStorageError,
      `${nome} deveria ser recusado`,
    );
  }
});
