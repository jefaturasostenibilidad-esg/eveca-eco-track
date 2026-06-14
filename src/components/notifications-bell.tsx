import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Bell, Check } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Notif {
  id: string;
  tipo: string;
  titulo: string;
  mensaje: string;
  leida: boolean;
  created_at: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notificaciones")
      .select("id,tipo,titulo,mensaje,leida,created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as Notif[]);
  };

  useEffect(() => {
    if (!user) return;
    load();
    const ch = supabase.channel("rt-notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "notificaciones" }, (payload) => {
        load();
        if (payload.eventType === "INSERT") {
          const n = payload.new as Notif;
          toast(n.titulo, { description: n.mensaje });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const unread = items.filter((n) => !n.leida).length;

  const markAll = async () => {
    const ids = items.filter((n) => !n.leida).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notificaciones").update({ leida: true }).in("id", ids);
    load();
  };

  const markOne = async (id: string) => {
    await supabase.from("notificaciones").update({ leida: true }).eq("id", id);
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {unread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber text-amber-foreground text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="font-display font-semibold text-sm">Notificaciones</div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAll}>
              <Check className="w-3 h-3 mr-1" /> Marcar todas
            </Button>
          )}
        </div>
        <ScrollArea className="max-h-96">
          {items.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">Sin notificaciones</div>
          ) : (
            <div className="divide-y">
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markOne(n.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${!n.leida ? "bg-primary/5" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium text-sm">{n.titulo}</div>
                    {!n.leida && <Badge className="bg-primary text-primary-foreground border-0 text-[9px] shrink-0">nuevo</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{n.mensaje}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString("es-CO")}</div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
