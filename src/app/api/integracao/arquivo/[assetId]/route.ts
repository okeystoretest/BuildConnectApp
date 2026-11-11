import { prisma } from "@/lib/db/prisma";
import { resolveGuest, getTrail } from "@/lib/integration/data";
import {
  resolveSafePath,
  segmentsFromPublicPath,
  streamFile,
} from "@/lib/storage/stream-file";

/**
 * Entrega de filme e documento ao CONVIDADO da Página de Integração.
 *
 * Rota própria, e não uma exceção dentro de `/uploads/[...path]`. A diferença
 * é de superfície: lá o pedido é por CAMINHO, e abrir uma brecha ali significa
 * que um descuido meu no portão do convidado expõe comprovante, documentação
 * pessoal e evidência de denúncia. Aqui o pedido é por ID DE PEÇA — o caminho
 * não vem do cliente, vem do banco. Um id que não é peça da integração não
 * resolve caminho nenhum, e não há o que vazar por engano.
 *
 * Três conferências antes de abrir o arquivo:
 *  1. cookie de convidado válido E link ainda não revogado (`resolveGuest`);
 *  2. a peça existe e tem arquivo;
 *  3. sendo FILME, ele não está TRANCADO para este convidado — senão bastaria
 *     pedir o id do 4º filme para pular a trilha inteira e assistir fora de
 *     ordem. É a mesma `getTrail` que a tela usa; a regra mora num lugar só.
 *
 * Fora do matcher do middleware (ver src/middleware.ts, prefixo
 * `api/integracao`), então o portão é este e não há outro.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const guest = await resolveGuest();
  if (!guest) return new Response("Não identificado", { status: 401 });

  const { assetId } = await params;
  const asset = await prisma.integrationAsset.findUnique({
    where: { id: assetId },
    select: { id: true, kind: true, filePath: true, thumbnailPath: true },
  });
  if (!asset) return new Response("Not found", { status: 404 });

  /**
   * A CAPA não passa pela trava da trilha, de propósito: o convidado precisa
   * ver o cartaz do filme que ainda não pode assistir — é o que faz a trilha
   * parecer uma trilha, e não uma lista de linhas cinzas. O que a trava
   * protege é o filme em si.
   */
  const cover = new URL(request.url).searchParams.get("capa") === "1";
  const publicPath = cover ? asset.thumbnailPath : asset.filePath;
  if (!publicPath) return new Response("Not found", { status: 404 });

  if (!cover && asset.kind === "FILME") {
    const trail = await getTrail(guest.guestId);
    // CONCLUIDO também passa: rever um filme já respondido é legítimo.
    if (trail.find((f) => f.id === asset.id)?.state === "TRANCADO") {
      return new Response("Filme ainda não liberado", { status: 403 });
    }
  }

  const filePath = resolveSafePath(segmentsFromPublicPath(publicPath));
  if (!filePath) return new Response("Not found", { status: 404 });

  // Cache curto, não anual: o acesso do convidado é REVOGÁVEL, e um ano de
  // cache deixaria o filme reabrindo do disco do navegador muito depois de o
  // DHO ter matado o link. Uma hora preserva o seek do vídeo (o navegador não
  // rebaixa cada arrasto da barra) sem transformar a revogação em ficção.
  return streamFile(request, filePath, { cacheControl: "private, max-age=3600" });
}
