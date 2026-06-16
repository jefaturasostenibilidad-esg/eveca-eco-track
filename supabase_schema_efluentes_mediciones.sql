-- Agrega columnas opcionales de mediciones físico-químicas a registros_efluentes.
-- Ejecutar en el SQL Editor de Supabase.

ALTER TABLE public.registros_efluentes
  ADD COLUMN IF NOT EXISTS ph NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS temperatura_c NUMERIC(6,2),
  ADD COLUMN IF NOT EXISTS volumetria_ml NUMERIC(10,2);

COMMENT ON COLUMN public.registros_efluentes.ph IS 'pH medido (0-14)';
COMMENT ON COLUMN public.registros_efluentes.temperatura_c IS 'Temperatura en °C';
COMMENT ON COLUMN public.registros_efluentes.volumetria_ml IS 'Volumetría en mL';
