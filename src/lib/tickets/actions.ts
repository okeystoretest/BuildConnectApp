"use server";

import { z } from "zod";
import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/require-user";
import {
  processAndStoreImages,
  ImageProcessingError,
} from "@/lib/storage/images";
import { OTHER_OPTION, getUnitAddress } from "@/lib/units";
import { MAX_TICKET_IMAGES } from "@/types/ticket-form";

/**
 * Abertura de chamado da Central de Motoristas.
 *
 * Fluxo:
 *  1. Autentica o solicitante.
 *  2. Valida os campos (Zod).
 *  3. Trata as fotos com sharp (→ .webp em disco) FORA da transação.
 *  4. Numera e grava ticket + imagens + notificação em transação única.
 *  5. Em falha do banco, desfaz os arquivos já gravados (sem órfãos).
 */

const driverTicketSchema = z
  .object({
    driver: z.string().trim().min(1, "Selecione o motorista."),
    departurePoint: z.string().trim().min(1, "Informe o ponto de partida."),
    departureStreet: z.string().trim().optional().default(""),
    departureNumber: z.string().trim().optional().default(""),
    departureDistrict: z.string().trim().optional().default(""),
    serviceType: z.string().trim().min(1, "Selecione o tipo de serviço."),
    street: z.string().trim().min(1, "Informe o logradouro de destino."),
    number: z.string().trim().optional().default(""),
    district: z.string().trim().optional().default(""),
    description: z.string().trim().min(1, "Descreva a atividade solicitada."),
    contact: z.string().trim().optional().default(""),
  })
  .superRefine((data, ctx) => {
    // Partida "Outro" exige endereço manual.
    if (data.departurePoint === OTHER_OPTION && !data.departureStreet) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departureStreet"],
        message: "Informe o logradouro de partida.",
      });
    }
  });

export interface CreateTicketResult {
  ok: boolean;
  code?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/** Próximo código sequencial (#2050, #2051, ...). */
async function nextTicketCode(): Promise<string> {
  const BASE = 2050;
  const count = await prisma.ticket.count();
  return `#${BASE + count}`;
}

export async function createDriverTicket(
  formData: FormData,
): Promise<CreateTicketResult> {
  // 1. Autenticação.
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Faça login novamente." };
  }

  // 2. Validação dos campos textuais.
  const raw = {
    driver: formData.get("driver"),
    departurePoint: formData.get("departurePoint"),
    departureStreet: formData.get("departureStreet"),
    departureNumber: formData.get("departureNumber"),
    departureDistrict: formData.get("departureDistrict"),
    serviceType: formData.get("serviceType"),
    street: formData.get("street"),
    number: formData.get("number"),
    district: formData.get("district"),
    description: formData.get("description"),
    contact: formData.get("contact"),
  };

