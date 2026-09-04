import { isValidPhone, normalizePhone } from "@/lib/phone";

/**
 * Do telefone cadastrado ao endereço do WhatsApp.
 *
 * Puro e sem Baileys de propósito: é a tradução que decide se a mensagem tem
 * para onde ir, e errar aqui é errar em silêncio — a mensagem "some" sem erro
 * nenhum. Precisa de teste, não de inspeção visual.
 */

/** Brasil. Sai de env para não exigir deploy se um dia mudar. */
export const COUNTRY_CODE = process.env.WHATSAPP_COUNTRY_CODE || "55";

const SUFFIX = "@s.whatsapp.net";

/**
 * Endereço principal do número, ou `null` se ele não serve.
 *
 * Devolve `null` em vez de lançar porque um cadastro torto é caso esperado —
 * quem foi cadastrado antes de o campo existir tem telefone nulo — e não pode
 * derrubar o envio para os demais destinatários.
 */
export function toWhatsappJid(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = normalizePhone(phone);
  if (!isValidPhone(digits)) return null;
  return `${COUNTRY_CODE}${digits}${SUFFIX}`;
}

/**
 * Todas as formas em que este número PODE estar registrado no WhatsApp.
 *
 * O Brasil ganhou o nono dígito no celular em 2012, mas as contas de WhatsApp
 * criadas antes disso seguem registradas sem ele. Mandar só para a forma nova
 * simplesmente não entrega a essas contas — sem erro, sem aviso, a mensagem
 * some.
 *
 * Por isso a lista, e não um endereço só: quem envia confere qual delas existe
 * de fato (`sock.onWhatsApp`) antes de mandar. A ordem importa — a forma atual
 * vem primeiro, porque é a certa para a esmagadora maioria.
 */
export function jidCandidates(phone: string | null | undefined): string[] {
  const principal = toWhatsappJid(phone);
  if (!principal) return [];

  const digits = normalizePhone(phone as string);
  // Só celular tem nono dígito a perder: 11 dígitos, com o 9 na terceira casa.
  if (digits.length !== 11) return [principal];

  const semNono = digits.slice(0, 2) + digits.slice(3);
  return [principal, `${COUNTRY_CODE}${semNono}${SUFFIX}`];
}
