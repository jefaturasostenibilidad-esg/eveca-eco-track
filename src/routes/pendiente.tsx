import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";

export const Route = createFileRoute("/pendiente")({
  ssr: false,
  component: PendingPage,
});

function PendingPage() {
  const { profile, signOut, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && profile?.estado === "activo") {
      navigate({ to: "/dashboard" });
    }
  }, [loading, profile, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-amber/10 px-4">
      <Card className="max-w-lg w-full shadow-xl">
        <CardContent className="p-10 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber/20 text-amber mb-6 animate-pulse">
            <Clock className="w-10 h-10" />
          </div>
          <h1 className="text-2xl font-display font-bold text-primary mb-3">
            Solicitud en revisión
          </h1>
          <p className="text-muted-foreground mb-6 leading-relaxed">
            Tu solicitud está en revisión. El administrador del sistema te notificará por correo
            cuando sea aprobada.
          </p>
          <Button variant="outline" onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}>
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
