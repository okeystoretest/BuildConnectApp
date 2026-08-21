export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TrackedAddress extends GeoPoint {
  label: string;
}

export type TripStatus = "AGUARDANDO" | "EM_ROTA" | "CONCLUIDA" | "CANCELADA";

export interface DriverPosition extends GeoPoint {
  /** ISO 8601. */
  recordedAt: string;
  /** Graus, 0 = norte. Ausente quando parado. */
  heading?: number;
  /** km/h. */
  speed?: number;
}

export interface TripTracking {
  ticketId: string;
  status: TripStatus;
  driverName: string;
  vehicleLabel?: string;
  origin: TrackedAddress;
  destination: TrackedAddress;
  position: DriverPosition | null;
  /** Rastro percorrido, do mais antigo ao mais recente. */
  trail: readonly GeoPoint[];
  etaMinutes: number | null;
  remainingKm: number | null;
  startedAtLabel?: string;
  /** Origem/destino têm coordenada geocodificada válida? Quando false, o
   *  mapa não plota o pino correspondente (evita marcador em 0,0). */
  hasOrigin: boolean;
  hasDestination: boolean;
}

export const TRIP_STATUS_LABEL: Record<TripStatus, string> = {
  AGUARDANDO: "Aguardando início",
  EM_ROTA: "Em rota",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TRIP_STATUS_TONE: Record<TripStatus, "warning" | "accent" | "primary" | "danger"> = {
  AGUARDANDO: "warning",
  EM_ROTA: "accent",
  CONCLUIDA: "primary",
  CANCELADA: "danger",
};
