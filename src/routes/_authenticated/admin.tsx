import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Settings, Users, ScrollText, CheckCircle2, XCircle, Loader2, Search, Shield } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Rol, EstadoUsuario } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("rol").eq("id", data.session.user.id).maybeSingle();
    if (prof?.rol !== "superadmin") throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

interface AuditEntry {
  id: string;
  usuario_email: string | null;
  accion: string;
  modulo: string;
  descripcion: string;
  created_at: string;
}

function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          <Settings className="w-7 h-7" /> Administración
        </h1>
        <p className="text-sm text-muted-foreground">Gestión de usuarios, auditoría y configuración del sistema.</p>
      </div>

      <Tabs defaultValue="usuarios" className="space-y-4">
        <TabsList>
          <TabsTrigger value="usuarios"><Users className="w-4 h-4 mr-2" />Usuarios</TabsTrigger>
          <TabsTrigger value="audit"><ScrollText className="w-4 h-4 mr-2" />Auditoría</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios"><UsuariosTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsuariosTab() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState<string>("all");
  const [confirmAction, setConfirmAction] = useState<{ user: Profile; action: "approve" | "reject" | "deactivate" | "reactivate" } | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("rt-profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const changeRol = async (u: Profile, rol: Rol) => {
    const { error } = await supabase.from("profiles").update({ rol }).eq("id", u.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Rol actualizado a ${rol}`);
      await supabase.from("audit_log").insert({
        usuario_id: me?.id, usuario_email: me?.email,
        accion: "UPDATE", modulo: "admin",
        descripcion: `Cambió rol de ${u.email} a ${rol}`,
        datos_anteriores: { rol: u.rol }, datos_nuevos: { rol },
      });
    }
  };

  const doAction = async () => {
    if (!confirmAction) return;
    const { user, action } = confirmAction;
    const updates: Partial<Profile> = {};
    let descripcion = "";
    let accion = "UPDATE";
    if (action === "approve") { updates.estado = "activo"; descripcion = `Aprobó acceso a ${user.email}`; accion = "AUTH_APPROVE"; }
    if (action === "reject") { updates.estado = "inactivo"; descripcion = `Rechazó acceso a ${user.email}`; accion = "AUTH_REJECT"; }
    if (action === "deactivate") { updates.estado = "inactivo"; descripcion = `Desactivó a ${user.email}`; }
    if (action === "reactivate") { updates.estado = "activo"; descripcion = `Reactivó a ${user.email}`; }
    const { error } = await supabase.from("profiles").update(updates).eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Hecho");
      await supabase.from("audit_log").insert({
        usuario_id: me?.id, usuario_email: me?.email,
        accion, modulo: "admin", descripcion,
        datos_anteriores: { estado: user.estado }, datos_nuevos: updates,
      });
      // Notificar al usuario afectado
      if (action === "approve" || action === "reject") {
        await supabase.from("notificaciones").insert({
          tipo: "info",
          titulo: action === "approve" ? "Acceso aprobado" : "Solicitud rechazada",
          mensaje: action === "approve"
            ? "Tu acceso a SostenibilidadPro EVECA fue aprobado. Ya puedes ingresar."
            : "Tu solicitud de acceso fue rechazada. Contacta a la Jefatura.",
          usuario_origen_id: me?.id,
          usuario_destino_id: user.id,
        });
      }
    }
    setConfirmAction(null);
  };

  const filtered = users.filter((u) => {
    if (filterEstado !== "all" && u.estado !== filterEstado) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!u.email.toLowerCase().includes(q) && !u.nombre_completo.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const pendientes = users.filter((u) => u.estado === "pendiente").length;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="font-display text-base flex items-center gap-2">
            Usuarios
            {pendientes > 0 && <Badge className="bg-amber text-amber-foreground border-0">{pendientes} pendiente(s)</Badge>}
          </CardTitle>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar email o nombre…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterEstado} onValueChange={setFilterEstado}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="activo">Activos</SelectItem>
              <SelectItem value="inactivo">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Cargando…</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Registro</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{u.nombre_completo}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{u.cargo ?? "—"}</TableCell>
                    <TableCell>
                      <Select value={u.rol} onValueChange={(v) => changeRol(u, v as Rol)} disabled={u.id === me?.id}>
                        <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="superadmin">Superadmin</SelectItem>
                          <SelectItem value="operador">Operador</SelectItem>
                          <SelectItem value="visualizador">Visualizador</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell><EstadoBadge estado={u.estado} /></TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{u.created_at.slice(0, 10)}</TableCell>
                    <TableCell className="text-right">
                      {u.id !== me?.id && (
                        <div className="inline-flex gap-1">
                          {u.estado === "pendiente" && (
                            <>
                              <Button size="sm" variant="ghost" className="text-success" onClick={() => setConfirmAction({ user: u, action: "approve" })}>
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Aprobar
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmAction({ user: u, action: "reject" })}>
                                <XCircle className="w-4 h-4 mr-1" /> Rechazar
                              </Button>
                            </>
                          )}
                          {u.estado === "activo" && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ user: u, action: "deactivate" })}>
                              Desactivar
                            </Button>
                          )}
                          {u.estado === "inactivo" && (
                            <Button size="sm" variant="ghost" onClick={() => setConfirmAction({ user: u, action: "reactivate" })}>
                              Reactivar
                            </Button>
                          )}
                        </div>
                      )}
                      {u.id === me?.id && <Badge variant="outline" className="text-[10px]"><Shield className="w-3 h-3 mr-1" />Tú</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar acción</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction && {
                approve: `¿Aprobar el acceso de ${confirmAction.user.email}?`,
                reject: `¿Rechazar la solicitud de ${confirmAction.user.email}?`,
                deactivate: `¿Desactivar a ${confirmAction.user.email}? No podrá iniciar sesión.`,
                reactivate: `¿Reactivar el acceso de ${confirmAction.user.email}?`,
              }[confirmAction.action]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={doAction}>Confirmar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function EstadoBadge({ estado }: { estado: EstadoUsuario }) {
  const map: Record<EstadoUsuario, { label: string; cls: string }> = {
    pendiente: { label: "Pendiente", cls: "bg-amber/20 text-amber-foreground" },
    activo: { label: "Activo", cls: "bg-success/15 text-success" },
    inactivo: { label: "Inactivo", cls: "bg-muted text-muted-foreground" },
  };
  const v = map[estado];
  return <Badge className={`${v.cls} border-0`}>{v.label}</Badge>;
}

function AuditTab() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMod, setFilterMod] = useState("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log")
      .select("id,usuario_email,accion,modulo,descripcion,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setEntries((data ?? []) as AuditEntry[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = entries.filter((e) => {
    if (filterMod !== "all" && e.modulo !== filterMod) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.descripcion.toLowerCase().includes(q) && !(e.usuario_email ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const accionColor = (a: string) =>
    a === "INSERT" ? "bg-success/15 text-success" :
    a === "UPDATE" ? "bg-blue-500/15 text-blue-700" :
    a === "DELETE" ? "bg-destructive/15 text-destructive" :
    a === "AUTH_APPROVE" ? "bg-success/15 text-success" :
    a === "AUTH_REJECT" ? "bg-destructive/15 text-destructive" :
    "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="font-display text-base">Registro de auditoría</CardTitle>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar descripción o usuario…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={filterMod} onValueChange={setFilterMod}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los módulos</SelectItem>
              <SelectItem value="efluentes">Efluentes</SelectItem>
              <SelectItem value="ambiental">Ambiental</SelectItem>
              <SelectItem value="zonas_verdes">Zonas verdes</SelectItem>
              <SelectItem value="reportes">Reportes</SelectItem>
              <SelectItem value="admin">Administración</SelectItem>
              <SelectItem value="auth">Autenticación</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Cargando…</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">Sin entradas</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Acción</TableHead>
                  <TableHead>Módulo</TableHead>
                  <TableHead>Descripción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString("es-CO")}</TableCell>
                    <TableCell className="text-xs">{e.usuario_email ?? "sistema"}</TableCell>
                    <TableCell><Badge className={`${accionColor(e.accion)} border-0 text-[10px]`}>{e.accion}</Badge></TableCell>
                    <TableCell className="text-xs"><Badge variant="outline" className="text-[10px]">{e.modulo}</Badge></TableCell>
                    <TableCell className="text-sm">{e.descripcion}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
