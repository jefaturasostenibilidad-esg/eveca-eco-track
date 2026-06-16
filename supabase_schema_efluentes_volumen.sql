-- Nuevos campos para cálculo geométrico de volumen en TK1/TK3
ALTER TABLE public.registros_efluentes
  ADD COLUMN IF NOT EXISTS nivel_liquido_cm NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS diametro_m NUMERIC(8,3),
  ADD COLUMN IF NOT EXISTS radio_m NUMERIC(8,3);
