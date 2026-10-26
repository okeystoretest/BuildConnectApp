import { isoDateBR } from "@/lib/brasilia";

/**
 * Vencimento de documento no Departamento Pessoal — as regras puras.
 *
 * Tudo aqui trabalha em "aaaa-mm-dd", nunca em `Date`. Vencimento é dia de
 * calendário, e `Date` arrastaria um instante: a coluna é `DATE`, o Prisma a
 * devolve como meia-noite UTC, e meia-noite UTC lida no fuso de Brasília cai
 * no dia ANTERIOR — um ASO que vence dia 1º apareceria vencido no dia 30.
 * Dia contra dia não tem fuso para errar.
 *
 * Sem Prisma neste módulo: é o que o teste unitário prova.
 */

/**
 * A partir de quantos dias de antecedência a pasta entra em "Cuidado".
 *
 * Trinta dias porque é o prazo em que o DHO consegue agendar exame, cobrar
 * documento e receber de volta — avisar na véspera não dá tempo de resolver,
 * e avisar com três meses deixa a pasta amarela mais tempo do que verde.
 */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * O estado de uma pasta, do mais grave ao mais tranquilo.
 *
 * `pendente` é não ter entregue nada — é o estado que a ferramenta existe para
 * mostrar. `vencido` e `cuidado` só existem para pasta com vencimento gravado.
 * `opcional` é pasta vazia que NÃO é falta: certidão de filho menor para quem
 * não tem filho menor não é pendência de ninguém.
 */
export type FolderStatus = "pendente" | "vencido" | "cuidado" | "ok" | "opcional";

/** Dia de calendário de hoje em Brasília, no formato das comparações. */
export function todayBR(now: Date = new Date()): string {
  return isoDateBR(now);
}

/**
 * A data de uma coluna `DATE` como dia de calendário.
 *
 * Lê as partes em UTC de propósito: o Postgres devolve `DATE` como meia-noite
 * UTC, então é o calendário UTC que contém o dia gravado.
 */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * O dia que cai `days` dias depois de `day`.
 *
 * Em UTC, como todo o resto deste módulo: somar 365 dias a um `Date` local
 * atravessaria o horário de verão e devolveria o dia anterior em alguns anos.
 */
export function addDays(day: string, days: number): string {
  return isoDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000));
}

/** Dias de calendário entre dois dias; negativo quando `day` já passou. */
export function daysUntil(day: string, today: string): number {
  return (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
}

/**
 * O estado de UMA pasta.
 *
 * Pasta vazia é `pendente` mesmo tendo vencimento marcado: não há documento
 * para vencer, e "vencido" sugeriria que um dia houve um.
 */
export function folderStatus(
  hasFiles: boolean,
  expiresOn: string | null,
  today: string,
  optional = false,
): FolderStatus {
  // Vazia e opcional não é falta; vazia e obrigatória é o ponto da ferramenta.
  if (!hasFiles) return optional ? "opcional" : "pendente";
  if (!expiresOn) return "ok";
  const days = daysUntil(expiresOn, today);
  if (days < 0) return "vencido";
  return days <= EXPIRY_WARNING_DAYS ? "cuidado" : "ok";
}

const SEVERITY: Record<FolderStatus, number> = {
  pendente: 3,
  vencido: 2,
  cuidado: 1,
  ok: 0,
  // Zero, igual a `ok`: pasta opcional vazia não piora o estado de ninguém. E
  // como `personStatus` começa em `ok` e só troca quando a severidade é MAIOR,
  // `opcional` nunca vira o estado de uma pessoa — o que manteria os quatro
  // contadores do painel sem fechar com o total.
  opcional: 0,
};

/**
 * O estado de uma PESSOA: o pior estado entre as pastas dela.
 *
 * Um estado só por pessoa, e não uma soma de estados, porque é assim que os
 * contadores do painel fecham com o total do quadro — cada colaborador conta
 * uma vez.
 *
 * `pendente` ganha de `vencido` porque documento que nunca chegou é o furo
 * maior: o vencido ao menos foi entregue um dia e está no dossiê.
 */
export function personStatus(folders: readonly FolderStatus[]): FolderStatus {
  let worst: FolderStatus = "ok";
  for (const f of folders) if (SEVERITY[f] > SEVERITY[worst]) worst = f;
  return worst;
}

/** "dd/mm/aaaa" a partir de "aaaa-mm-dd". */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * O "aaaa-mm-dd" que o formulário mandou, ou `null` se não é um dia válido.
 *
 * Confere o calendário, e não só o formato: `2026-02-31` casa com a expressão
 * e viraria 3 de março se fosse direto para o `Date`.
 */
export function parseDay(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return isoDay(parsed) === value ? value : null;
}

/**
 * A linha que descreve o estado de uma pasta, em palavras.
 *
 * Mora aqui, e não na tela, porque DUAS telas a dizem — o ladrilho do
 * Departamento Pessoal e o modal do card em "Meu Setor". Duas cópias do
 * ternário divergiriam na primeira mudança de texto, e aí o mesmo documento
 * apareceria "Vencido" num lugar e "Pendente" no outro.
 *
 * `pendente` não ganha data mesmo tendo vencimento gravado: é o que
 * `folderStatus` já decidiu, e repetir a data aqui contradiria a palavra.
 */
export function folderStatusLabel(
  status: FolderStatus,
  expiresOn: string | null,
  fileCount: number,
): string {
  if (status === "opcional") return "Opcional";
  if (status === "pendente") return "Pendente";
  if (status === "vencido" && expiresOn) return `Vencido em ${dayLabel(expiresOn)}`;
  if (status === "cuidado" && expiresOn) return `Vence em ${dayLabel(expiresOn)}`;
  return `${fileCount} ${fileCount === 1 ? "arquivo" : "arquivos"}`;
}
