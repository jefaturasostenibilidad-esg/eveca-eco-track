import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Droplets, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/efluentes")({
  component: EfluentesPage,
});

type Tanque = "TK1" | "TK2" | "TK3" | "TK4";
type Biodigestor = "BD1" | "BD2";

interface Registro {
  id: string;
  fecha: string;
  hora: string;
  tanque: Tanque;
  cantidad_pome_m3: number | null;
  nivel_inicial_cm: number | null;
  nivel_final_cm: number | null;
  enviado_biodigestor: boolean;
  biodigestor_destino: Biodigestor | null;
  cantidad_pome_biodigestor_m3: number | null;
  cantidad_aceite_recuperado_litros: number | null;
  uso_contingencia: boolean;
  observaciones: string | null;
  ph: number | null;
  temperatura_c: number | null;
  volumetria_ml: number | null;
  operador_id: string | null;
  created_at: string;
}

const TANQUES_INFO: Record<Tanque, { label: string; sub: string; color: string }> = {
  TK1: { label: "TK1", sub: "Efluentes (POME)", color: "bg-blue-500/15 text-blue-700 border-blue-300" },
  TK2: { label: "TK2", sub: "Aceites Recuperados", color: "bg-amber/20 text-amber-foreground border-amber/40" },
  TK3: { label: "TK3", sub: "Lixiviados", color: "bg-emerald-500/15 text-emerald-700 border-emerald-300" },
  TK4: { label: "TK4", sub: "Abono Líquido / Contingencia", color: "bg-purple-500/15 text-purple-700 border-purple-300" },
};

// Factores de conversión volumétrica (m³ por cm de altura) según diámetro del biotanque ITM.
// TK1 (Biotanque Grande Ø 17.13 m): 0.230438 m³/cm
// TK3 (Biotanque Pequeño Ø 7.45 m): 0.043589 m³/cm
const FACTOR_POME_M3_POR_CM: Record<Tanque, number> = {
  TK1: 0.230438,
  TK2: 0,
  TK3: 0.043589,
  TK4: 0,
};

function calcularPomeM3(tanque: Tanque, nivelInicial: string, nivelFinal: string): number {
  const factor = FACTOR_POME_M3_POR_CM[tanque] ?? 0;
  if (!factor) return 0;
  if (nivelInicial === "" || nivelFinal === "") return 0;
  const ni = Number(nivelInicial);
  const nf = Number(nivelFinal);
  if (!isFinite(ni) || !isFinite(nf)) return 0;
  const diff = nf - ni;
  if (diff <= 0) return 0;
  return Math.round(diff * factor * 100) / 100;
}

