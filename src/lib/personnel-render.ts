import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { dateLabelBR } from "@/lib/brasilia";

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
 * O PDF é rasterizado pelo `pdftoppm`, do poppler, em PROCESSO SEPARADO.
 *
 * Antes era pdfjs mais o canvas nativo do Skia, dentro deste processo. Esse
 * caminho corrompia o heap ao reduzir a imagem de uma página A4 digitalizada a
 * 300 dpi — `free(): invalid size`, ou SIGSEGV direto. O arquivo não era
 * malformado: era um relatório comum, e TODO documento daquele formato
 * derrubava o servidor. Não havia exceção para capturar, porque não sobrava
 * Node vivo para capturá-la: o `catch` da rota nunca rodava, e o log não
 * registrava nada.
 *
 * Um visor que abre arquivo enviado por qualquer colaborador não pode ser uma
 * forma de derrubar a aplicação para todo mundo. Em processo separado, o pior
 * caso é o filho morrer: a promessa rejeita, a rota responde 500 e o Next
 * segue de pé.
 *
 * O poppler é requisito do SISTEMA, não do npm — `poppler-utils` no
 * `Dockerfile`, e instalado à parte na máquina de quem desenvolve.
 */

/** Largura da imagem servida. 1400px lê documento A4 escaneado sem esforço. */
const TARGET_WIDTH = 1400;

/**
 * Teto de tempo por chamada ao poppler.
 *
 * Existe para a página que o poppler não consegue terminar: sem ele, a
 * requisição fica pendurada e o visor roda para sempre. 30s é folgado para uma
 * página — as medidas reais ficam na casa de um segundo.
 */
const POPPLER_TIMEOUT_MS = 30_000;

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

/**
 * Roda um binário do poppler e devolve o que ele escreveu na saída padrão.
 *
 * Morte do filho (sinal, tempo-limite, binário ausente) vira rejeição, nunca
 * queda do processo que chamou. É a razão de ser deste arquivo.
 */
function poppler(binario: string, args: readonly string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const filho = spawn(binario, [...args], {
      timeout: POPPLER_TIMEOUT_MS,
      windowsHide: true,
    });
    const saida: Buffer[] = [];
    const erro: Buffer[] = [];
    filho.stdout.on("data", (parte: Buffer) => saida.push(parte));
    filho.stderr.on("data", (parte: Buffer) => erro.push(parte));

    filho.on("error", (e: NodeJS.ErrnoException) =>
      reject(
        e.code === "ENOENT"
          ? new Error(
              `${binario} não encontrado — instale o poppler (pacote poppler-utils)`,
            )
          : e,
      ),
    );

    filho.on("close", (code, signal) => {
      const texto = Buffer.concat(erro).toString().trim();
      // Só o código de saída decide. O poppler escreve avisos de fonte na
      // saída de erro mesmo quando a página sai inteira ("No display font
      // for 'Symbol'"), e tratá-los como falha recusaria documento bom.
      if (code === 0) return resolve(Buffer.concat(saida));
      reject(
        new Error(
          `${binario} falhou (código ${code}, sinal ${signal})${texto ? `: ${texto}` : ""}`,
        ),
      );
    });
  });
}

/** Quantas páginas o documento tem, segundo o `pdfinfo`. */
async function pdfPageCount(file: string): Promise<number> {
  const info = (await poppler("pdfinfo", [file])).toString();
  // A saída é sempre em inglês, independente do locale do contêiner.
  const encontrado = /^Pages:\s+(\d+)$/m.exec(info);
  if (!encontrado) throw new Error("pdfinfo não informou o total de páginas");
  return Number(encontrado[1]);
}

/** Uma página de PDF em PNG, mais o total de páginas do documento. */
async function rasterizePdfPage(
  file: string,
  page: number,
): Promise<{ png: Buffer; pages: number }> {
  const pages = await pdfPageCount(file);
  // Página fora da faixa cai na primeira: o número vem da URL.
  const index = page >= 1 && page <= pages ? page : 1;

  /*
   * A página sai em arquivo, não na saída padrão.
   *
   * `-` como destino NÃO é portável: na build do poppler para Windows ele
   * cria um arquivo chamado "-.png" e a saída padrão volta vazia. O destino
   * em disco se comporta igual em toda build.
   *
   * Enquanto existe, esse arquivo é uma cópia SEM marca d'água — por isso a
   * pasta é criada por `mkdtemp` (permissão só do dono) e apagada no
   * `finally`, inclusive quando a rasterização falha.
   */
  const dir = await mkdtemp(path.join(tmpdir(), "bc-pdf-"));
  // Com `-singlefile` o nome final é exatamente a raiz mais ".png", sem o
  // sufixo de número de página que o poppler acrescentaria.
  const raiz = path.join(dir, "pagina");

  try {
    await poppler("pdftoppm", [
      "-png",
      "-singlefile",
      "-f",
      String(index),
      "-l",
      String(index),
      // Altura por proporção: `-scale-to-y -1` é como o poppler diz "deduza".
      "-scale-to-x",
      String(TARGET_WIDTH),
      "-scale-to-y",
      "-1",
      file,
      raiz,
    ]);

    return { png: await readFile(`${raiz}.png`), pages };
  } finally {
    await rm(dir, { recursive: true, force: true });
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

  const { png, pages } =
    extension === ".pdf"
      ? await rasterizePdfPage(absolutePath, page)
      : {
          png: await sharp(absolutePath).resize({ width: TARGET_WIDTH }).png().toBuffer(),
          pages: 1,
        };

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
