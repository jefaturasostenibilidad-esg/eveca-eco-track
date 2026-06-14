import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { TreePine } from "lucide-react";

export const Route = createFileRoute("/_authenticated/zonas-verdes")({
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          <TreePine className="w-7 h-7" /> Zonas Verdes
        </h1>
        <p className="text-sm text-muted-foreground">Módulo pendiente — Fase 3.</p>
      </div>
      <Card><CardContent className="p-10 text-center text-muted-foreground">Próximamente</CardContent></Card>
    </div>
  ),
});
