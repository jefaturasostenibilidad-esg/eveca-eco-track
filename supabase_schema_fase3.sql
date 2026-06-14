-- =====================================================================
-- SostenibilidadPro EVECA — Fase 3: Audit triggers + notificaciones
-- Ejecutar DESPUÉS de supabase_schema.sql
-- =====================================================================

-- ---------- 1. Función genérica de auditoría ----------
CREATE OR REPLACE FUNCTION public.fn_audit_registro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_modulo TEXT;
  v_desc TEXT;
BEGIN
  -- mapeo tabla -> módulo
  v_modulo := CASE TG_TABLE_NAME
    WHEN 'registros_efluentes' THEN 'efluentes'
    WHEN 'registros_ambiental' THEN 'ambiental'
    WHEN 'registros_zonas_verdes' THEN 'zonas_verdes'
    WHEN 'reportes' THEN 'reportes'
    ELSE TG_TABLE_NAME
  END;

  SELECT email INTO v_email FROM profiles WHERE id = auth.uid();

  v_desc := TG_OP || ' en ' || v_modulo;

  INSERT INTO audit_log (usuario_id, usuario_email, accion, modulo, descripcion, datos_anteriores, datos_nuevos)
  VALUES (
    auth.uid(),
    v_email,
    TG_OP,
    v_modulo,
    v_desc,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN row_to_json(OLD)::jsonb ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN row_to_json(NEW)::jsonb ELSE NULL END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ---------- 2. Triggers en las 4 tablas operativas ----------
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY['registros_efluentes','registros_ambiental','registros_zonas_verdes','reportes']) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%I ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_audit_%I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_registro()', t, t);
  END LOOP;
END $$;

-- ---------- 3. Notificación automática al superadmin cuando alguien se registra ----------
CREATE OR REPLACE FUNCTION public.fn_notify_admin_signup()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF NEW.estado = 'pendiente' THEN
    SELECT id INTO v_admin_id FROM profiles
      WHERE rol = 'superadmin' AND estado = 'activo'
      ORDER BY created_at LIMIT 1;

    IF v_admin_id IS NOT NULL THEN
      INSERT INTO notificaciones (tipo, titulo, mensaje, usuario_origen_id, usuario_destino_id, datos_extra)
      VALUES (
        'solicitud_acceso',
        'Nueva solicitud de acceso',
        NEW.nombre_completo || ' (' || NEW.email || ') solicita acceso a SostenibilidadPro EVECA.',
        NEW.id, v_admin_id,
        jsonb_build_object('email', NEW.email, 'cargo', NEW.cargo)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admin_signup ON profiles;
CREATE TRIGGER trg_notify_admin_signup
  AFTER INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_admin_signup();

-- ---------- 4. Auditar cambios en profiles (rol/estado) ----------
CREATE OR REPLACE FUNCTION public.fn_audit_profile()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email TEXT;
BEGIN
  IF NEW.rol IS DISTINCT FROM OLD.rol OR NEW.estado IS DISTINCT FROM OLD.estado THEN
    SELECT email INTO v_email FROM profiles WHERE id = auth.uid();
    INSERT INTO audit_log (usuario_id, usuario_email, accion, modulo, descripcion, datos_anteriores, datos_nuevos)
    VALUES (
      auth.uid(), v_email, 'UPDATE', 'auth',
      'Cambio en perfil ' || NEW.email || ': rol ' || OLD.rol || '→' || NEW.rol || ', estado ' || OLD.estado || '→' || NEW.estado,
      jsonb_build_object('rol', OLD.rol, 'estado', OLD.estado),
      jsonb_build_object('rol', NEW.rol, 'estado', NEW.estado)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_profile ON profiles;
CREATE TRIGGER trg_audit_profile
  AFTER UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_profile();
