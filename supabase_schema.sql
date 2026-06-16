-- =====================================================================
-- SostenibilidadPro EVECA — Schema completo
-- Ejecutar en el SQL Editor de Supabase (proyecto unmshcrhyukdsybsixkp)
-- =====================================================================

-- ---------- 1. TABLAS ----------

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  rol TEXT NOT NULL DEFAULT 'operador' CHECK (rol IN ('superadmin','operador','visualizador')),
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','activo','inactivo')),
  cargo TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registros_efluentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  hora TIME NOT NULL,
  tanque TEXT NOT NULL CHECK (tanque IN ('TK1','TK2','TK3','TK4')),
  cantidad_pome_m3 NUMERIC(10,2),
  nivel_inicial_cm NUMERIC(8,2),
  nivel_final_cm NUMERIC(8,2),
  enviado_biodigestor BOOLEAN DEFAULT FALSE,
  biodigestor_destino TEXT CHECK (biodigestor_destino IN ('BD1','BD2')),
  cantidad_pome_biodigestor_m3 NUMERIC(10,2),
  cantidad_aceite_recuperado_litros NUMERIC(10,2),
  uso_contingencia BOOLEAN DEFAULT FALSE,
  observaciones TEXT,
  operador_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS registros_ambiental (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN (
    'residuos_solidos','manejo_suelos','MIP','biodiversidad',
    'emisiones_carbono','agua_energia','cumplimiento_legal','zonas_verdes'
  )),
  subcategoria TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  valor_medicion NUMERIC(12,3),
  unidad_medicion TEXT,
  evidencia_url TEXT,
  tipo_residuo TEXT CHECK (tipo_residuo IN ('aprovechable','peligroso','ordinario','organico')),
  cantidad_residuo_kg NUMERIC(10,2),
  tipo_control TEXT CHECK (tipo_control IN ('biologico','quimico','roedores','insectos','ninguno')),
  area_intervenida_ha NUMERIC(10,2),
  observaciones TEXT,
  operador_id UUID REFERENCES profiles(id),
  agua_suavizada_m3 NUMERIC(12,3),
  agua_filtrada_m3 NUMERIC(12,3),
  agua_ptai_m3 NUMERIC(12,3),
  agua_vivero_m3 NUMERIC(12,3),
  agua_total_m3 NUMERIC(12,3),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_registros_ambiental_water_date 
ON registros_ambiental (fecha) 
WHERE (categoria = 'agua_energia' AND subcategoria = 'Consumo de agua');


CREATE TABLE IF NOT EXISTS registros_zonas_verdes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  actividad TEXT NOT NULL CHECK (actividad IN ('guadana','embellecimiento','fumigacion','paisajismo','otro')),
  zona_descripcion TEXT NOT NULL,
  area_m2 NUMERIC(10,2),
  personal_empleado INTEGER,
  horas_trabajo NUMERIC(5,2),
  insumos_utilizados TEXT,
  evidencia_url TEXT,
  observaciones TEXT,
  operador_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reportes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha DATE NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('informe','registro_fotografico','comunicacion','acta')),
  titulo TEXT NOT NULL,
  descripcion TEXT,
  archivo_url TEXT,
  modulo_origen TEXT CHECK (modulo_origen IN ('efluentes','ambiental','zonas_verdes','general')),
  tags TEXT[],
  es_publico BOOLEAN DEFAULT FALSE,
  operador_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES profiles(id),
  usuario_email TEXT,
  accion TEXT NOT NULL CHECK (accion IN ('INSERT','UPDATE','DELETE','LOGIN','LOGOUT','AUTH_APPROVE','AUTH_REJECT')),
  modulo TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  datos_anteriores JSONB,
  datos_nuevos JSONB,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('solicitud_acceso','reporte_programado','alerta_sistema','info')),
  titulo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  leida BOOLEAN DEFAULT FALSE,
  usuario_origen_id UUID REFERENCES profiles(id),
  usuario_destino_id UUID REFERENCES profiles(id),
  datos_extra JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ---------- 2. FUNCIÓN HELPER (evita recursión en RLS) ----------

CREATE OR REPLACE FUNCTION public.is_superadmin(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = _uid AND rol = 'superadmin' AND estado = 'activo');
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = _uid AND estado = 'activo');
$$;

