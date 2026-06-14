import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://unmshcrhyukdsybsixkp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVubXNoY3JoeXVrZHN5YnNpeGtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NjIwNzksImV4cCI6MjA5NzAzODA3OX0.Q_jvU6buGO2wr1bsUL7P3StAVksOEW39GR-pHlJzBGg";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const ADMIN_EMAIL = "jefaturasostenibilidad@gmail.com";

export type Rol = "superadmin" | "operador" | "visualizador";
export type EstadoUsuario = "pendiente" | "activo" | "inactivo";

export interface Profile {
  id: string;
  nombre_completo: string;
  email: string;
  rol: Rol;
  estado: EstadoUsuario;
  cargo: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}
