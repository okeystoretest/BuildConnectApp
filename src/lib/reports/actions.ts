"use server";

import { z } from "zod";
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { processAndStoreImages, ImageProcessingError } from "@/lib/storage/images";
import { consume, clientIp } from "@/lib/rate-limit";
import { issueTicket, readTicket } from "@/lib/reports/ticket";
import { MAX_REPORT_ATTACHMENTS, REPORT_TARGET_MIN_QUERY } from "@/types/report";

/**
 * Tetos das duas actions públicas.
 *
 * A busca é generosa o bastante para quem digita um nome (o modal tem debounce
 * de 300 ms), e apertada o bastante para inviabilizar varrer o alfabeto e
 * reconstruir o quadro de colaboradores. O envio limita enxurrada de denúncia
 * falsa e o consumo de disco da VPS por quem não fez login.
 */
const SEARCH_WINDOW_MS = 60 * 1000;
const MAX_SEARCHES_PER_IP = 30;
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_SUBMITS_PER_IP = 5;
// Teto por bilhete de formulário e teto de bilhetes por IP. Multiplicados, são
// o limite real de extração: mesmo automatizado, ninguém puxa a lista inteira.
const TICKET_WINDOW_MS = 60 * 60 * 1000;
const MAX_SEARCHES_PER_TICKET = 25;
const MAX_TICKETS_PER_IP = 6;

/**
 * Abre uma sessão de preenchimento e devolve o bilhete assinado.
 *
 * Chamada quando o modal abre. Não identifica ninguém (id aleatório, nada
 * gravado): serve só para dar um teto de buscas a cada abertura do formulário.
 */
export async function openReportSession(): Promise<{ ticket: string | null }> {
  const limit = await consume(
    "report-session:" + (await clientIp()),
    MAX_TICKETS_PER_IP,
    TICKET_WINDOW_MS,
  );
  if (!limit.ok) return { ticket: null };
  return { ticket: issueTicket() };
}

/**
 * Canal PÚBLICO da Central de Denúncias.
 *
 * As duas actions deste arquivo rodam SEM sessão — são chamadas da tela de
 * login, antes de qualquer autenticação. Isso é o requisito, não um descuido:
 * obrigar o denunciante a entrar na plataforma já o identificaria.
 *
 * Em troca do anonimato, a superfície é deliberadamente estreita:
 *  - a busca de destinatário exige um trecho do nome (nunca lista a empresa
 *    inteira) e devolve no máximo 8 resultados, só id e nome;
 *  - o relato tem teto de tamanho e as evidências passam pelo mesmo
 *    tratamento de imagem do resto do sistema (sharp → .webp em disco),
 *    limitadas a 5;
 *  - nada é devolvido ao cliente além do código gerado.
 *
 * A LEITURA das denúncias não está aqui: é exclusiva do DHO
 * (lib/reports/admin-actions.ts, atrás de `reports.manage`).
 */

export interface ReportTargetOption {
  id: string;
  name: string;
  /** Setor, para diferenciar homônimos na lista. */
  sector: string;
}

export interface ReportSearchResult {
  targets: ReportTargetOption[];
  /** true quando o bilhete venceu/esgotou e o formulário deve pedir outro. */
  renew?: boolean;
}

/**
 * Busca do destinatário da denúncia por trecho do nome.
 *
 * Sem consulta não há resposta: uma lista completa de colaboradores exposta
 * numa rota pública seria um diretório da empresa aberto na internet. O mínimo
 * de caracteres, o teto de 8 resultados, o limite por IP e o bilhete de
 * formulário existem por isso.
 */
export async function searchReportTargets(
  query: string,
  ticket: string,
): Promise<ReportSearchResult> {
  const ticketId = readTicket(ticket);
  if (!ticketId) return { targets: [], renew: true };

  const term = query.trim();
  if (term.length < REPORT_TARGET_MIN_QUERY) return { targets: [] };

  const porBilhete = await consume(
    "report-ticket:" + ticketId,
    MAX_SEARCHES_PER_TICKET,
    TICKET_WINDOW_MS,
  );
  if (!porBilhete.ok) return { targets: [], renew: true };

  const limit = await consume(
    "report-search:" + (await clientIp()),
    MAX_SEARCHES_PER_IP,
    SEARCH_WINDOW_MS,
  );
  if (!limit.ok) return { targets: [] };

  const people = await prisma.user.findMany({
    where: { active: true, fullName: { contains: term, mode: "insensitive" } },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
    orderBy: { fullName: "asc" },
    take: 8,
  });

  return {
    targets: people.map((person) => ({
      id: person.id,
      name: person.fullName,
      sector: person.sector?.label ?? "—",
    })),
  };
}

