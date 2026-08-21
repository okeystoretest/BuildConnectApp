-- Rótulos de escala por instrumento (ex.: Comportamental usa E/S/R/I).
-- Vazio = escala numérica pura (Pré-Efetivo 1..5).
ALTER TABLE "EvaluationType" ADD COLUMN "scaleLabels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
