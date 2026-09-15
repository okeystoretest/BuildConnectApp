/**
 * Corpo do `POST /api/integracao/connect/chamados` do Flow, a partir do
 * Ticket gravado. Puro: testável sem banco. A partida sempre chega como
 * endereço (o Connect já copiou o endereço da unidade para o Ticket na
 * abertura), então `originUnit` não é usado.
 */
export interface TicketForFlow {
  id: string;
  code: string;
  serviceType: string | null;
  description: string | null;
  contact: string | null;
  departureStreet: string | null;
  departureNumber: string | null;
  departureDistrict: string | null;
  destStreet: string | null;
  destNumber: string | null;
  destDistrict: string | null;
}

export interface CreatePayload {
  connectId: string;
  code: string;
  requester: { connectId: string; name: string; sector: string | null };
  contact: string | null;
  serviceType: string;
  description: string;
  originStreet: string | null;
  originNumber: string | null;
  originDistrict: string | null;
  destStreet: string;
  destNumber: string | null;
  destDistrict: string | null;
  driverId: string | null;
}

export function buildCreatePayload(
  t: TicketForFlow,
  requester: { id: string; name: string; sector: string | null },
  driverId: string | null,
): CreatePayload {
  return {
    connectId: t.id,
    code: t.code,
    requester: { connectId: requester.id, name: requester.name, sector: requester.sector },
    contact: t.contact,
    serviceType: t.serviceType ?? "Transporte",
    description: t.description ?? t.code,
    originStreet: t.departureStreet,
    originNumber: t.departureNumber,
    originDistrict: t.departureDistrict,
    destStreet: t.destStreet ?? "Destino não informado",
    destNumber: t.destNumber,
    destDistrict: t.destDistrict,
    driverId,
  };
}