function todayISO() {
  // Colombia UTC-5; tomamos la fecha local del navegador sin transformaciones
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function nowHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

interface FormState {
  fecha: string;
  hora: string;
  tanque: Tanque;
  cantidad_pome_m3: string;
  nivel_inicial_cm: string;
  nivel_final_cm: string;
  enviado_biodigestor: boolean;
  biodigestor_destino: Biodigestor | "";
  cantidad_pome_biodigestor_m3: string;
  cantidad_aceite_recuperado_litros: string;
  uso_contingencia: boolean;
  observaciones: string;
  ph: string;
  temperatura_c: string;
  volumetria_ml: string;
}

const emptyForm = (): FormState => ({
  fecha: todayISO(),
  hora: nowHM(),
  tanque: "TK1",
  cantidad_pome_m3: "",
  nivel_inicial_cm: "",
  nivel_final_cm: "",
  enviado_biodigestor: false,
  biodigestor_destino: "",
  cantidad_pome_biodigestor_m3: "",
  cantidad_aceite_recuperado_litros: "",
  uso_contingencia: true,
  observaciones: "",
  ph: "",
  temperatura_c: "",
  volumetria_ml: "",
});

function EfluentesPage() {
  const { profile, user } = useAuth();
  const canEdit = profile?.rol === "operador" || profile?.rol === "superadmin";
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Registro | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [filterTanque, setFilterTanque] = useState<"all" | Tanque>("all");

  // Auto-cálculo de Cantidad POME (m³) en tiempo real (solo TK1/TK3).
  useEffect(() => {
    const isPomeTank = form.tanque === "TK1" || form.tanque === "TK3";
    if (!isPomeTank) return;
    const calc = calcularPomeM3(form.tanque, form.nivel_inicial_cm, form.nivel_final_cm);
    const next = calc > 0 ? calc.toFixed(2) : "";
    if (next !== form.cantidad_pome_m3) {
      setForm((f) => ({ ...f, cantidad_pome_m3: next }));
    }
  }, [form.tanque, form.nivel_inicial_cm, form.nivel_final_cm, form.cantidad_pome_m3]);

  const fetchRegistros = async () => {
    let q = supabase.from("registros_efluentes").select("*").order("fecha", { ascending: false }).order("hora", { ascending: false });
    if (filterTanque !== "all") q = q.eq("tanque", filterTanque);
    const { data, error } = await q;
    if (error) toast.error(error.message);
    setRegistros((data as Registro[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchRegistros(); /* eslint-disable-next-line */ }, [filterTanque]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel("efluentes-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_efluentes" }, () => fetchRegistros())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, [filterTanque]);

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm());
    setOpen(true);
  };

  const openEdit = (r: Registro) => {
    setEditing(r);
    setForm({
      fecha: r.fecha,
      hora: r.hora.slice(0, 5),
      tanque: r.tanque,
      cantidad_pome_m3: r.cantidad_pome_m3?.toString() ?? "",
      nivel_inicial_cm: r.nivel_inicial_cm?.toString() ?? "",
      nivel_final_cm: r.nivel_final_cm?.toString() ?? "",
      enviado_biodigestor: r.enviado_biodigestor,
      biodigestor_destino: r.biodigestor_destino ?? "",
      cantidad_pome_biodigestor_m3: r.cantidad_pome_biodigestor_m3?.toString() ?? "",
      cantidad_aceite_recuperado_litros: r.cantidad_aceite_recuperado_litros?.toString() ?? "",
      uso_contingencia: r.uso_contingencia,
      observaciones: r.observaciones ?? "",
      ph: r.ph?.toString() ?? "",
      temperatura_c: r.temperatura_c?.toString() ?? "",
      volumetria_ml: r.volumetria_ml?.toString() ?? "",
    });
    setOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validaciones por tanque
    const isPome = form.tanque === "TK1" || form.tanque === "TK3";
    if (isPome) {
      if (!form.cantidad_pome_m3 || Number(form.cantidad_pome_m3) < 0) {
        return toast.error("Cantidad de POME es requerida y debe ser ≥ 0");
      }
      if (form.enviado_biodigestor) {
        if (!form.biodigestor_destino) return toast.error("Selecciona el biodigestor destino");
        const total = Number(form.cantidad_pome_m3);
        const env = Number(form.cantidad_pome_biodigestor_m3);
        if (!env || env < 0) return toast.error("Cantidad enviada al biodigestor inválida");
        if (env > total) return toast.error("La cantidad enviada al biodigestor no puede superar la cantidad total de POME");
      }
    }
    if (form.tanque === "TK2") {
      if (!form.cantidad_aceite_recuperado_litros || Number(form.cantidad_aceite_recuperado_litros) < 0) {
        return toast.error("Cantidad de aceite recuperado es requerida y debe ser ≥ 0");
      }
    }
    if (form.tanque === "TK4") {
      if (!form.observaciones.trim()) return toast.error("Observaciones requeridas para TK4");
    }

    const payload = {
      fecha: form.fecha,
      hora: form.hora,
      tanque: form.tanque,
      cantidad_pome_m3: isPome ? Number(form.cantidad_pome_m3) : (form.tanque === "TK4" && form.cantidad_pome_m3 ? Number(form.cantidad_pome_m3) : null),
      nivel_inicial_cm: isPome && form.nivel_inicial_cm ? Number(form.nivel_inicial_cm) : null,
      nivel_final_cm: isPome && form.nivel_final_cm ? Number(form.nivel_final_cm) : null,
      enviado_biodigestor: isPome ? form.enviado_biodigestor : false,
      biodigestor_destino: isPome && form.enviado_biodigestor ? form.biodigestor_destino || null : null,
      cantidad_pome_biodigestor_m3: isPome && form.enviado_biodigestor && form.cantidad_pome_biodigestor_m3
        ? Number(form.cantidad_pome_biodigestor_m3) : null,
      cantidad_aceite_recuperado_litros: form.tanque === "TK2" ? Number(form.cantidad_aceite_recuperado_litros) : null,
      uso_contingencia: form.tanque === "TK4" ? form.uso_contingencia : false,
      observaciones: form.observaciones.trim() || null,
      ph: form.ph !== "" ? Number(form.ph) : null,
      temperatura_c: form.temperatura_c !== "" ? Number(form.temperatura_c) : null,
      volumetria_ml: form.volumetria_ml !== "" ? Number(form.volumetria_ml) : null,
      operador_id: user.id,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    if (editing) {
      const { error } = await supabase.from("registros_efluentes").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Registro actualizado");
    } else {
      const { error } = await supabase.from("registros_efluentes").insert(payload);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success("Registro creado");
    }
    setSaving(false);
    setOpen(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("registros_efluentes").delete().eq("id", deleteId);
    if (error) return toast.error(error.message);
    toast.success("Registro eliminado");
    setDeleteId(null);
  };

  // Resumen último por tanque
  const ultimoPorTanque = (t: Tanque) => registros.find((r) => r.tanque === t);

  const isPome = form.tanque === "TK1" || form.tanque === "TK3";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
            <Droplets className="w-7 h-7" /> Gestión de Efluentes
          </h1>
          <p className="text-sm text-muted-foreground">Registro y monitoreo de POME, aceites y biodigestores</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="bg-primary hover:bg-primary-dark">
                <Plus className="w-4 h-4 mr-2" /> Nuevo Registro
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editing ? "Editar registro" : "Nuevo registro de efluente"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Fecha</Label>
                    <Input type="date" required value={form.fecha}
                      onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
                  </div>
                  <div>
                    <Label>Hora</Label>
                    <Input type="time" required value={form.hora}
                      onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                  </div>
                  <div>
                    <Label>Tanque</Label>
                    <Select value={form.tanque} onValueChange={(v) => setForm({ ...form, tanque: v as Tanque })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TK1">TK1 — Efluentes (POME)</SelectItem>
                        <SelectItem value="TK2">TK2 — Aceites Recuperados</SelectItem>
                        <SelectItem value="TK3">TK3 — Lixiviados</SelectItem>
                        <SelectItem value="TK4">TK4 — Abono Líquido / Contingencia</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isPome && (
                  <div className="space-y-4 p-4 rounded-lg bg-secondary/40 border border-border">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label>Nivel inicial (cm)</Label>
                        <Input type="number" min={0} step="0.01" value={form.nivel_inicial_cm}
                          onChange={(e) => setForm({ ...form, nivel_inicial_cm: e.target.value })} />
                      </div>
                      <div>
                        <Label>Nivel final (cm)</Label>
                        <Input type="number" min={0} step="0.01" value={form.nivel_final_cm}
                          onChange={(e) => setForm({ ...form, nivel_final_cm: e.target.value })} />
                      </div>
                      <div>
                        <Label>Cantidad POME (m³) — automático</Label>
                        <Input
                          type="number"
                          step="0.01"
                          readOnly
                          tabIndex={-1}
                          value={form.cantidad_pome_m3}
                          className="bg-muted/50 cursor-not-allowed font-display font-semibold"
                          placeholder="0.00"
                        />
                        <p className="text-[10px] text-muted-foreground mt-1">
                          Factor {form.tanque}: {FACTOR_POME_M3_POR_CM[form.tanque]} m³/cm
                        </p>
                      </div>
                    </div>
                    {form.nivel_inicial_cm !== "" && form.nivel_final_cm !== "" &&
                      Number(form.nivel_final_cm) < Number(form.nivel_inicial_cm) && (
                        <p className="text-xs text-amber-600 -mt-2">
                          El nivel final debe ser mayor al inicial.
                        </p>
                      )}
                    <div className="flex items-center gap-3 p-3 rounded-md bg-card border border-border">
                      <Switch checked={form.enviado_biodigestor}
                        onCheckedChange={(v) => setForm({ ...form, enviado_biodigestor: v })} />
                      <Label className="cursor-pointer">¿Se envió POME al biodigestor?</Label>
                    </div>
                    {form.enviado_biodigestor && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Biodigestor destino *</Label>
                          <Select value={form.biodigestor_destino}
                            onValueChange={(v) => setForm({ ...form, biodigestor_destino: v as Biodigestor })}>
                            <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="BD1">BD1 — Biodigestor 1</SelectItem>
                              <SelectItem value="BD2">BD2 — Biodigestor 2</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Cantidad enviada al biodigestor (m³) *</Label>
                          <Input type="number" min={0} step="0.01" required={form.enviado_biodigestor}
                            value={form.cantidad_pome_biodigestor_m3}
                            onChange={(e) => setForm({ ...form, cantidad_pome_biodigestor_m3: e.target.value })} />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {form.tanque === "TK2" && (
                  <div className="p-4 rounded-lg bg-amber/10 border border-amber/30">
                    <Label>Cantidad de aceite recuperado (litros) *</Label>
                    <Input type="number" min={0} step="0.01" required value={form.cantidad_aceite_recuperado_litros}
                      onChange={(e) => setForm({ ...form, cantidad_aceite_recuperado_litros: e.target.value })} />
                  </div>
                )}

                {form.tanque === "TK4" && (
                  <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30 space-y-3">
                    <div className="flex items-center gap-3">
                      <Switch checked={form.uso_contingencia}
                        onCheckedChange={(v) => setForm({ ...form, uso_contingencia: v })} />
                      <Label>¿Es uso de contingencia?</Label>
                    </div>
                    <div>
                      <Label>Cantidad POME (m³) — opcional</Label>
                      <Input type="number" min={0} step="0.01" value={form.cantidad_pome_m3}
                        onChange={(e) => setForm({ ...form, cantidad_pome_m3: e.target.value })} />
                    </div>
                  </div>
                )}

                <div>
                  <Label>Observaciones {form.tanque === "TK4" && "*"}</Label>
                  <Textarea rows={3} value={form.observaciones}
                    onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {editing ? "Guardar cambios" : "Crear registro"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Resumen de tanques */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.keys(TANQUES_INFO) as Tanque[]).map((t) => {
          const u = ultimoPorTanque(t);
          const info = TANQUES_INFO[t];
          return (
            <Card key={t} className="overflow-hidden">
              <div className={`px-4 py-2 border-b ${info.color}`}>
                <div className="font-display font-bold">{info.label}</div>
                <div className="text-[10px] uppercase tracking-wider">{info.sub}</div>
              </div>
              <CardContent className="p-4">
                {u ? (
                  <div className="text-sm">
                    <div className="text-muted-foreground text-xs">Último: {u.fecha} · {u.hora.slice(0, 5)}</div>
                    <div className="font-display font-bold text-lg text-primary mt-1">
                      {t === "TK2"
                        ? `${u.cantidad_aceite_recuperado_litros ?? 0} L`
                        : `${u.cantidad_pome_m3 ?? 0} m³`}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">Sin registros</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="font-display text-lg">Registros</CardTitle>
          <Select value={filterTanque} onValueChange={(v) => setFilterTanque(v as typeof filterTanque)}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tanques</SelectItem>
              <SelectItem value="TK1">TK1</SelectItem>
              <SelectItem value="TK2">TK2</SelectItem>
              <SelectItem value="TK3">TK3</SelectItem>
              <SelectItem value="TK4">TK4</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin inline mr-2" /> Cargando…
            </div>
          ) : registros.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No hay registros aún.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Hora</TableHead>
                    <TableHead>Tanque</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Biodigestor</TableHead>
                    <TableHead>Observaciones</TableHead>
                    {canEdit && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {registros.map((r) => (
                    <TableRow key={r.id} className="hover:bg-primary/5">
                      <TableCell className="whitespace-nowrap">{r.fecha}</TableCell>
                      <TableCell>{r.hora.slice(0, 5)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={TANQUES_INFO[r.tanque].color}>
                          {r.tanque}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {r.tanque === "TK2"
                          ? `${r.cantidad_aceite_recuperado_litros ?? 0} L`
                          : `${r.cantidad_pome_m3 ?? 0} m³`}
                      </TableCell>
                      <TableCell>
                        {r.enviado_biodigestor
                          ? <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                              {r.biodigestor_destino} · {r.cantidad_pome_biodigestor_m3} m³
                            </Badge>
                          : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                        {r.observaciones || "—"}
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(r)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteId(r.id)}
                            className="text-destructive hover:text-destructive">
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar registro?</AlertDialogTitle>
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
