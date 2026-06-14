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
import { Switch } from "@/components/ui/switch";
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
import { FileText, Plus, Pencil, Trash2, Loader2, ExternalLink, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/reportes")({
  component: ReportesPage,
});

type TipoReporte = "informe" | "registro_fotografico" | "comunicacion" | "acta";
type ModuloOrigen = "efluentes" | "ambiental" | "zonas_verdes" | "general";

const TIPOS: { value: TipoReporte; label: string; color: string }[] = [
  { value: "informe", label: "Informe", color: "bg-primary/15 text-primary" },
  { value: "registro_fotografico", label: "Registro fotográfico", color: "bg-amber/20 text-amber-foreground" },
  { value: "comunicacion", label: "Comunicación", color: "bg-blue-500/15 text-blue-700" },
  { value: "acta", label: "Acta", color: "bg-purple-500/15 text-purple-700" },
];
const MODULOS: { value: ModuloOrigen; label: string }[] = [
  { value: "general", label: "General" },
  { value: "efluentes", label: "Efluentes" },
  { value: "ambiental", label: "Ambiental" },
  { value: "zonas_verdes", label: "Zonas Verdes" },
];

interface Reporte {
  id: string;
  fecha: string;
  tipo: TipoReporte;
  titulo: string;
  descripcion: string | null;
  archivo_url: string | null;
  modulo_origen: ModuloOrigen | null;
  tags: string[] | null;
  es_publico: boolean;
  created_at: string;
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FormState {
  fecha: string; tipo: TipoReporte; titulo: string; descripcion: string;
  modulo_origen: ModuloOrigen; tags: string; es_publico: boolean; archivo_url: string;
}
const emptyForm = (): FormState => ({
  fecha: todayISO(), tipo: "informe", titulo: "", descripcion: "",
  modulo_origen: "general", tags: "", es_publico: false, archivo_url: "",
});

function ReportesPage() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === "superadmin" || profile?.rol === "operador";
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("all");
  const [filterMod, setFilterMod] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Reporte | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Reporte | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("reportes")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(200);
    if (error) toast.error(error.message);
    setReportes((data ?? []) as Reporte[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("rt-reportes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reportes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: Reporte) => {
    setEditing(r);
    setForm({
      fecha: r.fecha, tipo: r.tipo, titulo: r.titulo, descripcion: r.descripcion ?? "",
      modulo_origen: r.modulo_origen ?? "general", tags: (r.tags ?? []).join(", "),
      es_publico: r.es_publico, archivo_url: r.archivo_url ?? "",
    });
    setOpen(true);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${profile?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("reportes-documentos").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("reportes-documentos").getPublicUrl(path);
    setForm((f) => ({ ...f, archivo_url: data.publicUrl }));
    setUploading(false);
    toast.success("Archivo subido");
  };

  const submit = async () => {
    if (!form.titulo.trim()) { toast.error("El título es obligatorio"); return; }
    setSubmitting(true);
    const payload = {
      fecha: form.fecha,
      tipo: form.tipo,
      titulo: form.titulo,
      descripcion: form.descripcion || null,
      archivo_url: form.archivo_url || null,
      modulo_origen: form.modulo_origen,
      tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : null,
      es_publico: form.es_publico,
      operador_id: profile?.id,
    };
    const { error } = editing
      ? await supabase.from("reportes").update(payload).eq("id", editing.id)
      : await supabase.from("reportes").insert(payload);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Actualizado" : "Reporte creado");
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("reportes").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message); else toast.success("Eliminado");
    setToDelete(null);
    load();
  };

  const filtered = reportes.filter((r) => {
    if (filterTipo !== "all" && r.tipo !== filterTipo) return false;
    if (filterMod !== "all" && r.modulo_origen !== filterMod) return false;
    if (search) {
      const q = search.toLowerCase();
      const inTags = (r.tags ?? []).some((t) => t.toLowerCase().includes(q));
      if (!r.titulo.toLowerCase().includes(q) && !(r.descripcion ?? "").toLowerCase().includes(q) && !inTags) return false;
    }
    return true;
  });
  const tipoInfo = (t: TipoReporte) => TIPOS.find((x) => x.value === t)!;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <FileText className="w-7 h-7" /> Reportes Institucionales
          </h1>
          <p className="text-sm text-muted-foreground">Informes, actas, comunicaciones y registros fotográficos de la Jefatura.</p>
        </div>
        {canWrite && (
          <Button onClick={openNew} className="bg-primary hover:bg-primary-dark">
            <Plus className="w-4 h-4 mr-2" /> Nuevo reporte
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="font-display text-base">Biblioteca de reportes</CardTitle>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar título, descripción, tag…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={filterTipo} onValueChange={setFilterTipo}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMod} onValueChange={setFilterMod}>
              <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los módulos</SelectItem>
                {MODULOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Cargando…</div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Sin reportes</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map((r) => {
                const info = tipoInfo(r.tipo);
                return (
                  <Card key={r.id} className="border-border hover:shadow-md transition-shadow">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <Badge className={`${info.color} border-0 text-[10px]`}>{info.label}</Badge>
                        <span className="text-[10px] font-mono text-muted-foreground">{r.fecha}</span>
                      </div>
                      <div>
                        <div className="font-display font-semibold leading-tight line-clamp-2">{r.titulo}</div>
                        {r.descripcion && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.descripcion}</div>}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.modulo_origen && <Badge variant="outline" className="text-[10px]">{r.modulo_origen}</Badge>}
                        {r.es_publico && <Badge className="bg-success/15 text-success border-0 text-[10px]">público</Badge>}
                        {(r.tags ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">#{t}</Badge>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-border">
                        {r.archivo_url ? (
                          <a href={r.archivo_url} target="_blank" rel="noreferrer" className="text-primary text-xs inline-flex items-center gap-1">
                            Abrir archivo <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : <span className="text-xs text-muted-foreground">Sin archivo</span>}
                        {canWrite && (
                          <div className="inline-flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(r)}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setToDelete(r)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nuevo"} reporte</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoReporte })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Título</Label>
              <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>Descripción</Label>
              <Textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
            <div>
              <Label>Módulo de origen</Label>
              <Select value={form.modulo_origen} onValueChange={(v) => setForm({ ...form, modulo_origen: v as ModuloOrigen })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MODULOS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tags (separados por coma)</Label>
              <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="auditoría, 2026, biodigestor" />
            </div>
            <div className="md:col-span-2">
              <Label>Archivo (PDF, imagen, doc)</Label>
              <div className="flex items-center gap-2">
                <Input type="file" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              {form.archivo_url && <a href={form.archivo_url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-1 inline-block">Archivo cargado ↗</a>}
            </div>
            <div className="md:col-span-2 flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <div className="text-sm font-medium">Visible públicamente</div>
                <div className="text-xs text-muted-foreground">Marcado interno para informes compartibles.</div>
              </div>
              <Switch checked={form.es_publico} onCheckedChange={(c) => setForm({ ...form, es_publico: c })} />
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
            <AlertDialogTitle>¿Eliminar reporte?</AlertDialogTitle>
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
