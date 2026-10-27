import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { dateLabelBR } from "@/lib/brasilia";
import { DOMMatrix, DOMPoint, ImageData, Path2D, createCanvas } from "@napi-rs/canvas";

/**
 * Renderização protegida de documento pessoal.
 *
 * O arquivo ORIGINAL nunca vai para quem só pode visualizar: a página é
 * rasterizada aqui no servidor, recebe marca d'água com o nome de quem está
 * olhando e sai como imagem. O que chega ao navegador do gestor não é o PDF —
 * é uma fotografia dele, assinada.
 *
 * Print continua possível, e isso é aceito: o objetivo não é impedir a cópia,
 * é que toda cópia que saia leve o nome de quem a tirou.
 *
 * Nada aqui olha o `kind` que a tela mostra: `personnel-data` reescreve PNG
 * como "PDF" para reaproveitar o estilo do ladrilho, e seguir esse rótulo
 * faria o rasterizador tentar ler um PNG como PDF. Quem decide é a EXTENSÃO.
 */

/*
 * O pdfjs desenha contra os tipos do DOM, que em Node não existem. Sem estes
 * globais ele cai num Path2D próprio, e o canvas nativo recusa o objeto —
 * "não é um CanvasFillRule válido", no meio do desenho da primeira letra.
 *
 * Atribuído no carregamento do módulo, e não dentro da função: tem de estar de
 * pé ANTES do import do pdfjs, que lê os globais ao inicializar.
 */
const DOM_SHIMS = { Path2D, DOMMatrix, DOMPoint, ImageData } as const;
for (const [name, value] of Object.entries(DOM_SHIMS)) {
  const target = globalThis as unknown as Record<string, unknown>;
  target[name] ??= value;
}

/** Largura da imagem servida. 1400px lê documento A4 escaneado sem esforço. */
const TARGET_WIDTH = 1400;

/**
 * O número de página que a URL pediu, ou 1.
 *
 * Tudo que não for inteiro positivo cai na primeira página, em vez de virar
 * erro: o número vem da barra de endereço, e "?pagina=abc" não é ataque nem
 * merece 400 — é um link torto. Página ALÉM do documento também cai na
 * primeira, mas isso só se sabe depois de abrir o PDF (ver `rasterizePdfPage`).
 */
export function parsePageParam(raw: string | null): number {
  const asked = Number(raw ?? "1");
  return Number.isInteger(asked) && asked > 0 ? asked : 1;
}

/** Formatos que sabemos transformar em imagem. O resto não tem visualizador. */
export function isRenderable(filePath: string): boolean {
  // A mesma lista que o envio aceita entre imagens, mais o PDF. Se as duas
  // divergirem, o DHO arquiva um documento que o visor recusa a abrir.
  return [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff", ".gif"].includes(
    path.extname(filePath).toLowerCase(),
  );
}

/** Texto seguro dentro de SVG — nome com `&` ou `<` quebraria o documento. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * O que a marca d'água diz.
 *
 * Duas linhas, e as duas importam: o nome responde "quem tirou daqui", e o
 * aviso responde "esta cópia não deveria estar na sua mão" para quem a receber
 * depois — que é justamente quem não estava presente quando ela saiu.
 *
 * Em função separada porque é TEXTO DE REGRA, não layout: se a frase mudar,
 * muda aqui, e o teste prende a redação.
 */
export function watermarkLines(viewer: string, day: string): [string, string] {
  return [`Visualizado por: ${viewer}`, `CÓPIA NÃO AUTORIZADA · ${day}`];
}

/**
 * A marca d'água: as duas linhas repetidas na diagonal, por toda a página.
 *
 * Repetida e inclinada de propósito — uma única marca num canto sai de um
 * recorte, e o recorte é exatamente o que se faz antes de encaminhar.
 */
