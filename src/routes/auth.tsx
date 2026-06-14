import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase, ADMIN_EMAIL } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Leaf, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [signupData, setSignupData] = useState({
    nombre_completo: "",
    cargo: "",
    email: "",
    password: "",
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginData.email.trim(),
      password: loginData.password,
    });
    setLoading(false);
    if (error) return toast.error(error.message);

    // verificar estado
    const { data: profile } = await supabase
      .from("profiles")
      .select("estado, rol")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile) {
      toast.error("No se encontró tu perfil. Contacta al administrador.");
      await supabase.auth.signOut();
      return;
    }
    if (profile.estado === "pendiente") {
      navigate({ to: "/pendiente" });
      return;
    }
    if (profile.estado === "inactivo") {
      toast.error("Tu cuenta está inactiva. Contacta al administrador.");
      await supabase.auth.signOut();
      return;
    }
    toast.success("Bienvenido a SostenibilidadPro");
    navigate({ to: "/dashboard" });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupData.password.length < 6) {
      return toast.error("La contraseña debe tener al menos 6 caracteres");
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupData.email.trim(),
      password: signupData.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          nombre_completo: signupData.nombre_completo,
          cargo: signupData.cargo,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Solicitud enviada. El administrador revisará tu acceso.");
    navigate({ to: "/pendiente" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-amber/10 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-4 shadow-lg">
            <Leaf className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary">SostenibilidadPro</h1>
          <p className="text-sm text-muted-foreground mt-1">EVECA · Jefatura de Sostenibilidad</p>
        </div>

        <Card className="shadow-xl border-border/60">
          <CardHeader>
            <CardTitle className="font-display">Acceso al sistema</CardTitle>
            <CardDescription>Inicia sesión o solicita acceso</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 mb-4 w-full">
                <TabsTrigger value="login">Iniciar sesión</TabsTrigger>
                <TabsTrigger value="signup">Solicitar acceso</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <Label htmlFor="login-email">Correo</Label>
                    <Input id="login-email" type="email" required value={loginData.email}
                      onChange={(e) => setLoginData({ ...loginData, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="login-pass">Contraseña</Label>
                    <Input id="login-pass" type="password" required value={loginData.password}
                      onChange={(e) => setLoginData({ ...loginData, password: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Ingresar
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div>
                    <Label htmlFor="su-nombre">Nombre completo</Label>
                    <Input id="su-nombre" required value={signupData.nombre_completo}
                      onChange={(e) => setSignupData({ ...signupData, nombre_completo: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="su-cargo">Cargo</Label>
                    <Input id="su-cargo" value={signupData.cargo}
                      onChange={(e) => setSignupData({ ...signupData, cargo: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="su-email">Correo</Label>
                    <Input id="su-email" type="email" required value={signupData.email}
                      onChange={(e) => setSignupData({ ...signupData, email: e.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="su-pass">Contraseña</Label>
                    <Input id="su-pass" type="password" required minLength={6} value={signupData.password}
                      onChange={(e) => setSignupData({ ...signupData, password: e.target.value })} />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Solicitar acceso
                  </Button>
                  <p className="text-xs text-muted-foreground text-center">
                    El administrador ({ADMIN_EMAIL}) revisará tu solicitud.
                  </p>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          <Link to="/" className="hover:underline">Extractora Verde del Casanare S.A.S.</Link>
        </p>
      </div>
    </div>
  );
}
