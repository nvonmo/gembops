import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ClipboardCheck, Search, BarChart3, LogIn, UserPlus } from "lucide-react";

export default function Landing() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const loginMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message.includes("401") ? "Usuario o contraseña incorrectos" : error.message, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/register", { username, password, firstName: firstName || undefined });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({ title: "Cuenta creada", description: "Bienvenido a Gemba Walk" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message.includes("400") ? "Ese usuario ya existe" : error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate();
    } else {
      registerMutation.mutate();
    }
  };

  const isPending = loginMutation.isPending || registerMutation.isPending;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center gap-2 px-4 py-3">
          <ClipboardCheck className="h-6 w-6 text-primary" />
          <span className="font-semibold text-lg">Gemba Walk</span>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-6">
        <div className="max-w-sm w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Recorridos Gemba<br />
              <span className="text-primary">simples y efectivos</span>
            </h1>
            <p className="text-muted-foreground text-sm">
              Registra hallazgos, asigna responsables y da seguimiento.
            </p>
          </div>

          <Card className="p-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex gap-1 p-1 bg-muted rounded-md">
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("login")}
                  data-testid="tab-login"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
                  onClick={() => setMode("register")}
                  data-testid="tab-register"
                >
                  Registrarse
                </button>
              </div>

              {mode === "register" && (
                <div className="space-y-2">
                  <Label>Nombre (opcional)</Label>
                  <Input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Tu nombre"
                    className="text-base"
                    data-testid="input-first-name"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Usuario</Label>
                <Input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Tu usuario"
                  className="text-base"
                  required
                  minLength={3}
                  autoComplete="username"
                  data-testid="input-username"
                />
              </div>

              <div className="space-y-2">
                <Label>Contraseña</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tu contraseña"
                  className="text-base"
                  required
                  minLength={4}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  data-testid="input-password"
                />
              </div>

              <Button type="submit" className="w-full text-base gap-2" disabled={isPending || !username || !password} data-testid="button-submit-auth">
                {isPending ? "Cargando..." : mode === "login" ? (
                  <><LogIn className="h-4 w-4" /> Entrar</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> Crear cuenta</>
                )}
              </Button>
            </form>
          </Card>

          <div className="grid grid-cols-1 gap-3 pt-2">
            <Card className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
                <h3 className="font-medium text-sm">Captura rapida</h3>
              </div>
              <p className="text-xs text-muted-foreground">Dropdowns y minimos campos</p>
            </Card>
            <Card className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5 text-primary shrink-0" />
                <h3 className="font-medium text-sm">Seguimiento claro</h3>
              </div>
              <p className="text-xs text-muted-foreground">Pendientes y vencidos al instante</p>
            </Card>
            <Card className="p-4 space-y-1">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary shrink-0" />
                <h3 className="font-medium text-sm">Reportes simples</h3>
              </div>
              <p className="text-xs text-muted-foreground">PDF o Excel con un solo clic</p>
            </Card>
          </div>
        </div>
      </main>

      <footer className="border-t py-3 text-center text-xs text-muted-foreground px-4">
        Gemba Walk App &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
