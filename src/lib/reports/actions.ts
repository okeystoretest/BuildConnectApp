"use server";

import { z } from "zod";
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { processAndStoreImages, ImageProcessingError } from "@/lib/storage/images";
import { MAX_REPORT_ATTACHMENTS, REPORT_TARGET_MIN_QUERY } from "@/types/report";

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

/**
 * Busca do destinatário da denúncia por trecho do nome.
 *
 * Sem consulta não há resposta: uma lista completa de colaboradores exposta
 * numa rota pública seria um diretório da empresa aberto na internet. O
 * mínimo de caracteres e o teto de 8 resultados existem por isso.
 */
export async function searchReportTargets(query: string): Promise<ReportTargetOption[]> {
  const term = query.trim();
  if (term.length < REPORT_TARGET_MIN_QUERY) return [];

  const people = await prisma.user.findMany({
    where: { active: true, fullName: { contains: term, mode: "insensitive" } },
    select: { id: true, fullName: true, sector: { select: { label: true } } },
    orderBy: { fullName: "asc" },
    take: 8,
  });

  return people.map((person) => ({
    id: person.id,
    name: person.fullName,
    sector: person.sector?.label ?? "—",
  }));
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
