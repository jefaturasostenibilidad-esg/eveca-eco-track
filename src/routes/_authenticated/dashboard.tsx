import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Droplets, Leaf, TreePine, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Tablero de mando unificado · SostenibilidadPro EVECA</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Droplets, label: "POME procesado (m³)", val: "—", color: "text-primary-light bg-primary/10" },
          { icon: Leaf, label: "Residuos gestionados (kg)", val: "—", color: "text-success bg-success/10" },
          { icon: TreePine, label: "Área zonas verdes (m²)", val: "—", color: "text-amber bg-amber/10" },
          { icon: FileText, label: "Reportes del mes", val: "—", color: "text-primary bg-secondary" },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${kpi.color}`}>
                <kpi.icon className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-display">{kpi.label}</div>
                <div className="text-2xl font-bold font-display">{kpi.val}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display">En construcción</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Esta es la Fase 1. Los KPIs y gráficas se conectarán a datos reales en la fase del Dashboard
          completo. Por ahora puedes empezar a registrar datos en el módulo de <strong>Efluentes</strong>.
        </CardContent>
      </Card>
    </div>
  );
}