  const parsed = driverTicketSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }
  const data = parsed.data;

  // Resolve o endereço de PARTIDA. Quando o ponto de partida é uma unidade
  // conhecida, o formulário não preenche os campos manuais (só exibe o
  // endereço vinculado) — então copiamos o endereço da unidade aqui, no
  // servidor, para que a partida fique PERSISTIDA no chamado (essencial para
  // exibição em "Meus Chamados" e para o tracking geocodificar a origem).
  // Quando é "Outro", usam-se os campos digitados.
  let departureStreet = data.departureStreet;
  let departureNumber = data.departureNumber;
  let departureDistrict = data.departureDistrict;
  if (data.departurePoint !== OTHER_OPTION) {
    const unitAddress = getUnitAddress(data.departurePoint);
    if (unitAddress) {
      departureStreet = unitAddress.street;
      departureNumber = unitAddress.number;
      departureDistrict = unitAddress.district;
    }
  }

  // 3. Imagens: valida quantidade e trata com sharp fora da transação.
  const rawImages = formData
    .getAll("images")
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (rawImages.length > MAX_TICKET_IMAGES) {
    return { ok: false, error: `Máximo de ${MAX_TICKET_IMAGES} imagens.` };
  }

  let storedImages: Awaited<ReturnType<typeof processAndStoreImages>> = [];
  try {
    storedImages = await processAndStoreImages(rawImages, "chamados");
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      return { ok: false, error: error.message };
    }
    console.error("[createDriverTicket] falha ao tratar imagens:", error);
    return { ok: false, error: "Falha ao processar as imagens. Tente novamente." };
  }

  // 4. Transação: ticket + imagens + notificação, atômico.
  try {
    const code = await nextTicketCode();
    const title = `${data.serviceType} — ${data.street}`;

    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.ticket.create({
        data: {
          code,
          destination: "MOTORISTAS",
          status: "PENDENTE",
          title,
          description: data.description,
          requesterId: user.id,
          unitId: user.unitId,
          serviceType: data.serviceType,
          departureStreet: departureStreet || null,
          departureNumber: departureNumber || null,
          departureDistrict: departureDistrict || null,
          destStreet: data.street,
          destNumber: data.number || null,
          destDistrict: data.district || null,
          contact: data.contact || null,
        },
      });

      if (storedImages.length > 0) {
        await tx.ticketImage.createMany({
          data: storedImages.map((img, index) => ({
            ticketId: created.id,
            filePath: img.publicPath,
            order: index,
          })),
        });
      }

      await tx.notification.create({
        data: {
          kind: "CHAMADO_MOTORISTAS",
          title: "Novo chamado de Motoristas",
          body: `${code} · ${title}`,
          href: "/setores/motoristas",
          audience: ["Motoristas", "Logística"],
        },
      });

      return created;
    });

    return { ok: true, code: ticket.code };
  } catch (error) {
    // Rollback físico: a transação do banco falhou, remove os arquivos.
    await Promise.allSettled(storedImages.map((img) => unlink(img.absolutePath)));
    console.error("[createDriverTicket] falha ao gravar chamado:", error);
    return {
      ok: false,
      error: "Erro ao registrar o chamado. Tente novamente em instantes.",
    };
  }
}

/**
 * Abertura de chamado de TI.
 * Mesma espinha do chamado de motoristas: valida, trata imagens com sharp
 * fora da transação, e grava ticket + imagens + notificação atomicamente.
 */

const itTicketSchema = z.object({
  category: z.string().trim().min(1, "Selecione a categoria."),
  description: z.string().trim().min(1, "Descreva o problema."),
});

export async function createItTicket(formData: FormData): Promise<CreateTicketResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Sessão expirada. Faça login novamente." };
  }

  const parsed = itTicketSchema.safeParse({
    category: formData.get("category"),
    description: formData.get("description"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { ok: false, error: "Revise os campos destacados.", fieldErrors };
  }
  const data = parsed.data;

  const rawImages = formData
    .getAll("images")
    .filter((v): v is File => v instanceof File && v.size > 0);
  if (rawImages.length > MAX_TICKET_IMAGES) {
    return { ok: false, error: `Máximo de ${MAX_TICKET_IMAGES} imagens.` };
  }

  let storedImages: Awaited<ReturnType<typeof processAndStoreImages>> = [];
  try {
    storedImages = await processAndStoreImages(rawImages, "chamados");
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      return { ok: false, error: error.message };
    }
    console.error("[createItTicket] falha ao tratar imagens:", error);
    return { ok: false, error: "Falha ao processar as imagens. Tente novamente." };
  }

  try {
    const code = await nextTicketCode();
    // Título: categoria + início da descrição.
    const snippet = data.description.length > 48
      ? `${data.description.slice(0, 48)}…`
      : data.description;
    const title = `${data.category} — ${snippet}`;

    const ticket = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.ticket.create({
        data: {
          code,
          destination: "TI",
          status: "PENDENTE",
          title,
          description: data.description,
          requesterId: user.id,
          unitId: user.unitId,
          category: data.category,
        },
      });

      if (storedImages.length > 0) {
        await tx.ticketImage.createMany({
          data: storedImages.map((img, index) => ({
            ticketId: created.id,
            filePath: img.publicPath,
            order: index,
          })),
        });
      }

      await tx.notification.create({
        data: {
          kind: "CHAMADO_TI",
          title: "Novo chamado de TI",
          body: `${code} · ${title}`,
          href: "/setores/ti",
          audience: ["TI"],
        },
      });

      return created;
    });

    revalidatePath("/setores/ti");
    revalidatePath("/chamados");
    return { ok: true, code: ticket.code };
  } catch (error) {
    await Promise.allSettled(storedImages.map((img) => unlink(img.absolutePath)));
    console.error("[createItTicket] falha ao gravar chamado:", error);
    return {
      ok: false,
      error: "Erro ao registrar o chamado. Tente novamente em instantes.",
    };
  }
}
