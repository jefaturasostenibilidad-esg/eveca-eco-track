import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Droplets, Leaf, TreePine, FileText, Loader2, TrendingUp, AlertTriangle, FileSpreadsheet, Image as ImageIcon } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import { exportFullDatabaseExcel, exportDashboardImage, type DashboardKpi } from "@/lib/exports";
import { toast } from "sonner";
import evecaLogo from "@/assets/eveca-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

interface Efluente {
  fecha: string; tanque: string; cantidad_pome_m3: number | null;
  cantidad_pome_biodigestor_m3: number | null;
  cantidad_aceite_recuperado_litros: number | null;
  uso_contingencia: boolean;
}
interface Ambiental { fecha: string; categoria: string; cantidad_residuo_kg: number | null; }
interface Zonas { fecha: string; actividad: string; area_m2: number | null; }
interface Reporte { fecha: string; }

const COLORS = ["#16a34a", "#f59e0b", "#3b82f6", "#a855f7", "#ef4444", "#0ea5e9", "#84cc16", "#f97316"];

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function fechaBonita(iso: string) {
  // iso: YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [efluentes, setEfluentes] = useState<Efluente[]>([]);
  const [ambiental, setAmbiental] = useState<Ambiental[]>([]);
  const [zonas, setZonas] = useState<Zonas[]>([]);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const dashRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState<null | "xlsx" | "png">(null);

  const load = async () => {
    setLoading(true);
    const desde = new Date(); desde.setDate(desde.getDate() - 180);
    const dISO = desde.toISOString().slice(0, 10);
    const [a, b, c, d] = await Promise.all([
      supabase.from("registros_efluentes")
        .select("fecha,tanque,cantidad_pome_m3,cantidad_pome_biodigestor_m3,cantidad_aceite_recuperado_litros,uso_contingencia")
        .gte("fecha", dISO),
      supabase.from("registros_ambiental")
        .select("fecha,categoria,cantidad_residuo_kg").gte("fecha", dISO),
      supabase.from("registros_zonas_verdes")
        .select("fecha,actividad,area_m2").gte("fecha", dISO),
      supabase.from("reportes").select("fecha").gte("fecha", dISO),
    ]);
    setEfluentes((a.data ?? []) as Efluente[]);
    setAmbiental((b.data ?? []) as Ambiental[]);
    setZonas((c.data ?? []) as Zonas[]);
    setReportes((d.data ?? []) as Reporte[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase.channel("rt-dash")
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_efluentes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_ambiental" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "registros_zonas_verdes" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "reportes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const hoy = hoyISO();

  const kpis = useMemo(() => {
    const pomeHoy = efluentes
      .filter((e) => e.fecha === hoy)
      .reduce((s, e) => s + (e.cantidad_pome_m3 ?? 0), 0);
    const aceiteHoy = efluentes
      .filter((e) => e.fecha === hoy)
      .reduce((s, e) => s + (e.cantidad_aceite_recuperado_litros ?? 0), 0);
    const residuosHoy = ambiental
      .filter((r) => r.fecha === hoy)
      .reduce((s, r) => s + (r.cantidad_residuo_kg ?? 0), 0);
    const areaHoy = zonas
      .filter((z) => z.fecha === hoy)
      .reduce((s, z) => s + (z.area_m2 ?? 0), 0);
    const reportesHoy = reportes.filter((r) => r.fecha === hoy).length;
    const contingencias = efluentes.filter((e) => e.uso_contingencia && e.fecha === hoy).length;
    return { pomeHoy, aceiteHoy, residuosHoy, areaHoy, reportesHoy, contingencias };
  }, [efluentes, ambiental, zonas, reportes, hoy]);

  // Serie diaria — últimos 30 días
  const serieEfluentes = useMemo(() => {
    const byDay: Record<string, { dia: string; pome: number; biodigestor: number; aceite: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      byDay[k] = { dia: k.slice(5), pome: 0, biodigestor: 0, aceite: 0 };
    }
    efluentes.forEach((e) => {
      const k = e.fecha.slice(0, 10);
      if (byDay[k]) {
        byDay[k].pome += e.cantidad_pome_m3 ?? 0;
        byDay[k].biodigestor += e.cantidad_pome_biodigestor_m3 ?? 0;
        byDay[k].aceite += e.cantidad_aceite_recuperado_litros ?? 0;
      }
    });
    return Object.values(byDay);
  }, [efluentes]);

  // Distribución residuos por categoría (hoy)
  const residuosPorCat = useMemo(() => {
    const map: Record<string, number> = {};
    ambiental.filter((r) => r.fecha === hoy && r.cantidad_residuo_kg).forEach((r) => {
      map[r.categoria] = (map[r.categoria] ?? 0) + (r.cantidad_residuo_kg ?? 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [ambiental, hoy]);

  // Zonas verdes por actividad
  const zonasPorAct = useMemo(() => {
    const map: Record<string, number> = {};
    zonas.forEach((z) => {
      map[z.actividad] = (map[z.actividad] ?? 0) + (z.area_m2 ?? 0);
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [zonas]);

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground"><Loader2 className="w-6 h-6 inline animate-spin mr-2" />Cargando dashboard…</div>;
  }

  const kpiCards = [
    { icon: Droplets, label: "POME procesado hoy (m³)", val: kpis.pomeHoy.toFixed(1), color: "text-primary bg-primary/10" },
    { icon: Droplets, label: "Aceite recuperado hoy (L)", val: kpis.aceiteHoy.toFixed(1), color: "text-amber-foreground bg-amber/20" },
    { icon: Leaf, label: "Residuos del día (kg)", val: kpis.residuosHoy.toFixed(1), color: "text-success bg-success/10" },
    { icon: TreePine, label: "Área intervenida hoy (m²)", val: kpis.areaHoy.toFixed(0), color: "text-amber-foreground bg-amber/20" },
    { icon: FileText, label: "Reportes de hoy", val: String(kpis.reportesHoy), color: "text-primary bg-secondary" },
  ];



  const handleExportExcel = async () => {
    try {
      setExporting("xlsx");
      await exportFullDatabaseExcel();
      toast.success("Reporte Excel descargado");
    } catch (e: any) {
      toast.error("No se pudo exportar Excel", { description: e?.message });
    } finally {
      setExporting(null);
    }
  };

  const handleExportImage = async () => {
    if (!dashRef.current) return;
    try {
      setExporting("png");
      await exportDashboardImage(dashRef.current);
      toast.success("Imagen del dashboard descargada");
    } catch (e: any) {
      toast.error("No se pudo exportar imagen", { description: e?.message });
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={evecaLogo.url} alt="EVECA" className="h-12 w-auto object-contain hidden sm:block" />
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">Dashboard</h1>
            <p className="text-sm text-muted-foreground capitalize">Tablero diario · datos en tiempo real · {fechaBonita(hoy)}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {kpis.contingencias > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertTriangle className="w-4 h-4" />
              {kpis.contingencias} contingencia(s) hoy
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            disabled={exporting !== null}
            className="gap-2"
          >
            {exporting === "xlsx" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            Exportar Excel
          </Button>
          <Button
            size="sm"
            onClick={handleExportImage}
            disabled={exporting !== null}
            className="gap-2"
          >
            {exporting === "png" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            Dashboard
          </Button>
        </div>
      </div>

      <div ref={dashRef} className="space-y-6">

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${k.color}`}>
                <k.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-display">{k.label}</div>
                <div className="text-2xl font-bold font-display">{k.val}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" /> Efluentes — últimos 30 días
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serieEfluentes}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={2} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="pome" name="POME m³" fill="#16a34a" />
                <Bar dataKey="biodigestor" name="A biodigestor m³" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Aceite recuperado (L) — últimos 30 días</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serieEfluentes}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} interval={2} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="aceite" name="Aceite L" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Residuos por categoría — hoy</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {residuosPorCat.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sin datos del día</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={residuosPorCat} dataKey="value" nameKey="name" outerRadius={90} label={(d) => `${d.name}: ${d.value}kg`}>
                    {residuosPorCat.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">Zonas verdes — m² por actividad (180d)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {zonasPorAct.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Sin datos</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={zonasPorAct} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                  <Tooltip />
                  <Bar dataKey="value" name="m²" fill="#16a34a" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}

