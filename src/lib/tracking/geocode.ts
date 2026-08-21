import "server-only";

/**
 * Geocodificação de endereços via Nominatim (OpenStreetMap).
 *
 * Uso deliberadamente conservador:
 *  - O Ticket guarda endereço como texto livre (rua/número/bairro), sem CEP
 *    nem cidade. A taxa de acerto é baixa, então tratamos a falha como o
 *    caso normal, não como exceção: quando não resolvemos com confiança,
 *    devolvemos null e o mapa degrada para "só GPS ao vivo".
 *  - A coordenada resolvida é persistida no Trip na criação. NUNCA
 *    geocodificamos a cada polling.
 *  - Nominatim exige User-Agent identificável e limita a ~1 req/s. Como só
 *    chamamos no startTrip (origem + destino, uma vez), ficamos folgados.
 */

export interface GeoResult {
  lat: number;
  lng: number;
}

/** Cidade/UF assumidos por padrão para qualificar o endereço. */
const DEFAULT_CITY = process.env.GEOCODE_DEFAULT_CITY?.trim() || "Fortaleza";
const DEFAULT_STATE = process.env.GEOCODE_DEFAULT_STATE?.trim() || "Ceará";
const DEFAULT_COUNTRY = "Brasil";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  process.env.GEOCODE_USER_AGENT?.trim() ||
  "BuildConnect/1.0 (onboarding-app; contato@build.connect)";

const REQUEST_TIMEOUT_MS = 6000;

export interface AddressParts {
  street?: string | null;
  number?: string | null;
  district?: string | null;
}

/** Monta uma linha de endereço a partir das partes do Ticket. */
export function composeAddress(parts: AddressParts): string | null {
  const street = parts.street?.trim();
  if (!street) return null;

  const number = parts.number?.trim();
  const district = parts.district?.trim();

  const line = [street, number].filter(Boolean).join(", ");
  const tail = [district, DEFAULT_CITY, DEFAULT_STATE, DEFAULT_COUNTRY]
    .filter(Boolean)
    .join(", ");

  return `${line} - ${tail}`;
}

interface NominatimHit {
  lat: string;
  lon: string;
  importance?: number;
}

/**
 * Resolve um endereço em coordenadas. Retorna null em qualquer falha
 * (rede, timeout, sem resultado, resposta malformada) — o chamador trata
 * null como "sem pino", nunca como erro fatal.
 */
export async function geocodeAddress(query: string | null): Promise<GeoResult | null> {
  if (!query) return null;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "pt-BR",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) return null;

    const data = (await res.json()) as NominatimHit[];
    const hit = data[0];
    if (!hit) return null;

    const lat = Number(hit.lat);
    const lng = Number(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    // Timeout, rede indisponível, JSON inválido — todos caem aqui.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Geocodifica origem e destino em sequência (respeitando o rate limit do
 * Nominatim). Qualquer lado pode voltar null independentemente.
 */
export async function geocodeTripEndpoints(
  origin: AddressParts,
  destination: AddressParts,
): Promise<{ origin: GeoResult | null; destination: GeoResult | null }> {
  const originResult = await geocodeAddress(composeAddress(origin));
  const destinationResult = await geocodeAddress(composeAddress(destination));
  return { origin: originResult, destination: destinationResult };
}