const reportSchema = z.object({
  targetUserId: z.string().min(1, "Selecione a quem a denúncia se destina."),
  description: z
    .string()
    .trim()
    .min(20, "Descreva o ocorrido com pelo menos 20 caracteres.")
    .max(5000, "Relato muito longo."),
});

export interface SubmitReportResult {
  ok: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Próximo código da denúncia (DEN-001, DEN-002, ...).
 *
 * Sai do maior número já emitido, não da contagem de linhas — e como denúncia
 * nunca é excluída, as duas contas coincidem hoje; a primeira continua correta
 * se isso mudar.
 */
async function nextReportCode(): Promise<string> {
  const rows = await prisma.report.findMany({ select: { code: true } });

  let highest = 0;
  for (const row of rows as Array<{ code: string }>) {
    const value = Number.parseInt(row.code.slice("DEN-".length), 10);
    if (Number.isFinite(value) && value > highest) highest = value;
  }
  return `DEN-${String(highest + 1).padStart(3, "0")}`;
}

/**
 * Registro de uma denúncia anônima.
 *
 * Mesma espinha da abertura de chamado: valida, trata as imagens com sharp
 * FORA da transação e grava denúncia + evidências atomicamente. Se o banco
 * falhar, os arquivos recém-gravados são removidos do disco — nenhum órfão
 * fica na VPS.
 */
export async function submitAnonymousReport(formData: FormData): Promise<SubmitReportResult> {
  // Envio também exige o bilhete: fecha o caminho de despejar denúncias por
  // script sem nem abrir o formulário.
  if (!readTicket(String(formData.get("ticket") ?? ""))) {
    return {
      ok: false,
      error: "Sessão do formulário expirada. Feche e abra a denúncia novamente.",
    };
  }

  const limit = await consume(
    "report-submit:" + (await clientIp()),
    MAX_SUBMITS_PER_IP,
    SUBMIT_WINDOW_MS,
  );
  if (!limit.ok) {
    return {
      ok: false,
      error: "Muitos envios seguidos. Tente novamente mais tarde.",
    };
  }

  const parsed = reportSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }
  const data = parsed.data;

  // O nome vem do banco, não do formulário: o cliente escolhe QUEM, não como
  // essa pessoa será registrada.
  const target = await prisma.user.findFirst({
    where: { id: data.targetUserId, active: true },
    select: { id: true, fullName: true },
  });
  if (!target) {
    return {
      ok: false,
      error: "Não encontramos essa pessoa. Busque o nome novamente.",
      fieldErrors: { targetUserId: "Selecione um nome da lista." },
    };
  }

  const rawImages = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (rawImages.length > MAX_REPORT_ATTACHMENTS) {
    return { ok: false, error: `Máximo de ${MAX_REPORT_ATTACHMENTS} evidências.` };
  }

  let stored: Awaited<ReturnType<typeof processAndStoreImages>> = [];
  try {
    stored = await processAndStoreImages(rawImages, "denuncias");
  } catch (error) {
    if (error instanceof ImageProcessingError) return { ok: false, error: error.message };
    console.error("[submitAnonymousReport] imagens:", error);
    return { ok: false, error: "Falha ao processar as evidências. Tente novamente." };
  }

  try {
    const code = await nextReportCode();

    const report = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.report.create({
        data: {
          code,
          targetUserId: target.id,
          targetName: target.fullName,
          description: data.description,
        },
      });

      if (stored.length > 0) {
        await tx.reportAttachment.createMany({
          data: stored.map((image, index) => ({
            reportId: created.id,
            filePath: image.publicPath,
            order: index,
          })),
        });
      }

      return created;
    });

    revalidatePath("/setores/rh");
    return { ok: true, code: report.code };
  } catch (error) {
    await Promise.allSettled(stored.map((image) => unlink(image.absolutePath)));
    console.error("[submitAnonymousReport] db:", error);
    return { ok: false, error: "Não foi possível registrar a denúncia. Tente novamente." };
  }
}
