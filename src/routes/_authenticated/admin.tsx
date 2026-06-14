import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: prof } = await supabase.from("profiles").select("rol").eq("id", data.session.user.id).maybeSingle();
    if (prof?.rol !== "superadmin") throw redirect({ to: "/dashboard" });
  },
  component: () => (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-primary flex items-center gap-2">
          <Settings className="w-7 h-7" /> Administración
        </h1>
        <p className="text-sm text-muted-foreground">Gestión de usuarios, audit log y emails — Fase 6.</p>
      </div>
      <Card><CardContent className="p-10 text-center text-muted-foreground">Próximamente</CardContent></Card>
    </div>
  ),
});
