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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
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
import { Leaf, Plus, Pencil, Trash2, Loader2, Upload, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/ambiental")({
  component: AmbientalPage,
});

type Categoria =
  | "residuos_solidos" | "manejo_suelos" | "MIP" | "biodiversidad"
  | "emisiones_carbono" | "agua_energia" | "cumplimiento_legal" | "zonas_verdes";

const CATEGORIAS: { value: Categoria; label: string; sub: string[] }[] = [
  { value: "residuos_solidos", label: "Residuos sólidos", sub: ["Aprovechables", "Peligrosos (RESPEL)", "Ordinarios", "Orgánicos"] },
  { value: "manejo_suelos", label: "Manejo de suelos", sub: ["Análisis", "Enmiendas", "Cobertura", "Erosión"] },
  { value: "MIP", label: "Manejo Integrado de Plagas (MIP)", sub: ["Control biológico", "Control químico", "Roedores", "Insectos"] },
  { value: "biodiversidad", label: "Biodiversidad", sub: ["Avistamiento fauna", "Inventario flora", "Conservación"] },
  { value: "emisiones_carbono", label: "Emisiones / Huella de carbono", sub: ["Combustibles", "Energía eléctrica", "Calderas"] },
  { value: "agua_energia", label: "Agua y energía", sub: ["Consumo agua m³", "Consumo energía kWh", "Reúso"] },
  { value: "cumplimiento_legal", label: "Cumplimiento legal", sub: ["Permisos", "Vencimientos", "Auditorías"] },
  { value: "zonas_verdes", label: "Zonas verdes (registro ambiental)", sub: ["Inventario", "Conservación"] },
];

interface Registro {
  id: string;
  fecha: string;
  categoria: Categoria;
  subcategoria: string;
  descripcion: string;
  valor_medicion: number | null;
  unidad_medicion: string | null;
  evidencia_url: string | null;
  tipo_residuo: string | null;
  cantidad_residuo_kg: number | null;
  tipo_control: string | null;
  area_intervenida_ha: number | null;
  observaciones: string | null;
  created_at: string;
}

const TIPOS_RESIDUO = ["aprovechable", "peligroso", "ordinario", "organico"];
const TIPOS_CONTROL = ["biologico", "quimico", "roedores", "insectos", "ninguno"];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface FormState {
  fecha: string;
  categoria: Categoria;
  subcategoria: string;
  descripcion: string;
  valor_medicion: string;
  unidad_medicion: string;
  tipo_residuo: string;
  cantidad_residuo_kg: string;
  tipo_control: string;
  area_intervenida_ha: string;
  observaciones: string;
  evidencia_url: string;
}

const emptyForm = (): FormState => ({
  fecha: todayISO(),
  categoria: "residuos_solidos",
  subcategoria: "",
  descripcion: "",
  valor_medicion: "",
  unidad_medicion: "",
  tipo_residuo: "",
  cantidad_residuo_kg: "",
  tipo_control: "",
  area_intervenida_ha: "",
  observaciones: "",
  evidencia_url: "",
});

