import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Leaf } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ambiental")({
  component: () => (
    <Placeholder icon={<Leaf className="w-7 h-7" />} title="Gestión Ambiental" />
  ),
});

function Placeholder({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          {icon} {title}
        </h1>
        <p className="text-sm text-muted-foreground">Módulo pendiente — se construirá en la Fase 2.</p>
      </div>
      <Card><CardContent className="p-10 text-center text-muted-foreground">Próximamente</CardContent></Card>
    </div>
  );
}
