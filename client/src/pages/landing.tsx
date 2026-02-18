import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardCheck, Search, BarChart3 } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Gemba Walk</span>
          </div>
          <Button asChild data-testid="button-login-header">
            <a href="/api/login">Iniciar Sesion</a>
          </Button>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="max-w-2xl text-center py-16 space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight">
            Recorridos Gemba<br />
            <span className="text-primary">simples y efectivos</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Registra hallazgos, asigna responsables y da seguimiento sin complicaciones. Todo en menos de 2 minutos.
          </p>
          <Button size="lg" asChild data-testid="button-login-hero">
            <a href="/api/login">Comenzar ahora</a>
          </Button>
        </div>

        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-3 gap-4 pb-16">
          <Card className="p-6 space-y-3">
            <ClipboardCheck className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Captura rapida</h3>
            <p className="text-sm text-muted-foreground">
              Registra hallazgos con dropdowns y minimos campos. Sin texto libre innecesario.
            </p>
          </Card>
          <Card className="p-6 space-y-3">
            <Search className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Seguimiento claro</h3>
            <p className="text-sm text-muted-foreground">
              Vista tipo to-do list por responsable. Pendientes y vencidos al instante.
            </p>
          </Card>
          <Card className="p-6 space-y-3">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h3 className="font-semibold">Reportes simples</h3>
            <p className="text-sm text-muted-foreground">
              Genera PDF o Excel por Gemba o por mes con un solo clic.
            </p>
          </Card>
        </div>
      </main>

      <footer className="border-t py-4 text-center text-sm text-muted-foreground">
        Gemba Walk App &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}
