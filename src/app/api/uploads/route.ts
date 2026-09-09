import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/require-user";
import { uploadSectorPhoto, uploadSectorVideo, uploadSectorDocument } from "@/lib/sector-actions";
import { uploadWelcomeVideo } from "@/lib/welcome-video-actions";
import { uploadPlatformWelcomeVideo } from "@/lib/platform-welcome-actions";
import { uploadIntegrationMap } from "@/lib/hr-actions";
import { completeTicketWithProof } from "@/lib/ticket-actions";
import { createItTicket } from "@/lib/tickets/actions";
import { submitAnonymousReport } from "@/lib/reports/actions";

/**
 * Porta única dos envios de arquivo — e ela existe por UM motivo: progresso.
 *
 * Server Action não reporta bytes enviados. O `fetch` que o Next monta por
 * baixo não emite evento de progresso de upload, então a tela só sabia dizer
 * "enviando" e ficar girando — por minutos, num vídeo de 110 MB. Quem emite
 * esse evento é o `XMLHttpRequest`, e XHR precisa de uma URL. Esta é a URL.
 *
 * O que ela NÃO faz é reimplementar regra: cada `kind` chama exatamente a
 * mesma função que a Server Action já chamava, com o mesmo FormData. Validação
 * de tamanho, gravação em disco, permissão e transação continuam onde estavam.
 *
 * Autenticação: conferida aqui, na entrada, porque esta rota fica FORA do
 * matcher do middleware (ver `middleware.ts`) — de propósito: o middleware
 * bufferiza o corpo inteiro antes de rodar, e pagar essa cópia de 145 MB para
 * conferir um cookie é justamente o portão que derrubava os envios de vídeo.
 * As guardas de permissão de cada função continuam valendo por cima desta.
 */

/** `denuncia` é anônima por desenho: é a única que não exige sessão. */
const ANONYMOUS_KINDS = new Set(["denuncia"]);

type Handler = (formData: FormData) => Promise<unknown>;

const HANDLERS: Record<string, Handler> = {
  "setor-foto": uploadSectorPhoto,
  "setor-video": uploadSectorVideo,
  "setor-documento": uploadSectorDocument,
  "boas-vindas-setor": uploadWelcomeVideo,
  "boas-vindas-plataforma": uploadPlatformWelcomeVideo,
  "mapa-integracao": uploadIntegrationMap,
  chamado: createItTicket,
  "chamado-comprovante": completeTicketWithProof,
  denuncia: submitAnonymousReport,
};

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    // Corpo interrompido no meio (rede caiu, aba fechada). Não é erro nosso.
    return NextResponse.json({ ok: false, error: "Envio interrompido." }, { status: 400 });
  }

  const kind = String(formData.get("uploadKind") ?? "");
  const handler = HANDLERS[kind];
  if (!handler) {
    return NextResponse.json({ ok: false, error: "Tipo de envio inválido." }, { status: 400 });
  }

  if (!ANONYMOUS_KINDS.has(kind)) {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "Sessão expirada. Faça login novamente." },
        { status: 401 },
      );
    }
  }

  try {
    const result = await handler(formData);
    // O resultado é o mesmo objeto que a Server Action devolvia — inclusive
    // `{ ok: false, error }`, que é resposta de negócio e não falha de HTTP.
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    console.error(`[api/uploads] ${kind}:`, e);
    return NextResponse.json({ ok: false, error: "Falha ao processar o envio." }, { status: 500 });
  }
}
