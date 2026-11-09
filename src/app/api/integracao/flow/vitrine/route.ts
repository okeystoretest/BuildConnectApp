import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";

/**
 * GET /api/integracao/flow/vitrine — o acervo das vitrines, para a ferramenta
 * Vitrine do Build.Flow.
 *
 * SÓ `kind: VITRINE`, e é a regra inteira — a mesma decisão da rota do
 * cronograma ao lado. VITRINE já significa, neste schema, "material de mostra,
 * fora da contagem de progresso" (ver `lib/progress-scope` e
 * `sector-data.ts:184`); um subsetor PADRAO é treinamento com progresso por
 * pessoa, e nada disso faz sentido do outro lado. Listar por slug à mão aqui
 * criaria uma SEGUNDA definição de "é vitrine" para divergir da primeira.
 *
 * O QUE NÃO SAI DAQUI, de propósito:
 *
 * - `filePath` de qualquer item. O Flow não conseguiria usá-lo: `/uploads/...`
 *   é servido por rota com sessão do Connect (ver `app/uploads/[...path]`), e
 *   quem está no Flow não tem essa sessão. Mandar o caminho só publicaria o
 *   layout do armazenamento e convidaria alguém a tentar baixar direto.
 * - `transcriptPath` e `transcriptText` do vídeo — material de produção, como o
 *   `script` do cronograma.
 * - `progress`, `ratings` e `comprehensions`. São de PESSOA IDENTIFICADA: quem
 *   assistiu, quem avaliou, quem acertou o quiz. A tela do Flow não tem motivo
 *   para conhecer, e campo que não atravessa a fronteira não vaza.
 *
 * O Flow recebe o SLUG do subsetor para montar o link de volta, e os BYTES de
 * cada item pela rota irmã `vitrine/arquivo` — por ID, nunca por caminho (o
 * cabeçalho dela explica por quê). Esta rota continua sem publicar caminho
 * algum: o que ela ganhou foram dois booleanos, `temArquivo` e
 * `temMiniatura`, para a tela de lá saber se há player a mostrar.
 *
 * ASSINATURA NO LUGAR DE TOKEN: idêntica à do cronograma (o HMAC do webhook,
 * sobre CAMINHO + QUERY, com janela de 5 minutos). Nenhum segredo novo para
 * provisionar.
 *
 * Fora do matcher do middleware (prefixo `api/integracao`), então o portão é
 * este e não há outro.
 */
export const dynamic = "force-dynamic";

/**
 * Teto POR TIPO e por vitrine. Separado em vez de um teto geral: com um só, uma
 * vitrine com 300 fotos engoliria a cota e os documentos sumiriam da lista sem
 * nada avisar — o Flow mostraria uma vitrine "sem documentos" que tem.
 */
const TETO = 100;

/**
 * A EXTENSÃO REAL do arquivo, e não o `kind`.
 *
 * `FileKind` é CATEGORIA, não formato: um .jpg entra no acervo como `PNG`
 * (é o rótulo de "imagem" no enum), e o Flow, que nomeia o download, baixava
 * um JPEG chamado ".png". Deduzir formato de categoria não tem conserto do
 * outro lado — o dado certo está aqui, no caminho gravado.
 *
 * A extensão NÃO é o caminho: diz o formato, não onde o arquivo mora.
 */
function extensaoDe(caminho: string | null): string {
  return caminho ? path.extname(caminho).replace(/^./, "").toLowerCase() : "";
}

export async function GET(request: Request) {
  const env = flowEnv();
  if (!env) {
    console.error("[flow/vitrine] FLOW_* ausentes; pedido rejeitado.");
    return NextResponse.json({ error: "Integração não configurada." }, { status: 503 });
  }

  const url = new URL(request.url);
  const check = verifyFlowSignature({
    secret: env.webhookSecret,
    timestamp: request.headers.get("x-flow-timestamp"),
    signature: request.headers.get("x-flow-signature"),
    // O que um GET tem no lugar do corpo. O Flow assina exatamente isto.
    body: url.pathname + url.search,
  });
  if (!check.ok) {
    console.warn(`[flow/vitrine] rejeitado: ${check.reason}`);
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const vitrines = await prisma.subsector.findMany({
    where: { kind: "VITRINE" },
    orderBy: [{ sector: { order: "asc" } }, { order: "asc" }],
    select: {
      slug: true,
      label: true,
      sector: { select: { label: true } },
      photos: {
        orderBy: { order: "asc" },
        take: TETO,
        select: {
          id: true,
          title: true,
          temporada: true,
          colecao: true,
          createdAt: true,
          // Lido só para virar EXTENSÃO no mapa abaixo.
          filePath: true,
        },
      },
      videos: {
        orderBy: { order: "asc" },
        take: TETO,
        select: {
          id: true,
          title: true,
          kind: true,
          isNew: true,
          tags: true,
          temporada: true,
          colecao: true,
          createdAt: true,
          // Lidos SÓ para virarem booleano no mapa abaixo. Ver o cabeçalho.
          filePath: true,
          thumbnailPath: true,
        },
      },
      documents: {
        orderBy: { order: "asc" },
        take: TETO,
        select: {
          id: true,
          name: true,
          kind: true,
          sizeBytes: true,
          tags: true,
          temporada: true,
          colecao: true,
          createdAt: true,
          // Lido só para virar EXTENSÃO no mapa abaixo.
          filePath: true,
        },
      },
    },
  });

  return NextResponse.json({
    vitrines: vitrines.map((v) => ({
      slug: v.slug,
      label: v.label,
      setor: v.sector.label,
      fotos: v.photos.map((f) => ({
        id: f.id,
        title: f.title,
        temporada: f.temporada,
        colecao: f.colecao,
        createdAt: f.createdAt,
        extensao: extensaoDe(f.filePath),
      })),
      // Mapeado à mão, e não repassado como as fotos: `filePath` e
      // `thumbnailPath` foram SELECIONADOS acima e um spread os publicaria.
      videos: v.videos.map((vd) => ({
        id: vd.id,
        title: vd.title,
        kind: vd.kind,
        isNew: vd.isNew,
        tags: vd.tags,
        temporada: vd.temporada,
        colecao: vd.colecao,
        createdAt: vd.createdAt,
        // SE EXISTE, não ONDE ESTÁ.
        temArquivo: Boolean(vd.filePath),
        temMiniatura: Boolean(vd.thumbnailPath),
        extensao: extensaoDe(vd.filePath),
      })),
      documentos: v.documents.map((d) => ({
        id: d.id,
        name: d.name,
        kind: d.kind,
        sizeBytes: d.sizeBytes,
        tags: d.tags,
        temporada: d.temporada,
        colecao: d.colecao,
        createdAt: d.createdAt,
        extensao: extensaoDe(d.filePath),
      })),
      // `truncado` POR VITRINE, como no cronograma: a tela de lá precisa poder
      // dizer "há mais" em vez de mostrar um acervo que parece completo e não é.
      truncado:
        v.photos.length === TETO || v.videos.length === TETO || v.documents.length === TETO,
    })),
  });
}
