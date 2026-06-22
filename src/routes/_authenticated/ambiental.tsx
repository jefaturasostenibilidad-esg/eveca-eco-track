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
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend
} from "recharts";


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
  { value: "agua_energia", label: "Agua y energía", sub: ["Consumo de agua", "Consumo energía kWh", "Reúso"] },
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
  agua_suavizada_m3?: number | null;
  agua_filtrada_m3?: number | null;
  agua_ptai_m3?: number | null;
  agua_vivero_m3?: number | null;
  agua_total_m3?: number | null;
  lectura_vivero_m3?: number | null;
  lectura_petar_m3?: number | null;
  lectura_filtrada_m3?: number | null;
  lectura_suavizada_m3?: number | null;
  hora_lectura?: string | null;
  consumo_dia_m3?: number | null;
  consumo_noche_m3?: number | null;
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
  agua_suavizada_m3: string;
  agua_filtrada_m3: string;
  agua_ptai_m3: string;
  agua_vivero_m3: string;
  lectura_vivero_m3: string;
  lectura_petar_m3: string;
  lectura_filtrada_m3: string;
  lectura_suavizada_m3: string;
  hora_lectura: string;
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
  agua_suavizada_m3: "",
  agua_filtrada_m3: "",
  agua_ptai_m3: "",
  agua_vivero_m3: "",
  lectura_vivero_m3: "",
  lectura_petar_m3: "",
  lectura_filtrada_m3: "",
  lectura_suavizada_m3: "",
  hora_lectura: "07:00",
});