function watermarkSvg(width: number, height: number, lines: readonly string[]): Buffer {
  // Passo maior que o da marca de uma linha só: o texto agora é mais largo e
  // mais alto, e manter o passo antigo faria uma marca encostar na vizinha.
  const stepY = 300;
  const stepX = 560;
  const marks: string[] = [];
  for (let y = -height; y < height * 2; y += stepY) {
    for (let x = -width; x < width * 2; x += stepX) {
      const texto = lines
        .map(
          (linha, i) =>
            `<tspan x="${x}" dy="${i === 0 ? 0 : 30}">${escapeXml(linha)}</tspan>`,
        )
        .join("");
      marks.push(
        `<text y="${y}" font-family="sans-serif" font-size="24" font-weight="600" ` +
          `fill="#1f2937" fill-opacity="0.2" transform="rotate(-30 ${x} ${y})">${texto}</text>`,
      );
    }
  }
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${marks.join("")}</svg>`,
  );
}

/** Uma página de PDF em PNG, mais o total de páginas do documento. */
async function rasterizePdfPage(
  data: Buffer,
  page: number,
): Promise<{ png: Buffer; pages: number }> {
  // Build `legacy`: é o que roda em Node (sem DOM). Import dinâmico porque o
  // pacote é ESM e este módulo é carregado por rota compilada em CJS.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const doc = await pdfjs.getDocument({
    // Cópia: o pdfjs assume posse do buffer e o deixa inutilizável depois.
    data: new Uint8Array(data),
    // Documento de colaborador é dado, não programa: sem eval e sem fonte do
    // sistema, que num container nem existe.
    isEvalSupported: false,
    useSystemFonts: false,
    // Fontes padrão do próprio pacote, para PDF que não embute a fonte.
    standardFontDataUrl: path.join(
      path.dirname(require.resolve("pdfjs-dist/package.json")),
      "standard_fonts/",
    ),
  }).promise;

  try {
    const pages = doc.numPages;
    // Página fora da faixa cai na primeira: o número vem da URL.
    const index = page >= 1 && page <= pages ? page : 1;
    const pdfPage = await doc.getPage(index);

    const base = pdfPage.getViewport({ scale: 1 });
    const viewport = pdfPage.getViewport({ scale: TARGET_WIDTH / base.width });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext("2d");
    // Fundo branco: PDF não tem fundo, e sem isto o PNG sai transparente —
    // que num visualizador escuro deixa o documento ilegível.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);

    await pdfPage.render({
      // O canvas do napi-rs implementa a mesma API do DOM; os tipos é que não
      // se conhecem.
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    return { png: canvas.toBuffer("image/png"), pages };
  } finally {
    // Libera o worker do pdfjs; sem isto o processo acumula um por requisição.
    await doc.destroy();
  }
}

/**
 * A página pedida, já com marca d'água, pronta para servir.
 *
 * `pages` é 1 para imagem — um JPG não tem página 2, e a tela usa o número
 * para decidir se desenha a navegação.
 *
 * Recebe o NOME de quem olha, e não a frase pronta: a redação da marca é regra
 * deste módulo (ver `watermarkLines`), não de quem chama.
 */
export async function renderWatermarked(
  absolutePath: string,
  page: number,
  viewerName: string,
): Promise<{ image: Buffer; pages: number }> {
  const extension = path.extname(absolutePath).toLowerCase();
  const file = await readFile(absolutePath);

  const { png, pages } =
    extension === ".pdf"
      ? await rasterizePdfPage(file, page)
      : { png: await sharp(file).resize({ width: TARGET_WIDTH }).png().toBuffer(), pages: 1 };

  const meta = await sharp(png).metadata();
  const width = meta.width ?? TARGET_WIDTH;
  const height = meta.height ?? TARGET_WIDTH;

  const image = await sharp(png)
    .composite([
      {
        input: watermarkSvg(width, height, watermarkLines(viewerName, dateLabelBR(new Date()))),
        top: 0,
        left: 0,
      },
    ])
    .webp({ quality: 82 })
    .toBuffer();

  return { image, pages };
}
