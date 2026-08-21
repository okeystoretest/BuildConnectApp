-- Coordenadas de origem/destino do Trip passam a ser opcionais.
-- Motivo: quando a geocodificação (Nominatim) do endereço textual do
-- chamado falha, o Trip nasce sem pino e o mapa mostra apenas o GPS ao vivo.
-- Os labels (endereço textual) continuam obrigatórios.
ALTER TABLE "Trip" ALTER COLUMN "originLat" DROP NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "originLng" DROP NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "destLat" DROP NOT NULL;
ALTER TABLE "Trip" ALTER COLUMN "destLng" DROP NOT NULL;
