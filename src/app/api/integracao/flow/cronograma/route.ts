import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";

/**
 * GET /api/integracao/flow/cronograma — o calendário de conteúdo do Marketing,
 * para a ferramenta Cronograma do Build.Flow.
 *
 * SÓ `visibility: SHARED`, e é a regra inteira. SHARED já significa, neste
 * schema, "criado no Marketing e visível para todos" (ver o enum
 * ContentVisibility); SECTOR é da aba de origem e PRIVATE é só do autor. Filtrar
 * por setor à mão aqui criaria uma SEGUNDA definição de "é do Marketing" para
 * divergir da primeira na próxima mudança.
 *
 * O QUE NÃO SAI DAQUI, de propósito: `script`, `notes`, `owner` e `createdBy`.
 * O Flow mostra O QUE vai ao ar e QUANDO — roteiro é material de produção, e
 * dono/autor são pessoas identificadas que a tela de lá não tem motivo para
 * conhecer. Campo que não atravessa a fronteira não vaza.
 *
 * ASSINATURA NO LUGAR DE TOKEN: a mesma do webhook do Flow, já compartilhada
 * pelos dois lados (FLOW_WEBHOOK_SECRET aqui = CONNECT_WEBHOOK_SECRET lá), então
 * não há segredo novo para provisionar em dois servidores. Como um GET não tem
 * corpo, o que se assina é o CAMINHO + QUERY: assim uma assinatura capturada não
 * vale para outra rota nem para outro recorte. A janela de 5 minutos de
 * `verifyFlowSignature` vale aqui também, o que um bearer fixo não daria.
 *
 * Fora do matcher do middleware (prefixo `api/integracao`), então o portão é
 * este e não há outro.
 */
export const dynamic = "force-dynamic";

/** Teto de linhas por resposta. Um calendário não se lê além disso. */
const TETO = 200;
/** Janela padrão quando o Flow não pede recorte. */
const DIAS_ATRAS = 30;
const DIAS_ADIANTE = 90;

/** `YYYY-MM-DD` da query. Valor fora do formato é IGNORADO (vira o padrão), e
 *  não erro: a data chega da URL e um recorte inválido não deve derrubar a
 *  tela do outro lado. */
function dataDaQuery(valor: string | null): Date | null {
  if (!valor || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  const d = new Date(`${valor}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function emDias(base: Date, dias: number): Date {
  return new Date(base.getTime() + dias * 86_400_000);
}

export async function GET(request: Request) {
  const env = flowEnv();
  if (!env) {
    console.error("[flow/cronograma] FLOW_* ausentes; pedido rejeitado.");
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
    console.warn(`[flow/cronograma] rejeitado: ${check.reason}`);
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const agora = new Date();
  const de = dataDaQuery(url.searchParams.get("de")) ?? emDias(agora, -DIAS_ATRAS);
  const ate = dataDaQuery(url.searchParams.get("ate")) ?? emDias(agora, DIAS_ADIANTE);

  const posts = await prisma.contentPost.findMany({
    where: { visibility: "SHARED", scheduledAt: { gte: de, lte: ate } },
    orderBy: { scheduledAt: "asc" },
    take: TETO,
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      status: true,
      funnel: true,
      formats: true,
      platforms: true,
      brand: true,
    },
  });

  return NextResponse.json({
    de: de.toISOString(),
    ate: ate.toISOString(),
    // `truncado` em vez de deixar o Flow adivinhar pelo tamanho: a tela de lá
    // precisa poder dizer "há mais" em vez de mostrar um calendário que parece
    // completo e não é.
    truncado: posts.length === TETO,
    posts,
  });
}
