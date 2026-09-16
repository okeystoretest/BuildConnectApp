import { readFile } from "node:fs/promises";
import { flowEnv } from "./env";
import { flowStateSchema, type FlowTicketState } from "./mirror";
import type { CreatePayload } from "./payload";

/**
 * Cliente HTTP do Build.Flow. Toda chamada leva o token de serviço; nenhuma
 * usa sessão de usuário. Falha de rede, 5xx ou 503 vira FlowUnavailableError
 * — quem chama decide se guarda para reenviar (abertura) ou degrada (lista de
 * motoristas, rastreamento).
 */
export class FlowUnavailableError extends Error {
  constructor(message = "Build.Flow indisponível.") {
    super(message);
    this.name = "FlowUnavailableError";
  }
}

const TIMEOUT_MS = 8_000;

async function flowFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const env = flowEnv();
  if (!env) throw new FlowUnavailableError("Integração com o Build.Flow não configurada.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${env.apiToken}` },
      signal: controller.signal,
      cache: "no-store",
    });
    if (res.status >= 500) throw new FlowUnavailableError(`Build.Flow respondeu ${res.status}.`);
    return res;
  } catch (e) {
    if (e instanceof FlowUnavailableError) throw e;
    throw new FlowUnavailableError();
  } finally {
    clearTimeout(timer);
  }
}

// ——— Criação ———
export async function createFlowTransport(
  payload: CreatePayload,
  images: { absolutePath: string; fileName: string }[],
): Promise<{ id: string; status: string; driver: { id: string; name: string } | null }> {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  for (const img of images) {
    const bytes = await readFile(img.absolutePath);
    form.append("images", new Blob([bytes], { type: "image/webp" }), img.fileName);
  }
  const res = await flowFetch("/api/integracao/connect/chamados", { method: "POST", body: form });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Build.Flow recusou o chamado (${res.status}).`);
  }
  return (await res.json()) as { id: string; status: string; driver: { id: string; name: string } | null };
}

// ——— Leitura ———
export async function getFlowTransport(connectId: string): Promise<(FlowTicketState & { id: string }) | null> {
  const res = await flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new FlowUnavailableError(`Build.Flow respondeu ${res.status}.`);
  const raw = (await res.json()) as { id: string; driver: { name: string } | null } & Record<string, unknown>;
  const parsed = flowStateSchema.safeParse({ ...raw, driverName: raw.driver?.name ?? null });
  if (!parsed.success) throw new FlowUnavailableError("Resposta do Build.Flow fora do contrato.");
  return { ...parsed.data, id: raw.id };
}

export function fetchFlowTracking(connectId: string): Promise<Response> {
  return flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}/rastreamento`);
}

export function fetchFlowProof(connectId: string): Promise<Response> {
  return flowFetch(`/api/integracao/connect/chamados/${encodeURIComponent(connectId)}/comprovante`);
}