CREATE OR REPLACE FUNCTION public.can_write(_uid UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = _uid AND estado = 'activo' AND rol IN ('superadmin','operador')
  );
$$;

-- ---------- 3. TRIGGER: crear profile automáticamente al registrarse ----------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nombre_completo, cargo, rol, estado)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email),
    NEW.raw_user_meta_data->>'cargo',
    CASE WHEN NEW.email = 'jefaturasostenibilidad@gmail.com' THEN 'superadmin' ELSE 'operador' END,
    CASE WHEN NEW.email = 'jefaturasostenibilidad@gmail.com' THEN 'activo' ELSE 'pendiente' END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- 4. RLS ----------

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_efluentes ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_ambiental ENABLE ROW LEVEL SECURITY;
ALTER TABLE registros_zonas_verdes ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- profiles
DROP POLICY IF EXISTS "profiles_self_read" ON profiles;
CREATE POLICY "profiles_self_read" ON profiles FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "profiles_self_update" ON profiles;
CREATE POLICY "profiles_self_update" ON profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "profiles_admin_all" ON profiles;
CREATE POLICY "profiles_admin_all" ON profiles FOR ALL TO authenticated
  USING (public.is_superadmin(auth.uid())) WITH CHECK (public.is_superadmin(auth.uid()));

-- registros (efluentes, ambiental, zonas verdes, reportes): leer activos, escribir operador/superadmin
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['registros_efluentes','registros_ambiental','registros_zonas_verdes','reportes']) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%I_read" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_read" ON %I FOR SELECT TO authenticated USING (public.is_active_user(auth.uid()))', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%I_write" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%I_write" ON %I FOR ALL TO authenticated USING (public.can_write(auth.uid())) WITH CHECK (public.can_write(auth.uid()))', t, t);
  END LOOP;
END $$;

-- audit_log: solo superadmin lee, sistema (cualquier auth) inserta
DROP POLICY IF EXISTS "audit_read_admin" ON audit_log;
CREATE POLICY "audit_read_admin" ON audit_log FOR SELECT TO authenticated
  USING (public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "audit_insert_any" ON audit_log;
CREATE POLICY "audit_insert_any" ON audit_log FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- notificaciones: usuario ve las suyas, superadmin todas
DROP POLICY IF EXISTS "notif_read" ON notificaciones;
CREATE POLICY "notif_read" ON notificaciones FOR SELECT TO authenticated
  USING (usuario_destino_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "notif_update" ON notificaciones;
CREATE POLICY "notif_update" ON notificaciones FOR UPDATE TO authenticated
  USING (usuario_destino_id = auth.uid() OR public.is_superadmin(auth.uid()));

DROP POLICY IF EXISTS "notif_insert" ON notificaciones;
CREATE POLICY "notif_insert" ON notificaciones FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ---------- 5. REALTIME ----------
ALTER PUBLICATION supabase_realtime ADD TABLE registros_efluentes;
ALTER PUBLICATION supabase_realtime ADD TABLE registros_ambiental;
ALTER PUBLICATION supabase_realtime ADD TABLE registros_zonas_verdes;
ALTER PUBLICATION supabase_realtime ADD TABLE reportes;
ALTER PUBLICATION supabase_realtime ADD TABLE notificaciones;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ---------- 6. STORAGE BUCKETS ----------
INSERT INTO storage.buckets (id, name, public)
  VALUES ('evidencias-ambientales','evidencias-ambientales', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('evidencias-zonas-verdes','evidencias-zonas-verdes', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('reportes-documentos','reportes-documentos', true) ON CONFLICT DO NOTHING;

-- Policies de storage: authenticated puede subir/leer
DO $$
DECLARE b TEXT;
BEGIN
  FOR b IN SELECT unnest(ARRAY['evidencias-ambientales','evidencias-zonas-verdes','reportes-documentos']) LOOP
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_read" ON storage.objects$p$, b);
    EXECUTE format($p$CREATE POLICY "%s_read" ON storage.objects FOR SELECT TO public USING (bucket_id = %L)$p$, b, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_upload" ON storage.objects$p$, b);
    EXECUTE format($p$CREATE POLICY "%s_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = %L)$p$, b, b);
    EXECUTE format($p$DROP POLICY IF EXISTS "%s_delete" ON storage.objects$p$, b);
    EXECUTE format($p$CREATE POLICY "%s_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = %L)$p$, b, b);
  END LOOP;
END $$;
