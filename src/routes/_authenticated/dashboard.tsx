import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Droplets, Leaf, TreePine, FileText, Loader2, TrendingUp,
  AlertTriangle, FileSpreadsheet, Image as ImageIcon, RefreshCw,
  Wifi, WifiOff, Clock, Activity,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, AreaChart, Area,
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
interface Ambiental {
  fecha: string; categoria: string; subcategoria: string | null;
  cantidad_residuo_kg: number | null;
  valor_medicion: number | null; unidad_medicion: string | null;
}
interface Zonas { fecha: string; actividad: string; area_m2: number | null; }
interface Reporte { fecha: string; tipo: string; }

const COLORS = ["#16a34a","#f59e0b","#3b82f6","#a855f7","#ef4444","#0ea5e9","#84cc16","#f97316"];

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function fechaBonita(iso: string) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y,m-1,d).toLocaleDateString("es-CO",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
}
function formatHora(d: Date) {
  return d.toLocaleTimeString("es-CO",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
}
function localDateString(isoOrDate: string | null | undefined) {
  if (!isoOrDate) return "";
  if (isoOrDate.includes("T")) {
    const d = new Date(isoOrDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return isoOrDate.slice(0, 10);
}

function mismaFecha(a: string, b: string) { return localDateString(a) === b; }

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Activity className="w-8 h-8 opacity-20" />
      <span className="text-xs text-center max-w-[160px] leading-snug">{label}</span>
    </div>
  );
}

function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [hoy, setHoy] = useState(hoyISO());
  const [efluentes, setEfluentes] = useState<Efluente[]>([]);
  const [ambiental, setAmbiental] = useState<Ambiental[]>([]);
  const [zonas, setZonas] = useState<Zonas[]>([]);
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const dashRef = useRef<HTMLDivElement | null>(null);
  const [exporting, setExporting] = useState<null | "xlsx" | "png">(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    const desde = new Date(); desde.setDate(desde.getDate() - 365);
    const dISO = desde.toISOString().slice(0,10);
    try {
      const [a,b,c,d] = await Promise.all([
        supabase.from("registros_efluentes")
          .select("fecha,tanque,cantidad_pome_m3,cantidad_pome_biodigestor_m3,cantidad_aceite_recuperado_litros,uso_contingencia")
          .gte("fecha", dISO).order("fecha",{ascending:true}),
        supabase.from("registros_ambiental")
          .select("fecha,categoria,subcategoria,cantidad_residuo_kg,valor_medicion,unidad_medicion")
          .gte("fecha", dISO).order("fecha",{ascending:true}),
        supabase.from("registros_zonas_verdes")
          .select("fecha,actividad,area_m2").gte("fecha", dISO).order("fecha",{ascending:true}),
        supabase.from("reportes")
          .select("fecha,tipo").gte("fecha", dISO).order("fecha",{ascending:true}),
      ]);
      if (a.error||b.error||c.error||d.error) {
        const err = a.error??b.error??c.error??d.error;
        toast.error("Error al cargar datos",{description: err?.message});
      } else {
        setEfluentes((a.data??[]) as Efluente[]);
        setAmbiental((b.data??[]) as Ambiental[]);
        setZonas((c.data??[]) as Zonas[]);
        setReportes((d.data??[]) as Reporte[]);
        setLastUpdate(new Date());
        setHoy(hoyISO());
      }
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => {
    load();
    const clockTick = setInterval(()=>setHoy(hoyISO()), 60_000);
    const ch = supabase.channel("rt-dash-v3")
      .on("postgres_changes",{event:"*",schema:"public",table:"registros_efluentes"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"registros_ambiental"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"registros_zonas_verdes"},()=>load(true))
      .on("postgres_changes",{event:"*",schema:"public",table:"reportes"},()=>load(true))
      .subscribe((status)=>setConnected(status==="SUBSCRIBED"));
    return () => { clearInterval(clockTick); supabase.removeChannel(ch); };
  }, [load]);

  const kpis = useMemo(()=>{
    const pomeHoy    = efluentes.filter(e=>mismaFecha(e.fecha,hoy)).reduce((s,e)=>s+(e.cantidad_pome_m3??0),0);
    const biodigHoy  = efluentes.filter(e=>mismaFecha(e.fecha,hoy)).reduce((s,e)=>s+(e.cantidad_pome_biodigestor_m3??0),0);
    const aceiteHoy  = efluentes.filter(e=>mismaFecha(e.fecha,hoy)).reduce((s,e)=>s+(e.cantidad_aceite_recuperado_litros??0),0);
    const residuosHoy= ambiental.filter(r=>mismaFecha(r.fecha,hoy)&&r.cantidad_residuo_kg).reduce((s,r)=>s+(r.cantidad_residuo_kg??0),0);
    const aguaHoy    = ambiental.filter(r=>mismaFecha(r.fecha,hoy)&&r.categoria==="agua_energia"&&r.subcategoria==="Consumo de agua").reduce((s,r)=>s+(r.valor_medicion??0),0);
    const areaHoy    = zonas.filter(z=>mismaFecha(z.fecha,hoy)).reduce((s,z)=>s+(z.area_m2??0),0);
    const reportesHoy= reportes.filter(r=>mismaFecha(r.fecha,hoy)).length;
    const contingencias= efluentes.filter(e=>e.uso_contingencia&&mismaFecha(e.fecha,hoy)).length;
    const desde30 = new Date(); desde30.setDate(desde30.getDate()-30);
    const dISO30 = `${desde30.getFullYear()}-${String(desde30.getMonth()+1).padStart(2,"0")}-${String(desde30.getDate()).padStart(2,"0")}`;
    const pomeMes    = efluentes.filter(e=>localDateString(e.fecha)>=dISO30).reduce((s,e)=>s+(e.cantidad_pome_m3??0),0);
    const residuosMes= ambiental.filter(r=>localDateString(r.fecha)>=dISO30&&r.cantidad_residuo_kg).reduce((s,r)=>s+(r.cantidad_residuo_kg??0),0);
    return {pomeHoy,biodigHoy,aceiteHoy,residuosHoy,aguaHoy,areaHoy,reportesHoy,contingencias,pomeMes,residuosMes};
  },[efluentes,ambiental,zonas,reportes,hoy]);

  const serieEfluentes = useMemo(()=>{
    const byDay: Record<string,{dia:string;pome:number;biodigestor:number;aceite:number}> = {};
    for(let i=29;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
      byDay[k]={dia:k.slice(5),pome:0,biodigestor:0,aceite:0};
    }
    efluentes.forEach(e=>{
      const k=localDateString(e.fecha);
      if(byDay[k]){byDay[k].pome+=e.cantidad_pome_m3??0;byDay[k].biodigestor+=e.cantidad_pome_biodigestor_m3??0;byDay[k].aceite+=e.cantidad_aceite_recuperado_litros??0;}
    });
    return Object.values(byDay);
  },[efluentes]);

  const residuosPorCat = useMemo(()=>{
    const hoyData = ambiental.filter(r=>mismaFecha(r.fecha,hoy)&&r.cantidad_residuo_kg);
    const source  = hoyData.length>0 ? hoyData : ambiental.filter(r=>r.cantidad_residuo_kg);
    const label   = hoyData.length>0 ? "hoy" : "365d";
    const map: Record<string,number> = {};
    source.forEach(r=>{const cat=r.subcategoria || "Otro";map[cat]=(map[cat]??0)+(r.cantidad_residuo_kg??0);});
    return {data:Object.entries(map).map(([name,value])=>({name,value})),label};
  },[ambiental,hoy]);

  const energiaPorMes = useMemo(()=>{
    const months: Record<string,number>={};
    for(let i=11;i>=0;i--){
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      months[k]=0;
    }
    ambiental.filter(r=>r.categoria==="agua_energia"&&r.subcategoria==="Consumo energía kWh").forEach(r=>{
      const k=localDateString(r.fecha).slice(0,7);
      if(months[k]!==undefined) months[k]+=r.valor_medicion??0;
    });
    return Object.entries(months).map(([name,value])=>({name,value}));
  },[ambiental]);

  const promedioAguaPorMes = useMemo(()=>{
    const months: Record<string,{ name: string; vivero: number; ptai: number; filtrada: number; suavizada: number; count: number }>={};
    for(let i=5;i>=0;i--){
      const d=new Date(); d.setMonth(d.getMonth()-i);
      const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      months[k]={ name: k, vivero: 0, ptai: 0, filtrada: 0, suavizada: 0, count: 0 };
    }
    ambiental.filter(r=>r.categoria==="agua_energia"&&r.subcategoria==="Consumo de agua").forEach(r=>{
      const k=localDateString(r.fecha).slice(0,7);
      if(months[k] && r.valor_medicion != null) {
        months[k].vivero += r.agua_vivero_m3 ?? 0;
        months[k].ptai += r.agua_ptai_m3 ?? 0;
        months[k].filtrada += r.agua_filtrada_m3 ?? 0;
        months[k].suavizada += r.agua_suavizada_m3 ?? 0;
        months[k].count++;
      }
    });
    return Object.values(months).map(m=>({
      name: m.name,
      Vivero: m.count > 0 ? Number((m.vivero / m.count).toFixed(2)) : 0,
      PETAR: m.count > 0 ? Number((m.ptai / m.count).toFixed(2)) : 0,
      Filtrada: m.count > 0 ? Number((m.filtrada / m.count).toFixed(2)) : 0,
      Suavizada: m.count > 0 ? Number((m.suavizada / m.count).toFixed(2)) : 0,
    }));
  },[ambiental]);

  const reportesPorTipo = useMemo(()=>{
    const map: Record<string,number>={};
    reportes.forEach(r=>{map[r.tipo]=(map[r.tipo]??0)+1;});
    return Object.entries(map).map(([name,value])=>({name,value}));
  },[reportes]);

  const handleExportExcel = async ()=>{
    try{setExporting("xlsx");await exportFullDatabaseExcel();toast.success("Reporte Excel descargado");}
    catch(e:any){toast.error("No se pudo exportar Excel",{description:e?.message});}
    finally{setExporting(null);}
  };

  const handleExportImage = async ()=>{
    try{
      setExporting("png");
      const exportKpis: DashboardKpi[]=[
        {label:"POME procesado hoy",value:kpis.pomeHoy.toFixed(1),unit:"m³",icon:"droplet",accent:"#2d6a4f"},
        {label:"Aceite recuperado hoy",value:kpis.aceiteHoy.toFixed(1),unit:"L",icon:"droplet",accent:"#b45309"},
        {label:"Residuos del día",value:kpis.residuosHoy.toFixed(1),unit:"kg",icon:"leaf",accent:"#059669"},
        {label:"Agua total hoy",value:kpis.aguaHoy.toFixed(2),unit:"m³",icon:"droplet",accent:"#0ea5e9"},
        {label:"Área intervenida hoy",value:kpis.areaHoy.toFixed(0),unit:"m²",icon:"tree",accent:"#065f46"},
        {label:"Reportes de hoy",value:String(kpis.reportesHoy),icon:"file-text",accent:"#1d4ed8"},
      ];
      await exportDashboardImage(dashRef.current??document.body,exportKpis);
      toast.success("Imagen del dashboard descargada");
    }catch(e:any){toast.error("No se pudo exportar imagen",{description:e?.message});}
    finally{setExporting(null);}
  };

  const CustomTooltip = ({active,payload,label}:any)=>{
    if(!active||!payload?.length) return null;
    return(
      <div className="bg-popover border border-border rounded-lg shadow-md p-3 text-xs">
        <p className="font-semibold text-foreground mb-1">{label}</p>
        {payload.map((p:any)=>(
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full inline-block" style={{background:p.color}}/>
            <span className="text-muted-foreground">{p.name}:</span>
            <span className="font-medium text-foreground">{typeof p.value==="number"?p.value.toFixed(2):p.value}</span>
          </div>
        ))}
      </div>
    );
  };

  if(loading){
    return(
      <div className="py-20 text-center text-muted-foreground flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary"/>
        <span className="text-sm">Cargando dashboard…</span>
      </div>
    );
  }

  const kpiCards=[
    {icon:Droplets,label:"POME procesado hoy",val:kpis.pomeHoy.toFixed(1),unit:"m³",sub:`${kpis.pomeMes.toFixed(1)} m³ en 30 días`,color:"text-emerald-700 bg-emerald-50 border-emerald-200",iconBg:"bg-emerald-100"},
    {icon:Droplets,label:"Aceite recuperado hoy",val:kpis.aceiteHoy.toFixed(1),unit:"L",sub:`${kpis.biodigHoy.toFixed(1)} m³ a biodigestor`,color:"text-amber-700 bg-amber-50 border-amber-200",iconBg:"bg-amber-100"},
    {icon:Leaf,label:"Residuos del día",val:kpis.residuosHoy.toFixed(1),unit:"kg",sub:`${kpis.residuosMes.toFixed(1)} kg en 30 días`,color:"text-green-700 bg-green-50 border-green-200",iconBg:"bg-green-100"},
    {icon:Droplets,label:"Agua total hoy",val:kpis.aguaHoy.toFixed(2),unit:"m³",sub:"Agua y energía",color:"text-sky-700 bg-sky-50 border-sky-200",iconBg:"bg-sky-100"},
    {icon:TreePine,label:"Área intervenida hoy",val:kpis.areaHoy.toFixed(0),unit:"m²",sub:"Zonas verdes",color:"text-teal-700 bg-teal-50 border-teal-200",iconBg:"bg-teal-100"},
    {icon:FileText,label:"Reportes de hoy",val:String(kpis.reportesHoy),unit:"",sub:`${reportes.length} en 365 días`,color:"text-indigo-700 bg-indigo-50 border-indigo-200",iconBg:"bg-indigo-100"},
  ];

  return(
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src={evecaLogo.url} alt="EVECA" className="h-12 w-auto object-contain hidden sm:block"/>
          <div>
            <h1 className="text-2xl font-display font-bold text-primary">Dashboard</h1>
            <p className="text-sm text-muted-foreground capitalize">Tablero diario · datos en tiempo real · {fechaBonita(hoy)}</p>
            {lastUpdate&&(
              <p className="text-xs text-muted-foreground/70 flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3"/>Última actualización: {formatHora(lastUpdate)}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
            connected===true?"bg-emerald-50 text-emerald-700 border-emerald-200":
            connected===false?"bg-red-50 text-red-700 border-red-200":
            "bg-muted text-muted-foreground border-border"}`}>
            {connected===true?<><Wifi className="w-3 h-3"/><span>En vivo</span><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/></>:
             connected===false?<><WifiOff className="w-3 h-3"/><span>Sin conexión</span></>:
             <><Activity className="w-3 h-3 animate-spin"/><span>Conectando…</span></>}
          </div>
          {kpis.contingencias>0&&(
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
              <AlertTriangle className="w-3.5 h-3.5"/>{kpis.contingencias} contingencia{kpis.contingencias>1?"s":""} hoy
            </div>
          )}
          <Button variant="outline" size="sm" onClick={()=>load(true)} disabled={refreshing||exporting!==null} className="gap-2">
            <RefreshCw className={`w-4 h-4 ${refreshing?"animate-spin":""}`}/>
            {refreshing?"Actualizando…":"Refrescar"}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={exporting!==null} className="gap-2">
            {exporting==="xlsx"?<Loader2 className="w-4 h-4 animate-spin"/>:<FileSpreadsheet className="w-4 h-4"/>}Exportar Excel
          </Button>
          <Button size="sm" onClick={handleExportImage} disabled={exporting!==null} className="gap-2">
            {exporting==="png"?<Loader2 className="w-4 h-4 animate-spin"/>:<ImageIcon className="w-4 h-4"/>}
            {exporting==="png"?"Generando…":"Dashboard"}
          </Button>
        </div>
      </div>

      <div ref={dashRef} className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {kpiCards.map(k=>(
            <Card key={k.label} className={`border ${k.color} transition-all hover:shadow-md`}>
              <CardContent className="p-4 flex flex-col gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${k.iconBg}`}>
                  <k.icon className="w-4 h-4"/>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold leading-tight">{k.label}</div>
                  <div className="text-xl font-bold font-display mt-0.5 leading-none">
                    {k.val}{k.unit&&<span className="text-xs font-normal text-muted-foreground ml-1">{k.unit}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">{k.sub}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary"/>Efluentes — últimos 30 días</CardTitle></CardHeader>
            <CardContent className="h-64">
              {serieEfluentes.every(d=>d.pome===0&&d.biodigestor===0)?<EmptyChart label="Sin registros de efluentes en los últimos 30 días"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={serieEfluentes} margin={{top:4,right:8,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                    <XAxis dataKey="dia" tick={{fontSize:10}} interval={4}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                    <Bar dataKey="pome" name="POME m³" fill="#16a34a" radius={[2,2,0,0]}/>
                    <Bar dataKey="biodigestor" name="A Biodigestor m³" fill="#3b82f6" radius={[2,2,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Aceite recuperado (L) — últimos 30 días</CardTitle></CardHeader>
            <CardContent className="h-64">
              {serieEfluentes.every(d=>d.aceite===0)?<EmptyChart label="Sin registros de aceite en los últimos 30 días"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serieEfluentes} margin={{top:4,right:8,left:-10,bottom:0}}>
                    <defs>
                      <linearGradient id="aceiteGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))"/>
                    <XAxis dataKey="dia" tick={{fontSize:10}} interval={4}/>
                    <YAxis tick={{fontSize:11}}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Area type="monotone" dataKey="aceite" name="Aceite L" stroke="#f59e0b" strokeWidth={2} fill="url(#aceiteGrad)" dot={{r:2,fill:"#f59e0b"}} activeDot={{r:4}}/>
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Promedio mensual de consumo de agua (m³)</CardTitle></CardHeader>
            <CardContent className="h-64">
              {promedioAguaPorMes.every(d=>d.Vivero===0&&d.PETAR===0&&d.Filtrada===0&&d.Suavizada===0)?<EmptyChart label="Sin registros de consumo de agua en los últimos 6 meses"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={promedioAguaPorMes} margin={{top:4,right:8,left:-10,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:11}} tickFormatter={(v)=>v.slice(5)}/>
                    <YAxis tick={{fontSize:11}} width={45}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:'11px'}}/>
                    <Bar dataKey="Vivero" fill="#22c55e" radius={[2,2,0,0]} />
                    <Bar dataKey="PETAR" fill="#1e3a8a" radius={[2,2,0,0]} />
                    <Bar dataKey="Filtrada" fill="#7dd3fc" radius={[2,2,0,0]} />
                    <Bar dataKey="Suavizada" fill="#38bdf8" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm flex items-center gap-2">
                Residuos por categoría
                <Badge variant="outline" className="text-[10px] py-0 h-4">{residuosPorCat.label}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {residuosPorCat.data.length===0?<EmptyChart label="Sin registros de residuos"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={residuosPorCat.data} dataKey="value" nameKey="name" outerRadius={80} innerRadius={30}
                      label={({name,percent})=>`${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                      {residuosPorCat.data.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Consumo de energía kWh por mes</CardTitle></CardHeader>
            <CardContent className="h-64">
              {energiaPorMes.every(d=>d.value===0)?<EmptyChart label="Sin registros de energía en 12 meses"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={energiaPorMes} margin={{top:4,right:16,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                    <XAxis dataKey="name" tick={{fontSize:11}} tickFormatter={(v)=>v.slice(5)}/>
                    <YAxis tick={{fontSize:11}} width={45}/>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Bar dataKey="value" name="kWh" fill="#3b82f6" radius={[2,2,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="font-display text-sm">Reportes por tipo (365d)</CardTitle></CardHeader>
            <CardContent className="h-64">
              {reportesPorTipo.length===0?<EmptyChart label="Sin reportes en los últimos 365 días"/>:(
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={reportesPorTipo} dataKey="value" nameKey="name" outerRadius={80} innerRadius={30}
                      label={({name,value})=>`${name}: ${value}`} labelLine={false}>
                      {reportesPorTipo.map((_,i)=><Cell key={i} fill={COLORS[(i+2)%COLORS.length]}/>)}
                    </Pie>
                    <Tooltip content={<CustomTooltip/>}/>
                    <Legend wrapperStyle={{fontSize:11}}/>
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