function AmbientalPage() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === "superadmin" || profile?.rol === "operador";
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Registro | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("registros_ambiental")
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
      .channel("rt-ambiental")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_ambiental" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const openNew = () => { setEditing(null); setForm(emptyForm()); setOpen(true); };
  const openEdit = (r: Registro) => {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      categoria: r.categoria,
      subcategoria: r.subcategoria,
      descripcion: r.descripcion,
      valor_medicion: r.valor_medicion?.toString() ?? "",
      unidad_medicion: r.unidad_medicion ?? "",
      tipo_residuo: r.tipo_residuo ?? "",
      cantidad_residuo_kg: r.cantidad_residuo_kg?.toString() ?? "",
      tipo_control: r.tipo_control ?? "",
      area_intervenida_ha: r.area_intervenida_ha?.toString() ?? "",
      observaciones: r.observaciones ?? "",
      evidencia_url: r.evidencia_url ?? "",
    });
    setOpen(true);
  };

  const handleFile = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${profile?.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("evidencias-ambientales").upload(path, file);
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("evidencias-ambientales").getPublicUrl(path);
    setForm((f) => ({ ...f, evidencia_url: data.publicUrl }));
    setUploading(false);
    toast.success("Evidencia subida");
  };

  const submit = async () => {
    if (!form.descripcion.trim() || !form.subcategoria.trim()) {
      toast.error("Subcategoría y descripción son obligatorias"); return;
    }
    setSubmitting(true);
    const payload = {
      fecha: form.fecha,
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      descripcion: form.descripcion,
      valor_medicion: form.valor_medicion ? Number(form.valor_medicion) : null,
      unidad_medicion: form.unidad_medicion || null,
      tipo_residuo: form.categoria === "residuos_solidos" ? (form.tipo_residuo || null) : null,
      cantidad_residuo_kg: form.categoria === "residuos_solidos" && form.cantidad_residuo_kg ? Number(form.cantidad_residuo_kg) : null,
      tipo_control: form.categoria === "MIP" ? (form.tipo_control || null) : null,
      area_intervenida_ha: (form.categoria === "manejo_suelos" || form.categoria === "biodiversidad") && form.area_intervenida_ha ? Number(form.area_intervenida_ha) : null,
      evidencia_url: form.evidencia_url || null,
      observaciones: form.observaciones || null,
      operador_id: profile?.id,
    };
    const { error } = editing
      ? await supabase.from("registros_ambiental").update(payload).eq("id", editing.id)
      : await supabase.from("registros_ambiental").insert(payload);
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing ? "Registro actualizado" : "Registro creado");
    setOpen(false);
    load();
  };

  const remove = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("registros_ambiental").delete().eq("id", toDelete.id);
    if (error) toast.error(error.message);
    else toast.success("Registro eliminado");
    setToDelete(null);
    load();
  };

  const filtered = filterCat === "all" ? registros : registros.filter((r) => r.categoria === filterCat);
  const catLabel = (c: string) => CATEGORIAS.find((x) => x.value === c)?.label ?? c;
  const currentSub = CATEGORIAS.find((c) => c.value === form.categoria)?.sub ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <Leaf className="w-7 h-7" /> Gestión Ambiental
          </h1>
          <p className="text-sm text-muted-foreground">Residuos, suelos, MIP, biodiversidad, emisiones, agua/energía y cumplimiento legal.</p>
        </div>
        {canWrite && (
          <Button onClick={openNew} className="bg-primary hover:bg-primary-dark">
            <Plus className="w-4 h-4 mr-2" /> Nuevo registro
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <CardTitle className="font-display text-base">Registros recientes</CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Categoría</Label>
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
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
                    <TableHead>Categoría</TableHead>
                    <TableHead>Subcategoría</TableHead>
                    <TableHead>Descripción</TableHead>
                    <TableHead>Medición</TableHead>
                    <TableHead>Evidencia</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.fecha}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{catLabel(r.categoria)}</Badge></TableCell>
                      <TableCell className="text-sm">{r.subcategoria}</TableCell>
                      <TableCell className="text-sm max-w-[280px] truncate">{r.descripcion}</TableCell>
                      <TableCell className="text-sm">
                        {r.cantidad_residuo_kg != null ? `${r.cantidad_residuo_kg} kg` :
                         r.area_intervenida_ha != null ? `${r.area_intervenida_ha} ha` :
                         r.valor_medicion != null ? `${r.valor_medicion} ${r.unidad_medicion ?? ""}` : "—"}
                      </TableCell>
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
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Nuevo"} registro ambiental</DialogTitle></DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div>
              <Label>Fecha</Label>
              <Input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <Label>Categoría</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm({ ...form, categoria: v as Categoria, subcategoria: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Subcategoría</Label>
              <Select value={form.subcategoria} onValueChange={(v) => setForm({ ...form, subcategoria: v })}>
                <SelectTrigger><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{currentSub.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Descripción</Label>
              <Textarea rows={2} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>

            {form.categoria === "residuos_solidos" && (
              <>
                <div>
                  <Label>Tipo de residuo</Label>
                  <Select value={form.tipo_residuo} onValueChange={(v) => setForm({ ...form, tipo_residuo: v })}>
                    <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                    <SelectContent>{TIPOS_RESIDUO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cantidad (kg)</Label>
                  <Input type="number" step="0.01" value={form.cantidad_residuo_kg} onChange={(e) => setForm({ ...form, cantidad_residuo_kg: e.target.value })} />
                </div>
              </>
            )}

            {form.categoria === "MIP" && (
              <div className="md:col-span-2">
                <Label>Tipo de control</Label>
                <Select value={form.tipo_control} onValueChange={(v) => setForm({ ...form, tipo_control: v })}>
                  <SelectTrigger><SelectValue placeholder="…" /></SelectTrigger>
                  <SelectContent>{TIPOS_CONTROL.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {(form.categoria === "manejo_suelos" || form.categoria === "biodiversidad") && (
              <div>
                <Label>Área intervenida (ha)</Label>
                <Input type="number" step="0.01" value={form.area_intervenida_ha} onChange={(e) => setForm({ ...form, area_intervenida_ha: e.target.value })} />
              </div>
            )}

            {!["residuos_solidos"].includes(form.categoria) && (
              <>
                <div>
                  <Label>Valor de medición</Label>
                  <Input type="number" step="0.001" value={form.valor_medicion} onChange={(e) => setForm({ ...form, valor_medicion: e.target.value })} />
                </div>
                <div>
                  <Label>Unidad</Label>
                  <Input placeholder="kWh, m³, kg CO₂…" value={form.unidad_medicion} onChange={(e) => setForm({ ...form, unidad_medicion: e.target.value })} />
                </div>
              </>
            )}

            <div className="md:col-span-2">
              <Label>Evidencia (imagen / PDF)</Label>
              <div className="flex items-center gap-2">
                <Input type="file" accept="image/*,application/pdf"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
              </div>
              {form.evidencia_url && (
                <a href={form.evidencia_url} target="_blank" rel="noreferrer" className="text-xs text-primary mt-1 inline-flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Archivo cargado
                </a>
              )}
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
