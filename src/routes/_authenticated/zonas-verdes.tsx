import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TreePine, Plus, Pencil, Trash2, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/zonas-verdes")({
  component: ZonasVerdesPage,
});

type Actividad = "guadana" | "embellecimiento" | "fumigacion" | "paisajismo" | "otro";
const ACTIVIDADES: { value: Actividad; label: string; color: string }[] = [
  { value: "guadana", label: "Guadaña", color: "bg-emerald-500/15 text-emerald-700" },
  { value: "embellecimiento", label: "Embellecimiento", color: "bg-pink-500/15 text-pink-700" },
  { value: "fumigacion", label: "Fumigación", color: "bg-orange-500/15 text-orange-700" },
  { value: "paisajismo", label: "Paisajismo", color: "bg-purple-500/15 text-purple-700" },
  { value: "otro", label: "Otro", color: "bg-muted text-muted-foreground" },
];

interface Registro {
  id: string;
  fecha: string;
  actividad: Actividad;
  zona_descripcion: string;
  area_m2: number | null;
  personal_empleado: number | null;
  horas_trabajo: number | null;
  insumos_utilizados: string | null;
  evidencia_url: string | null;
  observaciones: string | null;
  created_at: string;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FormState {
  fecha: string; actividad: Actividad; zona_descripcion: string;
  area_m2: string; personal_empleado: string; horas_trabajo: string;
  insumos_utilizados: string; observaciones: string; evidencia_url: string;
}
const emptyForm = (): FormState => ({
  fecha: todayISO(), actividad: "guadana", zona_descripcion: "",
  area_m2: "", personal_empleado: "", horas_trabajo: "",
  insumos_utilizados: "", observaciones: "", evidencia_url: "",
});

function ZonasVerdesPage() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === "superadmin" || profile?.rol === "operador";
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAct, setFilterAct] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Registro | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("registros_zonas_verdes")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setRegistros((data ?? []) as Registro[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("rt-zv")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_zonas_verdes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: Registro) => {
    setEditing(r);
    setForm({
      fecha: r.fecha, actividad: r.actividad, zona_descripcion: r.zona_descripcion,
      area_m2: r.area_m2?.toString() ?? "",
      personal_empleado: r.personal_empleado?.toString() ?? "",
      horas_trabajo: r.horas_trabajo?.toString() ?? "",
      insumos_utilizados: r.insumos_utilizados ?? "",
      observaciones: r.observaciones ?? "",
      evidencia_url: r.evidencia_url ?? "",
    });
    setOpen(true);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${profile?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("evidencias-zonas-verdes").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("evidencias-zonas-verdes").getPublicUrl(path);
    setForm((f) => ({ ...f, evidencia_url: data.publicUrl }));
    setUploading(false);
    toast.success("Evidencia subida");
  };

  const submit = async () => {
    if (!form.zona_descripcion.trim()) { toast.error("Describe la zona"); return; }
    setSubmitting(true);
    const payload = {
      fecha: form.fecha,
      actividad: form.actividad,
      zona_descripcion: form.zona_descripcion,
      area_m2: form.area_m2 ? Number(form.area_m2) : null,
      personal_empleado: form.personal_empleado ? Number(form.personal_empleado) : null,
      horas_trabajo: form.horas_trabajo ? Number(form.horas_trabajo) : null,
      insumos_utilizados: form.insumos_utilizados || null,
      evidencia_url: form.evidencia_url || null,
      observaciones: form.observaciones || null,
      operador_id: profile?.id,
    };
    const { error } = editing
      ? await supabase.from("registros_zonas_verdes").update(payload).eq("id", editing.id)
      : await supabase.from("registros_zonas_verdes").insert(payload);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Actualizado" : "Creado");
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("registros_zonas_verdes").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message); else toast.success("Eliminado");
    setToDelete(null);
    load();
  };

  const filtered = filterAct === "all" ? registros : registros.filter((r) => r.actividad === filterAct);
  const actInfo = (a: Actividad) => ACTIVIDADES.find((x) => x.value === a)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <TreePine className="w-7 h-7" /> Zonas Verdes
          </h1>
          <p className="text-sm text-muted-foreground">Mantenimiento de áreas verdes: guadaña, embellecimiento, fumigación y paisajismo.</p>
        </div>
        {canWrite && (
          <Button onClick={openNew} className="bg-primary hover:bg-primary-dark">
            <Plus className="w-4 h-4 mr-2" /> Nuevo registro
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-display text-base">Actividades</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Actividad</Label>
            <Select value={filterAct} onValueChange={setFilterAct}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ACTIVIDADES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Sin registros</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Actividad</TableHead>
                    <TableHead>Zona</TableHead>
                    <TableHead>Área (m²)</TableHead>
                    <TableHead>Personal</TableHead>
                    <TableHead>Horas</TableHead>
                    <TableHead>Evidencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const info = actInfo(r.actividad);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.fecha}</TableCell>
                        <TableCell><Badge className={`${info.color} border-0`}>{info.label}</Badge></TableCell>
                        <TableCell className="text-sm max-w-[260px] truncate">{r.zona_descripcion}</TableCell>
                        <TableCell className="text-sm">{r.area_m2 ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.personal_empleado ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.horas_trabajo ?? "—"}</TableCell>
                        <TableCell>
                          {r.evidencia_url ? (
                            <a href={r.evidencia_url} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 text-xs">
                              Ver <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {canWrite && (
                            <div className="inline-flex gap-1">
                              <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => setToDelete(r)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nuevo"} registro de zonas verdes</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label>Actividad</Label>
              <Select value={form.actividad} onValueChange={(v) => setForm({ ...form, actividad: v as Actividad })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ACTIVIDADES.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descripción de la zona</Label>
              <Textarea rows={2} value={form.zona_descripcion} onChange={(e) => setForm({ ...form, zona_descripcion: e.target.value })} placeholder="Ej: Entrada principal, Vía Bd1, lote 3…" />
            </div>
            <div>
              <Label>Área (m²)</Label>
              <Input type="number" step="0.01" value={form.area_m2} onChange={(e) => setForm({ ...form, area_m2: e.target.value })} />
            </div>
            <div>
              <Label>Personal</Label>
              <Input type="number" value={form.personal_empleado} onChange={(e) => setForm({ ...form, personal_empleado: e.target.value })} />
            </div>
            <div>
              <Label>Horas de trabajo</Label>
              <Input type="number" step="0.5" value={form.horas_trabajo} onChange={(e) => setForm({ ...form, horas_trabajo: e.target.value })} />
            </div>
            <div>
              <Label>Insumos utilizados</Label>
              <Input value={form.insumos_utilizados} onChange={(e) => setForm({ ...form, insumos_utilizados: e.target.value })} placeholder="Glifosato 2L, abono…" />
            </div>
            <div className="md:col-span-2">
              <Label>Evidencia fotográfica</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              {form.evidencia_url && <a href={form.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-1 inline-block">Archivo cargado ↗</a>}
            </div>
            <div className="md:col-span-2">
              <Label>Observaciones</Label>
              <Textarea rows={2} value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={submitting} className="bg-primary hover:bg-primary-dark">
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editing ? "Guardar" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive hover:bg-destructive/90">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
