import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import { canReadPersonnelOf } from "@/lib/auth/access";
import { isRenderable, parsePageParam, renderWatermarked } from "@/lib/personnel-render";
import { toAbsolutePath } from "@/lib/storage/config";
import type { Role } from "@/types";

/**
 * Uma página de documento pessoal, como IMAGEM com marca d'água.
 *
 * É o único caminho do Gestor até o conteúdo: o arquivo original fica atrás de
 * `/uploads/pessoal`, que só o DHO e o Admin abrem. Aqui não existe o arquivo
 * — existe uma fotografia dele, assinada com o nome de quem pediu.
 *
 * Nunca cacheada, e é o ponto: a marca d'água é de quem está olhando, então
 * uma resposta guardada serviria a imagem de um usuário para outro — e, pior,
 * deixaria no disco do navegador uma cópia que não passa mais por portão
 * nenhum quando o acesso for retirado.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const { fileId } = await params;
  const file = await prisma.personnelFile.findUnique({
    where: { id: fileId },
    select: { ownerId: true, filePath: true },
  });
  // Mesma resposta para "não existe" e "não é seu": um 404 distinto confirmaria
  // a quem tenta ids que aquele documento existe.
  if (!file || !(await canReadPersonnelOf(user.id, user.role as Role, file.ownerId))) {
    return new Response("Sem permissão", { status: 403 });
  }

  if (!isRenderable(file.filePath)) {
    return new Response("Formato sem visualizador", { status: 415 });
  }
  const absolute = toAbsolutePath(file.filePath);
  if (!absolute) return new Response("Arquivo indisponível", { status: 404 });

  const page = parsePageParam(new URL(request.url).searchParams.get("pagina"));

  try {
    const { image, pages } = await renderWatermarked(
      absolute,
      page,
      user.fullName,
    );
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        // A tela usa o total para decidir se desenha a navegação de páginas.
        "X-Total-Pages": String(pages),
      },
    });
  } catch (e) {
    // PDF corrompido ou protegido por senha chega aqui. O documento existe e a
    // pessoa tem acesso — o que falhou foi a conversão.
    console.error("[documentos-pessoais] render:", e);
    return new Response("Falha ao preparar o documento", { status: 500 });
  }
}
