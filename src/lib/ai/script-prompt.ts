import { BRAND, FUNNEL, PLATFORM, STATUS_LABEL, formatLabel, resolveFormats } from "@/lib/funnel";
import type {
  ContentBrand,
  ContentFormat,
  ContentPlatform,
  ContentStatus,
  FunnelStage,
} from "@/types/cronograma";

/**
 * O que o Gemini recebe para escrever um roteiro.
 *
 * Duas partes, e a separação importa:
 *  - a INSTRUÇÃO DO SISTEMA é o comportamento — escrita pela administração na
 *    Retaguarda (Padrão + marca), e é dela que vem tom, idioma, estrutura;
 *  - o PROMPT é o card — os campos do formulário, uma linha por campo, nos
 *    mesmos rótulos que a tela mostra (lib/funnel), para a pessoa reconhecer
 *    no roteiro o que preencheu.
 *
 * Campo vazio não vira linha. "Marca: não informada" só ensinaria o modelo a
 * comentar a ausência.
 */

export interface ScriptSubject {
  title: string;
  /** yyyy-mm-dd, como em ContentPostItem. */
  date: string;
  /** hh:mm. */
  time: string;
  funnel: FunnelStage;
  formats: readonly ContentFormat[];
  formatOther?: string;
  status: ContentStatus;
  brand?: ContentBrand;
  platforms: readonly ContentPlatform[];
  notes?: string;
  ownerName?: string;
}

/**
 * Usada quando NENHUMA instrução foi escrita na Retaguarda — para a
 * funcionalidade funcionar no dia em que a chave for colada.
 */
export const FALLBACK_INSTRUCTION =
  "Você é roteirista de conteúdo para redes sociais. Escreva em português do Brasil. Responda apenas com o roteiro.";

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function buildScriptPrompt(subject: ScriptSubject): string {
  const lines: string[] = [
    `Título: ${subject.title}`,
    `Data e horário: ${formatDate(subject.date)} às ${subject.time}`,
    `Etapa do funil: ${FUNNEL[subject.funnel].label}`,
  ];

  const formats = resolveFormats(subject.formats);
  if (formats.length > 0) {
    lines.push(`Formatos: ${formats.map((f) => formatLabel(f, subject.formatOther)).join(", ")}`);
  }
  if (subject.platforms.length > 0) {
    lines.push(`Redes: ${subject.platforms.map((p) => PLATFORM[p].label).join(", ")}`);
  }
  if (subject.brand) lines.push(`Marca: ${BRAND[subject.brand].label}`);
  lines.push(`Status: ${STATUS_LABEL[subject.status]}`);
  if (subject.ownerName) lines.push(`Responsável: ${subject.ownerName}`);

  const notes = subject.notes?.trim();
  if (notes) lines.push(`Observações:\n${notes}`);

  return `Crie o roteiro para a atividade abaixo do cronograma de conteúdo.\n\n${lines.join("\n")}`;
}

/**
 * Padrão sempre primeiro (as regras da casa), marca depois (o tom). Quem
 * escreve a instrução da marca não precisa repetir as regras gerais.
 */
export function composeSystemInstruction(
  defaultBody: string | null | undefined,
  brandBody: string | null | undefined,
): string {
  const parts = [defaultBody?.trim(), brandBody?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join("\n\n") : FALLBACK_INSTRUCTION;
}
