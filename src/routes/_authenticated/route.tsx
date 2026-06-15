import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  LayoutDashboard,
  Droplets,
  Leaf,
  TreePine,
  FileText,
  Settings,
  LogOut,
  User,
  Menu,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";
import evecaLogo from "@/assets/eveca-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("estado")
      .eq("id", data.session.user.id)
      .maybeSingle();
    if (!profile || profile.estado === "pendiente") throw redirect({ to: "/pendiente" });
    if (profile.estado === "inactivo") {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }
  },
  component: AppShell,
});

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/efluentes", label: "Efluentes", icon: Droplets },
  { to: "/ambiental", label: "Gestión Ambiental", icon: Leaf },
  { to: "/zonas-verdes", label: "Zonas Verdes", icon: TreePine },
  { to: "/reportes", label: "Reportes", icon: FileText },
] as const;

function AppShell() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Mobile/tablet: off-canvas drawer (closed by default). Desktop: always visible.
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen flex bg-background">
      {/* Overlay (mobile/tablet only) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={closeMobile}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 z-40 h-screen w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-3 bg-white">
          <img
            src={evecaLogo.url}
            alt="Eveca · Extracción Sostenible"
            className="h-12 w-auto object-contain"
          />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-primary/80 font-semibold truncate">
              Sostenibilidad
            </div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={closeMobile}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {profile?.rol === "superadmin" && (
            <>
              <div className="border-t border-sidebar-border my-3" />
              <Link
                to="/admin"
                onClick={closeMobile}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-amber text-amber-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )}
              >
                <Settings className="w-5 h-5 shrink-0" />
                <span>Administración</span>
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          {profile && (
            <div className="px-3 py-2 min-w-0">
              <div className="text-xs font-medium truncate">{profile.nombre_completo}</div>
              <div className="text-[10px] text-sidebar-foreground/60 uppercase">{profile.rol}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 bg-card border-b border-border flex items-center justify-between gap-2 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 min-w-0">
            <NotificationsBell />
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm min-w-0">
              <User className="w-4 h-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{profile?.nombre_completo}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
