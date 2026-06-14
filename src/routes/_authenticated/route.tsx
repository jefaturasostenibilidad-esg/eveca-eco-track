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
  Bell,
  User,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { cn } from "@/lib/utils";

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
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 z-30 h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-200 border-r border-sidebar-border",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="px-4 py-5 border-b border-sidebar-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber/90 text-amber-foreground flex items-center justify-center shrink-0">
            <Leaf className="w-5 h-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-tight truncate">
                SostenibilidadPro
              </div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 truncate">
                EVECA · Jefatura
              </div>
            </div>
          )}
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          {profile?.rol === "superadmin" && (
            <>
              <div className={cn("border-t border-sidebar-border my-3", collapsed && "mx-2")} />
              <Link
                to="/admin"
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  pathname.startsWith("/admin")
                    ? "bg-amber text-amber-foreground shadow-sm"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50",
                )}
              >
                <Settings className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Administración</span>}
              </Link>
            </>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-1">
          {!collapsed && profile && (
            <div className="px-3 py-2">
              <div className="text-xs font-medium truncate">{profile.nombre_completo}</div>
              <div className="text-[10px] text-sidebar-foreground/60 uppercase">{profile.rol}</div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-14 bg-card border-b border-border flex items-center justify-between px-4 lg:px-6">
          <Button variant="ghost" size="icon" onClick={() => setCollapsed(!collapsed)}>
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5" />
            </Button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
              <User className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium">{profile?.nombre_completo}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
