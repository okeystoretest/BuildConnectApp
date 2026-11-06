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
 * O Flow recebe o SLUG do subsetor para montar o link de volta. Quem tem login
 * do Connect abre o arquivo lá, onde o portão dele já decide o que pode ver —
 * nenhum arquivo é reservido por aqui.
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
        select: { id: true, title: true, createdAt: true },
      },
      videos: {
        orderBy: { order: "asc" },
        take: TETO,
        select: { id: true, title: true, kind: true, isNew: true, tags: true, createdAt: true },
      },
      documents: {
        orderBy: { order: "asc" },
        take: TETO,
        select: { id: true, name: true, kind: true, sizeBytes: true, tags: true, createdAt: true },
      },
    },
  });

  return NextResponse.json({
    vitrines: vitrines.map((v) => ({
      slug: v.slug,
      label: v.label,
      setor: v.sector.label,
      fotos: v.photos,
      videos: v.videos,
      documentos: v.documents,
      // `truncado` POR VITRINE, como no cronograma: a tela de lá precisa poder
      // dizer "há mais" em vez de mostrar um acervo que parece completo e não é.
      truncado:
        v.photos.length === TETO || v.videos.length === TETO || v.documents.length === TETO,
    })),
  });
}
