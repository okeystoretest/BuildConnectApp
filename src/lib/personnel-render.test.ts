import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import {
  isRenderable,
  parsePageParam,
  renderWatermarked,
  watermarkLines,
} from "./personnel-render";

/**
 * PDF de duas páginas escrito à mão.
 *
 * Montado aqui, e não lido de um arquivo de apoio: o teste precisa de um PDF
 * de verdade para provar que a cadeia inteira funciona (o poppler rasteriza,
 * o sharp compõe), e um binário no repositório é um arquivo que ninguém sabe
 * por que existe nem como foi gerado.
 *
 * Os testes de PDF daqui exigem o poppler instalado na máquina — é requisito
 * do sistema, não do npm. Sem ele, falham dizendo isso.
 */
function twoPagePdf(): Buffer {
  const objects = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R 6 0 R]/Count 2>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    "<</Length 46>>\nstream\nBT /F1 28 Tf 30 200 Td (Pagina Um) Tj ET\nendstream",
    "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    "<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 400]/Contents 7 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
    "<</Length 48>>\nstream\nBT /F1 28 Tf 30 200 Td (Pagina Dois) Tj ET\nendstream",
  ];
  const body = objects.map((o, i) => `${i + 1} 0 obj\n${o}\nendobj\n`).join("");
  return Buffer.from(`%PDF-1.4\n${body}trailer<</Root 1 0 R/Size ${objects.length + 1}>>\n%%EOF\n`);
}

/** Uma imagem mínima no formato pedido, para provar o decodificador. */
function amostra(formato: "png" | "jpeg" | "webp" | "tiff" | "gif"): Promise<Buffer> {
  return sharp({ create: { width: 60, height: 40, channels: 3, background: "#cccccc" } })
    .toFormat(formato)
    .toBuffer();
}

async function writeTemp(name: string, data: Buffer): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "bc-render-"));
  const file = path.join(dir, name);
  await writeFile(file, data);
  return file;
}

test("isRenderable aceita PDF e imagem, recusa Office", () => {
  assert.equal(isRenderable("/uploads/pessoal/2026/10/aso.pdf"), true);
  assert.equal(isRenderable("/uploads/pessoal/2026/10/rg.PNG"), true);
  assert.equal(isRenderable("/uploads/pessoal/2026/10/rg.jpg"), true);
  // Digitalização de scanner, que é como boa parte dos documentos chega.
  assert.equal(isRenderable("/uploads/pessoal/2026/10/ctps.tiff"), true);
  // Office não rasteriza sem uma suíte de escritório no servidor: o visor
  // recusa, e o DHO baixa o arquivo. Ninguém fica sem acesso.
  assert.equal(isRenderable("/uploads/pessoal/2026/10/ctps.docx"), false);
  assert.equal(isRenderable("/uploads/pessoal/2026/10/folha.xlsx"), false);
  assert.equal(isRenderable("/uploads/pessoal/2026/10/treino.pptx"), false);
});

test("PDF vira imagem com marca d'água, e conta as páginas", async () => {
  const file = await writeTemp("aso.pdf", twoPagePdf());

  const first = await renderWatermarked(file, 1, "Marcos Lucas");
  assert.equal(first.pages, 2);
  const meta = await sharp(first.image).metadata();
  assert.equal(meta.format, "webp");
  // Rasterizado na largura de leitura, não no tamanho do PDF (300pt).
  assert.equal(meta.width, 1400);

  // Páginas diferentes são imagens diferentes — prova que o número da URL
  // escolhe a página, em vez de ser ignorado.
  const second = await renderWatermarked(file, 2, "Marcos Lucas");
  assert.notEqual(first.image.toString("base64"), second.image.toString("base64"));

  // Nome diferente, imagem diferente: a marca é de quem olha, e é por isso que
  // a resposta não pode ser cacheada entre usuários.
  const outro = await renderWatermarked(file, 1, "Outra Pessoa");
  assert.notEqual(first.image.toString("base64"), outro.image.toString("base64"));
});

test("PDF ilegível rejeita, em vez de derrubar o processo", async () => {
  // A razão de o rasterizador rodar em processo separado. O arquivo vem de
  // upload: antes, um PDF que o canvas nativo não digeria matava o servidor
  // inteiro com SIGSEGV, e o `catch` da rota nunca chegava a rodar. Rejeitar é
  // o comportamento que a rota sabe transformar em 500.
  const file = await writeTemp("quebrado.pdf", Buffer.from("%PDF-1.4\nisto não é um PDF\n"));
  await assert.rejects(() => renderWatermarked(file, 1, "Marcos Lucas"));

  // E o processo continua vivo para responder à próxima requisição.
  const imagem = await writeTemp("rg.png", await amostra("png"));
  assert.equal((await renderWatermarked(imagem, 1, "Marcos Lucas")).pages, 1);
});

test("página fora da faixa cai na primeira, em vez de estourar", async () => {
  const file = await writeTemp("aso.pdf", twoPagePdf());
  const nona = await renderWatermarked(file, 9, "Marcos Lucas");
  const primeira = await renderWatermarked(file, 1, "Marcos Lucas");
  assert.equal(nona.image.toString("base64"), primeira.image.toString("base64"));
});

test("imagem é servida como uma página só, em qualquer formato aceito", async () => {
  // Um por formato que o envio aceita: habilitar no upload sem o decodificador
  // correspondente arquivaria documento que o visor não abre.
  for (const [nome, buffer] of [
    ["rg.png", await amostra("png")],
    ["cpf.jpg", await amostra("jpeg")],
    ["residencia.webp", await amostra("webp")],
    ["ctps.tiff", await amostra("tiff")],
    ["certidao.gif", await amostra("gif")],
  ] as const) {
    const file = await writeTemp(nome, buffer);
    const out = await renderWatermarked(file, 1, "Marcos Lucas");
    assert.equal(out.pages, 1, nome);
    assert.equal((await sharp(out.image).metadata()).format, "webp", nome);
  }
});

test("nome com caractere de XML não quebra a marca d'água", async () => {
  const file = await writeTemp("aso.pdf", twoPagePdf());
  // `&` e `<` crus tornariam o SVG inválido e o sharp recusaria a composição.
  const out = await renderWatermarked(file, 1, 'Fulano & <Cia> "Ltda"');
  assert.equal((await sharp(out.image).metadata()).format, "webp");
});

test("parsePageParam aceita só inteiro positivo; o resto cai na primeira página", () => {
  assert.equal(parsePageParam("3"), 3);
  assert.equal(parsePageParam(null), 1);
  assert.equal(parsePageParam(""), 1);
  assert.equal(parsePageParam("abc"), 1);
  // Zero e negativo viraram página 1 em vez de estourar a conta do pdfjs.
  assert.equal(parsePageParam("0"), 1);
  assert.equal(parsePageParam("-2"), 1);
  // Fracionário não é página: 1.5 arredondaria para um lado qualquer.
  assert.equal(parsePageParam("1.5"), 1);
  assert.equal(parsePageParam("Infinity"), 1);
});

test("a marca d'água diz quem olhou e que a cópia não é autorizada", () => {
  const [quem, aviso] = watermarkLines("Marcos Lucas", "27/10/2026");
  assert.equal(quem, "Visualizado por: Marcos Lucas");
  assert.equal(aviso, "CÓPIA NÃO AUTORIZADA · 27/10/2026");
  // As duas linhas importam: o nome responde quem tirou, o aviso fala com
  // quem recebeu a cópia depois. Perder qualquer uma esvazia a marca.
  assert.equal(watermarkLines("x", "y").length, 2);
});
