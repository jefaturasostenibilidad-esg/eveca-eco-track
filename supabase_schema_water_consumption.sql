-- Migration for water consumption fields in registros_ambiental
-- 1. Add columns if they do not exist
ALTER TABLE registros_ambiental ADD COLUMN IF NOT EXISTS agua_suavizada_m3 NUMERIC(12,3);
ALTER TABLE registros_ambiental ADD COLUMN IF NOT EXISTS agua_filtrada_m3 NUMERIC(12,3);
ALTER TABLE registros_ambiental ADD COLUMN IF NOT EXISTS agua_ptai_m3 NUMERIC(12,3);
ALTER TABLE registros_ambiental ADD COLUMN IF NOT EXISTS agua_vivero_m3 NUMERIC(12,3);
ALTER TABLE registros_ambiental ADD COLUMN IF NOT EXISTS agua_total_m3 NUMERIC(12,3);

-- 2. Migrate existing individual water records (Agua suavizada, Agua filtrada, Agua PTAI, Agua Vivero, Consumo agua m³, Consumo de agua) into a single consolidated row per date.
DO $$
DECLARE
  r RECORD;
  v_suavizada NUMERIC;
  v_filtrada NUMERIC;
  v_ptai NUMERIC;
  v_vivero NUMERIC;
  v_total NUMERIC;
  v_desc TEXT;
  v_operador_id UUID;
  v_evidencia_url TEXT;
  v_observaciones TEXT;
  v_created_at TIMESTAMPTZ;
  v_id UUID;
BEGIN
  -- Loop over distinct dates where water records exist
  FOR r IN 
    SELECT DISTINCT fecha 
    FROM registros_ambiental 
    WHERE categoria = 'agua_energia' 
      AND subcategoria IN ('Agua suavizada', 'Agua filtrada', 'Agua PTAI', 'Agua Vivero', 'Consumo agua m³', 'Consumo de agua', 'Consumo total de agua')
  LOOP
    -- Get values for this date
    SELECT COALESCE(SUM(valor_medicion), 0) INTO v_suavizada FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria = 'Agua suavizada';
    SELECT COALESCE(SUM(valor_medicion), 0) INTO v_filtrada FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria = 'Agua filtrada';
    SELECT COALESCE(SUM(valor_medicion), 0) INTO v_ptai FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria = 'Agua PTAI';
    SELECT COALESCE(SUM(valor_medicion), 0) INTO v_vivero FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria = 'Agua Vivero';
    
    -- Get other fields from any existing water record on that day to preserve metadata (evidence, operator, description, etc.)
    SELECT descripcion, operador_id, evidencia_url, observaciones, created_at
    INTO v_desc, v_operador_id, v_evidencia_url, v_observaciones, v_created_at
    FROM registros_ambiental 
    WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria IN ('Agua suavizada', 'Agua filtrada', 'Agua PTAI', 'Agua Vivero', 'Consumo agua m³', 'Consumo de agua', 'Consumo total de agua')
    ORDER BY created_at DESC
    LIMIT 1;

    -- Calculate total
    v_total := v_suavizada + v_filtrada + v_ptai + v_vivero;
    IF v_total = 0 THEN
      -- If they were stored in a different way or in the general 'valor_medicion' field without individual sub-records, fallback to it
      SELECT COALESCE(valor_medicion, 0) INTO v_total FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria IN ('Consumo agua m³', 'Consumo de agua', 'Consumo total de agua') LIMIT 1;
    END IF;

    -- Update or insert a single consolidated record
    -- Let's check if there is an existing 'Consumo de agua' or 'Consumo agua m³' record
    SELECT id INTO v_id FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria IN ('Consumo de agua', 'Consumo agua m³') LIMIT 1;
    
    IF v_id IS NOT NULL THEN
      UPDATE registros_ambiental 
      SET 
        subcategoria = 'Consumo de agua',
        agua_suavizada_m3 = v_suavizada,
        agua_filtrada_m3 = v_filtrada,
        agua_ptai_m3 = v_ptai,
        agua_vivero_m3 = v_vivero,
        agua_total_m3 = v_total,
        valor_medicion = v_total,
        unidad_medicion = 'm³',
        descripcion = COALESCE(v_desc, 'Consumo de agua diario consolidado')
      WHERE id = v_id;
    ELSE
      INSERT INTO registros_ambiental (
        fecha, categoria, subcategoria, descripcion, valor_medicion, unidad_medicion,
        agua_suavizada_m3, agua_filtrada_m3, agua_ptai_m3, agua_vivero_m3, agua_total_m3,
        operador_id, evidencia_url, observaciones, created_at
      ) VALUES (
        r.fecha, 'agua_energia', 'Consumo de agua', COALESCE(v_desc, 'Consumo de agua diario consolidado'), v_total, 'm³',
        v_suavizada, v_filtrada, v_ptai, v_vivero, v_total,
        v_operador_id, v_evidencia_url, v_observaciones, COALESCE(v_created_at, now())
      );
    END IF;

    -- Delete all other water records for this date except the consolidated one we just created/updated
    DELETE FROM registros_ambiental 
    WHERE fecha = r.fecha 
      AND categoria = 'agua_energia' 
      AND subcategoria IN ('Agua suavizada', 'Agua filtrada', 'Agua PTAI', 'Agua Vivero', 'Consumo agua m³', 'Consumo total de agua')
      AND id <> COALESCE(v_id, (SELECT id FROM registros_ambiental WHERE fecha = r.fecha AND categoria = 'agua_energia' AND subcategoria = 'Consumo de agua' LIMIT 1));
  END LOOP;
END $$;

-- 3. Create unique index for water records
CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_ambiental_water_date 
ON registros_ambiental (fecha) 
WHERE (categoria = 'agua_energia' AND subcategoria = 'Consumo de agua');
