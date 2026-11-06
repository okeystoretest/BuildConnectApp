import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";
// A conta de borda da janela mora numa lib para PODER ser conferida: um teste
// que importasse este arquivo arrastaria o Prisma e o ambiente junto.
import { dataDaQuery, emDias, fimDoDia } from "@/lib/flow/janela";

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
 * O QUE NÃO SAI DAQUI, de propósito: `script`, `scriptBy` e `createdBy`. O
 * roteiro é material de produção, e quem o escreveu ou quem criou o registro
 * são pessoas que a tela de lá não tem motivo para conhecer. Campo que não
 * atravessa a fronteira não vaza.
 *
 * `notes` E O PRIMEIRO NOME DO `owner` ATRAVESSAM desde 06/11/2026 (pedido do
 * dono). O cronograma do Flow virou calendário, e num calendário o título
 * sozinho não basta: "MAIS LANÇAMENTOS" aparece três vezes na mesma semana. O
 * `notes` é a linha que diz de qual. O responsável vai como PRIMEIRO NOME e
 * nada mais — é o que o card mostra, e sobrenome, e-mail ou id seriam dado
 * pessoal atravessando sem ninguém olhar para ele.
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


/** O primeiro nome, para o selo do card. Vazio ou so espacos vira nulo. */
function primeiroNome(nome: string | null | undefined): string | null {
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];
  return primeiro || null;
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
  const ate = fimDoDia(dataDaQuery(url.searchParams.get("ate")) ?? emDias(agora, DIAS_ADIANTE));

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
      notes: true,
      // So o nome; o id e o e-mail do responsavel nao atravessam.
      owner: { select: { fullName: true } },
    },
  });

  return NextResponse.json({
    de: de.toISOString(),
    ate: ate.toISOString(),
    // `truncado` em vez de deixar o Flow adivinhar pelo tamanho: a tela de lá
    // precisa poder dizer "há mais" em vez de mostrar um calendário que parece
    // completo e não é.
    truncado: posts.length === TETO,
    // O `owner` vira PRIMEIRO NOME AQUI, e nao na tela do Flow: o que
    // atravessa a fronteira se decide deste lado dela. Mandar o objeto
    // inteiro e deixar o outro lado "usar so o nome" e como nao ter filtro.
    posts: posts.map(({ owner, ...p }) => ({ ...p, responsavel: primeiroNome(owner?.fullName) })),
  });
}