function AmbientalPage() {
  const { profile } = useAuth();
  const canWrite = profile?.rol === "superadmin" || profile?.rol === "operador";
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterSub, setFilterSub] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toDelete, setToDelete] = useState<Registro | null>(null);
  const [selectedWaterRecord, setSelectedWaterRecord] = useState<Registro | null>(null);


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
      agua_suavizada_m3: r.agua_suavizada_m3?.toString() ?? "",
      agua_filtrada_m3: r.agua_filtrada_m3?.toString() ?? "",
      agua_ptai_m3: r.agua_ptai_m3?.toString() ?? "",
      agua_vivero_m3: r.agua_vivero_m3?.toString() ?? "",
      lectura_vivero_m3: r.lectura_vivero_m3?.toString() ?? "",
      lectura_petar_m3: r.lectura_petar_m3?.toString() ?? "",
      lectura_filtrada_m3: r.lectura_filtrada_m3?.toString() ?? "",
      lectura_suavizada_m3: r.lectura_suavizada_m3?.toString() ?? "",
      hora_lectura: r.hora_lectura ?? "07:00",
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
    
    const isWater = form.categoria === "agua_energia" && form.subcategoria === "Consumo de agua";
    let consumo_dia_m3: number | null = null;
    let consumo_noche_m3: number | null = null;
    let totalWater: number | null = null;
    let suavizada: number | null = null;
    let filtrada: number | null = null;
    let ptai: number | null = null;
    let vivero: number | null = null;

    if (isWater) {
      const curViv = Number(form.lectura_vivero_m3) || 0;
      const curPet = Number(form.lectura_petar_m3) || 0;
      const curFil = Number(form.lectura_filtrada_m3) || 0;
      const curSua = Number(form.lectura_suavizada_m3) || 0;

      if (form.hora_lectura === "16:00") {
        const { data: prev7am } = await supabase
          .from("registros_ambiental")
          .select("*")
          .eq("fecha", form.fecha)
          .eq("categoria", "agua_energia")
          .eq("subcategoria", "Consumo de agua")
          .eq("hora_lectura", "07:00")
          .maybeSingle();

        if (prev7am) {
          const v = curViv - (prev7am.lectura_vivero_m3 || 0);
          const p = curPet - (prev7am.lectura_petar_m3 || 0);
          const f = curFil - (prev7am.lectura_filtrada_m3 || 0);
          const s = curSua - (prev7am.lectura_suavizada_m3 || 0);
          consumo_dia_m3 = (v>0?v:0) + (p>0?p:0) + (f>0?f:0) + (s>0?s:0);
        }
      } else if (form.hora_lectura === "07:00") {
        const yesterday = new Date(new Date(form.fecha).getTime() - 86400000).toISOString().slice(0, 10);
        const { data: prev16pm } = await supabase
          .from("registros_ambiental")
          .select("*")
          .eq("fecha", yesterday)
          .eq("categoria", "agua_energia")
          .eq("subcategoria", "Consumo de agua")
          .eq("hora_lectura", "16:00")
          .maybeSingle();

        if (prev16pm) {
          const v = curViv - (prev16pm.lectura_vivero_m3 || 0);
          const p = curPet - (prev16pm.lectura_petar_m3 || 0);
          const f = curFil - (prev16pm.lectura_filtrada_m3 || 0);
          const s = curSua - (prev16pm.lectura_suavizada_m3 || 0);
          consumo_noche_m3 = (v>0?v:0) + (p>0?p:0) + (f>0?f:0) + (s>0?s:0);
        }

        const { data: prev7amYesterday } = await supabase
          .from("registros_ambiental")
          .select("*")
          .eq("fecha", yesterday)
          .eq("categoria", "agua_energia")
          .eq("subcategoria", "Consumo de agua")
          .eq("hora_lectura", "07:00")
          .maybeSingle();

        if (prev7amYesterday) {
          const v = curViv - (prev7amYesterday.lectura_vivero_m3 || 0);
          const p = curPet - (prev7amYesterday.lectura_petar_m3 || 0);
          const f = curFil - (prev7amYesterday.lectura_filtrada_m3 || 0);
          const s = curSua - (prev7amYesterday.lectura_suavizada_m3 || 0);
          vivero = v>0?v:0; ptai = p>0?p:0; filtrada = f>0?f:0; suavizada = s>0?s:0;
          totalWater = vivero + ptai + filtrada + suavizada;
        }
      }
    }

    const payload = {
      fecha: form.fecha,
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      descripcion: form.descripcion,
      valor_medicion: isWater ? (totalWater !== null ? totalWater : null) : (form.valor_medicion ? Number(form.valor_medicion) : null),
      unidad_medicion: isWater ? "m³" : (form.unidad_medicion || null),
      tipo_residuo: form.categoria === "residuos_solidos" ? (form.tipo_residuo || null) : null,
      cantidad_residuo_kg: form.categoria === "residuos_solidos" && form.cantidad_residuo_kg ? Number(form.cantidad_residuo_kg) : null,
      tipo_control: form.categoria === "MIP" ? (form.tipo_control || null) : null,
      area_intervenida_ha: (form.categoria === "manejo_suelos" || form.categoria === "biodiversidad") && form.area_intervenida_ha ? Number(form.area_intervenida_ha) : null,
      evidencia_url: form.evidencia_url || null,
      observaciones: form.observaciones || null,
      operador_id: profile?.id,
      agua_suavizada_m3: suavizada,
      agua_filtrada_m3: filtrada,
      agua_ptai_m3: ptai,
      agua_vivero_m3: vivero,
      agua_total_m3: totalWater,
      lectura_vivero_m3: isWater ? Number(form.lectura_vivero_m3) : null,
      lectura_petar_m3: isWater ? Number(form.lectura_petar_m3) : null,
      lectura_filtrada_m3: isWater ? Number(form.lectura_filtrada_m3) : null,
      lectura_suavizada_m3: isWater ? Number(form.lectura_suavizada_m3) : null,
      hora_lectura: isWater ? form.hora_lectura : null,
      consumo_dia_m3: isWater ? consumo_dia_m3 : null,
      consumo_noche_m3: isWater ? consumo_noche_m3 : null,
    };

    let targetId = editing?.id;

    if (!targetId && isWater) {
      const { data: existing } = await supabase
        .from("registros_ambiental")
        .select("id")
        .eq("fecha", form.fecha)
        .eq("categoria", "agua_energia")
        .eq("subcategoria", "Consumo de agua")
        .eq("hora_lectura", form.hora_lectura)
        .maybeSingle();
      if (existing) {
        targetId = existing.id;
      }
    }

    const { error } = targetId
      ? await supabase.from("registros_ambiental").update(payload).eq("id", targetId)
      : await supabase.from("registros_ambiental").insert(payload);

    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(targetId && !editing?.id ? "Registro diario de agua actualizado (upsert)" : editing ? "Registro actualizado" : "Registro creado");
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

  const filtered = registros.filter((r) => {
    if (filterCat !== "all" && r.categoria !== filterCat) return false;
    if (filterCat === "agua_energia") {
      if (filterSub === "water") {
        return r.subcategoria === "Consumo de agua";
      }
      if (filterSub === "energy") {
        return r.subcategoria === "Consumo energía kWh";
      }
    }
    return true;
  });
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
            <Select value={filterCat} onValueChange={(v) => { setFilterCat(v); setFilterSub("all"); }}>
              <SelectTrigger className="w-[230px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>

          </div>
        </CardHeader>
        {filterCat === "agua_energia" && (
          <div className="flex items-center gap-2 mb-4 px-6 flex-wrap animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-xs font-medium text-muted-foreground mr-1">Filtrar por consumo:</span>
            <Button
              size="sm"
              variant={filterSub === "all" ? "default" : "outline"}
              className={filterSub === "all" ? "bg-primary hover:bg-primary-dark" : "text-foreground"}
              onClick={() => setFilterSub("all")}
            >
              Todas
            </Button>
            <Button
              size="sm"
              variant={filterSub === "water" ? "default" : "outline"}
              className={filterSub === "water" ? "bg-primary hover:bg-primary-dark" : "text-foreground"}
              onClick={() => setFilterSub("water")}
            >
              Consumo de agua
            </Button>
            <Button
              size="sm"
              variant={filterSub === "energy" ? "default" : "outline"}
              className={filterSub === "energy" ? "bg-primary hover:bg-primary-dark" : "text-foreground"}
              onClick={() => setFilterSub("energy")}
            >
              Consumo de energía
            </Button>
          </div>
        )}
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
                    <TableRow 
                      key={r.id}
                      className={r.subcategoria === "Consumo de agua" ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).closest("button") || (e.target as HTMLElement).closest("a")) {
                          return;
                        }
                        if (r.subcategoria === "Consumo de agua") {
                          setSelectedWaterRecord(r);
                        }
                      }}
                    >
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

            {form.categoria === "agua_energia" && form.subcategoria === "Consumo de agua" ? (
              <>
                <div className="md:col-span-2">
                  <Label>Hora de lectura</Label>
                  <Select value={form.hora_lectura} onValueChange={(v) => setForm({ ...form, hora_lectura: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="07:00">7:00 a.m. (Cierre 24h)</SelectItem>
                      <SelectItem value="16:00">4:00 p.m. (Cierre Turno Día)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Lectura Medidor Suavizada (m³)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.lectura_suavizada_m3}
                    onChange={(e) => setForm({ ...form, lectura_suavizada_m3: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Lectura Medidor Filtrada (m³)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.lectura_filtrada_m3}
                    onChange={(e) => setForm({ ...form, lectura_filtrada_m3: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Lectura Medidor PETAR Entrada (m³)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.lectura_petar_m3}
                    onChange={(e) => setForm({ ...form, lectura_petar_m3: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Lectura Medidor Vivero (m³)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.lectura_vivero_m3}
                    onChange={(e) => setForm({ ...form, lectura_vivero_m3: e.target.value })}
                  />
                </div>
                <div className="md:col-span-2 text-sm text-muted-foreground bg-muted p-3 rounded-md">
                  Los consumos totales y por turno se calcularán automáticamente al guardar la lectura comparando con el registro anterior.
                </div>
              </>
            ) : (
              !["residuos_solidos"].includes(form.categoria) && (
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
              )
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

      {/* Detail Modal for Water Consumption */}
      <Dialog open={!!selectedWaterRecord} onOpenChange={(o) => !o && setSelectedWaterRecord(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold font-display text-primary">
              <Leaf className="w-6 h-6 text-primary" /> Consumo de agua diario
            </DialogTitle>
          </DialogHeader>

          {selectedWaterRecord && (() => {
            const s = selectedWaterRecord.agua_suavizada_m3 ?? 0;
            const f = selectedWaterRecord.agua_filtrada_m3 ?? 0;
            const p = selectedWaterRecord.agua_ptai_m3 ?? 0;
            const v = selectedWaterRecord.agua_vivero_m3 ?? 0;
            const total = selectedWaterRecord.agua_total_m3 ?? selectedWaterRecord.valor_medicion ?? (s + f + p + v);
            const dia = selectedWaterRecord.consumo_dia_m3;
            const noche = selectedWaterRecord.consumo_noche_m3;
            const hora = selectedWaterRecord.hora_lectura;

            const data = [
              { name: "Agua suavizada", value: s },
              { name: "Agua filtrada", value: f },
              { name: "Agua PTAI", value: p },
              { name: "Agua Vivero", value: v },
            ].filter((item) => item.value > 0);

            const COLORS = ["#1B5E20", "#2E7D32", "#4CAF50", "#81C784"];

            const handleEditFromDetail = () => {
              if (selectedWaterRecord) {
                const record = selectedWaterRecord;
                setSelectedWaterRecord(null);
                openEdit(record);
              }
            };

            return (
              <div className="space-y-6 py-2">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Fecha de registro</p>
                    <p className="text-lg font-bold font-mono text-primary mt-0.5">{selectedWaterRecord.fecha} {hora ? `(${hora})` : ""}</p>
                  </div>
                  <div className="flex gap-4 text-right">
                    {dia != null && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Turno Día</p>
                        <p className="text-xl font-bold text-foreground mt-0.5 font-mono">{dia} m³</p>
                      </div>
                    )}
                    {noche != null && (
                      <div>
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Turno Noche</p>
                        <p className="text-xl font-bold text-foreground mt-0.5 font-mono">{noche} m³</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-primary font-medium uppercase tracking-wider">Total 24h</p>
                      <p className="text-2xl font-bold text-primary mt-0.5 font-mono">{total} m³</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="flex flex-col items-center justify-center bg-card border border-border p-4 rounded-xl h-[240px]">
                    <p className="text-sm font-semibold text-foreground mb-2">Distribución por Fuente</p>
                    {data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={70}
                            paddingAngle={3}
                            dataKey="value"
                          >
                            {data.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value) => `${value} m³`} />
                          <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        Sin datos individuales de consumo
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-secondary/30 rounded-xl border border-border flex flex-col justify-between h-[90px]">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        💧 Agua suavizada
                      </span>
                      <span className="text-xl font-bold font-mono text-primary mt-1">
                        {s} m³
                      </span>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-xl border border-border flex flex-col justify-between h-[90px]">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        💧 Agua filtrada
                      </span>
                      <span className="text-xl font-bold font-mono text-primary mt-1">
                        {f} m³
                      </span>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-xl border border-border flex flex-col justify-between h-[90px]">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        💧 Agua PTAI
                      </span>
                      <span className="text-xl font-bold font-mono text-primary mt-1">
                        {p} m³
                      </span>
                    </div>
                    <div className="p-3 bg-secondary/30 rounded-xl border border-border flex flex-col justify-between h-[90px]">
                      <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                        💧 Agua Vivero
                      </span>
                      <span className="text-xl font-bold font-mono text-primary mt-1">
                        {v} m³
                      </span>
                    </div>
                  </div>
                </div>

                {selectedWaterRecord.descripcion && (
                  <div className="bg-card border border-border p-4 rounded-xl">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Descripción / Observaciones</p>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{selectedWaterRecord.descripcion}</p>
                    {selectedWaterRecord.observaciones && (
                      <p className="text-sm text-muted-foreground mt-2 italic">Nota: {selectedWaterRecord.observaciones}</p>
                    )}
                  </div>
                )}

                <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2 pt-2">
                  <div className="text-xs text-muted-foreground font-mono">
                    Total: <span className="font-bold text-foreground">{total} m³</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setSelectedWaterRecord(null)}>
                      Cerrar
                    </Button>
                    {canWrite && (
                      <Button onClick={handleEditFromDetail} className="bg-primary hover:bg-primary-dark">
                        <Pencil className="w-4 h-4 mr-2" /> Editar registro
                      </Button>
                    )}
                  </div>
                </DialogFooter>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

