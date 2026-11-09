import { prisma } from "@/lib/db/prisma";
import { flowEnv } from "@/lib/flow/env";
import { verifyFlowSignature } from "@/lib/flow/signature";
import {
  resolveSafePath,
  segmentsFromPublicPath,
  streamFile,
} from "@/lib/storage/stream-file";

/**
 * GET /api/integracao/flow/vitrine/arquivo?tipo=&id= — os bytes de um item da
 * vitrine, para a ferramenta Vitrine do Build.Flow.
 *
 * Por que existe: a tela de lá passou a tocar o vídeo e baixar o material (o
 * pedido de 09/11/2026 é explícito nisso). Até aqui ela só LISTAVA e mandava a
 * pessoa ao Connect pelo link, o que obrigava um segundo login para abrir um
 * PDF que ela já estava vendo listado.
 *
 * POR ID DE ITEM, NUNCA POR CAMINHO — a mesma escolha da rota do convidado da
 * Página de Integração (`api/integracao/arquivo/[assetId]`), e pelo mesmo
 * motivo: um portão que aceita caminho tem a superfície do disco inteiro, e um
 * descuido meu aqui viraria acesso a comprovante, documentação pessoal e
 * evidência de denúncia. Aqui o cliente só diz QUAL ITEM; o caminho vem do
 * banco.
 *
 * E a consulta exige `subsector.kind: VITRINE` DENTRO do \`where\`, não numa
 * conferência depois: é essa cláusula que mantém o alcance desta rota igual ao
 * da listagem ao lado. Id de vídeo de treinamento, de documento do DHO ou de
 * qualquer coisa fora de uma vitrine não resolve caminho nenhum — devolve 404
 * sem dizer se existe.
 *
 * O QUE ESTA ROTA NÃO É: ela não conhece a pessoa do outro lado. Quem decide
 * QUEM no Flow pode pedir é o Flow, na rota dele (sessão + papel). O que o
 * Connect garante aqui é o ESCOPO: só vitrine, só item que existe. Era essa a
 * divisão a manter — duas cópias da mesma regra de papel, uma em cada
 * repositório, divergem na primeira mudança.
 *
 * Assinatura idêntica à da listagem (HMAC sobre CAMINHO + QUERY, janela de 5
 * minutos). Nenhum segredo novo para provisionar.
 *
 * A ENTREGA é a compartilhada (`lib/storage/stream-file`): Range, Content-Type
 * e `attachment`/`inline` saem de lá, então o vídeo toca com seek e o arquivo
 * do Office baixa em vez de abrir como lixo na aba.
 *
 * Fora do matcher do middleware (prefixo `api/integracao`), então o portão é
 * este e não há outro.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Tipo = "foto" | "video" | "miniatura" | "documento";
const TIPOS: readonly string[] = ["foto", "video", "miniatura", "documento"];

/** Só item de subsetor VITRINE. Fora disso, null — e a rota devolve 404. */
async function caminhoPublico(tipo: Tipo, id: string): Promise<string | null> {
  const daVitrine = { subsector: { kind: "VITRINE" as const } };

  if (tipo === "foto") {
    const foto = await prisma.photo.findFirst({
      where: { id, ...daVitrine },
      select: { filePath: true },
    });
    return foto?.filePath ?? null;
  }

  if (tipo === "documento") {
    const doc = await prisma.document.findFirst({
      where: { id, ...daVitrine },
      select: { filePath: true },
    });
    return doc?.filePath ?? null;
  }

  const video = await prisma.video.findFirst({
    where: { id, ...daVitrine },
    select: { filePath: true, thumbnailPath: true },
  });
  if (!video) return null;
  return (tipo === "miniatura" ? video.thumbnailPath : video.filePath) ?? null;
}

export async function GET(request: Request) {
  const env = flowEnv();
  if (!env) {
    console.error("[flow/vitrine/arquivo] FLOW_* ausentes; pedido rejeitado.");
    return new Response("Integração não configurada.", { status: 503 });
  }

  const url = new URL(request.url);
  const check = verifyFlowSignature({
    secret: env.webhookSecret,
    timestamp: request.headers.get("x-flow-timestamp"),
    signature: request.headers.get("x-flow-signature"),
    // Caminho + query, como na listagem: o `id` pedido entra na assinatura, e
    // uma assinatura capturada não serve para pedir outro item.
    body: url.pathname + url.search,
  });
  if (!check.ok) {
    console.warn(`[flow/vitrine/arquivo] rejeitado: ${check.reason}`);
    return new Response("Não autorizado.", { status: 401 });
  }

  const tipo = url.searchParams.get("tipo") ?? "";
  const id = url.searchParams.get("id") ?? "";
  if (!TIPOS.includes(tipo) || !id) return new Response("Pedido inválido.", { status: 400 });

  const publico = await caminhoPublico(tipo as Tipo, id);
  if (!publico) return new Response("Not found", { status: 404 });

  const filePath = resolveSafePath(segmentsFromPublicPath(publico));
  if (!filePath) return new Response("Not found", { status: 404 });

  /*
   * Uma hora, não um ano: o acesso do Flow é revogável (o segredo da
   * integração pode ser trocado) e cache longo deixaria o arquivo reabrindo do
   * disco do navegador depois disso. Uma hora preserva o seek do vídeo — sem
   * cache nenhum, cada arraste na barra rebaixa o trecho inteiro.
   *
   * `private` porque isto é conteúdo de usuário autenticado do outro lado e
   * não pode encostar em proxy compartilhado.
   */
  return streamFile(request, filePath, { cacheControl: "private, max-age=3600" });
}
