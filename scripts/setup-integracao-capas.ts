/**
 * Build.Connect — capas dos filmes da Página de Integração.
 *
 * Lê as imagens de uma pasta, padroniza o tamanho e as grava como capa de cada
 * filme. Idempotente: rodar de novo substitui a capa e apaga a anterior do
 * disco, sem deixar órfão.
 *
 * POR QUE O MAPA É EXPLÍCITO, e não comparação de nomes: os arquivos chegaram
 * com o título ligeiramente diferente do cadastrado ("Joy, Um nome do sucesso"
 * contra "Joy: O Nome do Sucesso"). Qualquer casamento aproximado acertaria
 * hoje e trocaria duas capas no dia em que um filme novo entrasse — e capa
 * trocada é um erro que ninguém percebe olhando a tela.
 *
 * POR QUE `contain` SOBRE PRETO, e não corte: são pôsteres (2:3) indo para um
 * bloco de vídeo (16:9). Cortar para preencher comeria mais da metade da
 * altura, levando título e rosto junto. O enquadramento preserva a imagem
 * inteira e o preto combina com o player — é o que as plataformas de streaming
 * fazem com material fora da proporção.
 *
 * Uso:
 *   npx tsx scripts/setup-integracao-capas.ts ["C:/caminho/da/pasta"]
 */

import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { resolveUploadDir, toPublicPath, UPLOADS_ROOT } from "../src/lib/storage/config";

const prisma = new PrismaClient();

/** Proporção do bloco de vídeo em que a capa aparece. */
const LARGURA = 640;
const ALTURA = 360;
const QUALIDADE = 82;

const PASTA_PADRAO = "C:/Users/Marcos Lucas/Downloads/Integração";

/** Arquivo → título do filme, exatamente como está cadastrado. */
const CAPAS: { arquivo: string; titulo: string }[] = [
  { arquivo: "Poder Além da Vida.jpg", titulo: "Poder Além da Vida" },
  { arquivo: "O Segredo - O Documentário.jpg", titulo: "O Segredo (Documentário)" },
  { arquivo: "O Segredo, Ouse Sonhar.jfif", titulo: "O Segredo: Ouse Sonhar" },
  { arquivo: "Joy, Um nome do sucesso.webp", titulo: "Joy: O Nome do Sucesso" },
];

async function main() {
  const pasta = process.argv[2] ?? PASTA_PADRAO;
  console.log(`Build.Connect — capas da Página de Integração\nPasta: ${pasta}\n`);

  const destino = resolveUploadDir("conteudo");
  await mkdir(destino, { recursive: true });

  for (const capa of CAPAS) {
    const filme = await prisma.integrationAsset.findFirst({
      where: { kind: "FILME", title: capa.titulo },
      select: { id: true, thumbnailPath: true },
    });

    if (!filme) {
      console.log(`  ! "${capa.titulo}" não está cadastrado — pulando.`);
      continue;
    }

    const origem = path.join(pasta, capa.arquivo);
    const nome = `${crypto.randomBytes(16).toString("hex")}.webp`;
    const absoluto = path.join(destino, nome);

    try {
      const info = await sharp(origem)
        .resize({
          width: LARGURA,
          height: ALTURA,
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 1 },
        })
        .webp({ quality: QUALIDADE })
        .toFile(absoluto);

      const anterior = filme.thumbnailPath;
      await prisma.integrationAsset.update({
        where: { id: filme.id },
        data: { thumbnailPath: toPublicPath(absoluto) },
      });

      // A anterior só sai DEPOIS que a nova está gravada no banco: na ordem
      // inversa, uma falha deixaria o filme sem capa nenhuma.
      if (anterior) {
        const alvo = path.join(UPLOADS_ROOT, anterior.replace(/^\/uploads\//, ""));
        await unlink(alvo).catch(() => undefined);
      }

      const kb = Math.round(info.size / 1024);
      console.log(`  + "${capa.titulo}" → ${LARGURA}x${ALTURA} webp (${kb} KB)`);
    } catch (error) {
      console.error(
        `  ! "${capa.titulo}": ${error instanceof Error ? error.message : error}`,
      );
      await unlink(absoluto).catch(() => undefined);
    }
  }

  console.log("\nPronto.");
}

main()
  .catch((error) => {
    console.error("\nFalhou:", error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
