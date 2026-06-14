import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/reportes")({
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          <FileText className="w-7 h-7" /> Reportes
        </h1>
        <p className="text-sm text-muted-foreground">Módulo pendiente — Fase 4.</p>
      </div>
      <Card><CardContent className="p-10 text-center text-muted-foreground">Próximamente</CardContent></Card>
    </div>
  ),
});
