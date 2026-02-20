import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LogIn, Smartphone, Plus } from "lucide-react";

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
  }
}
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function Landing() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installable, setInstallable] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true);

  const isIOS =
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent) &&
    !(window as unknown as { MSStream?: boolean }).MSStream;

  useEffect(() => {
    const handler = (e: BeforeInstallPromptEvent) => {
      e.preventDefault();
      setInstallPrompt(e);
      setInstallable(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setInstallPrompt(null);
      setInstallable(false);
      toast({ title: "App instalada", description: "Abre Gembops desde tu pantalla de inicio." });
    }
  };

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const isPending = loginMutation.isPending;

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b sticky top-0 z-50 bg-primary">
        <div className="max-w-5xl mx-auto flex items-center px-4 py-2">
          <span className="flex items-center justify-center shrink-0">
            <img
              src="/logo-g.png"
              alt="Gembops"
              className="object-contain w-11 h-11 sm:w-12 sm:h-12"
              width={48}
              height={48}
            />
          </span>
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
                  autoComplete="current-password"
                  data-testid="input-password"
                />
              </div>

              <Button type="submit" className="w-full text-base gap-2" disabled={isPending || !username || !password} data-testid="button-submit-auth">
                {isPending ? "Cargando..." : (
                  <><LogIn className="h-4 w-4" /> Entrar</>
                )}
              </Button>
            </form>
            <p className="text-xs text-center text-muted-foreground mt-4">
              ¿Necesitas una cuenta? Contacta a un administrador.
            </p>
          </Card>

          {!isStandalone && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Smartphone className="h-4 w-4 text-primary" />
                Lleva Gembops en tu celular
              </div>
              {installable && installPrompt ? (
                <Button type="button" variant="outline" className="w-full gap-2" onClick={handleInstall}>
                  <Plus className="h-4 w-4" />
                  Instalar app
                </Button>
              ) : isIOS ? (
                <div className="text-xs text-muted-foreground space-y-2">
                  <p>En iPhone/iPad: abre esta página en <strong>Safari</strong>, toca Compartir y luego &quot;Añadir a la pantalla de inicio&quot;.</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Usa Chrome en Android y toca el menú (⋮) → &quot;Instalar app&quot; o &quot;Añadir a la pantalla de inicio&quot;.
                </p>
              )}
            </Card>
          )}
        </div>
      </main>

      <footer className="border-t py-3 text-center text-xs text-muted-foreground px-4">
        Gembops &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
