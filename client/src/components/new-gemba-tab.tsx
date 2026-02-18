import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { GembaWalk } from "@shared/schema";
import { format } from "date-fns";
import { MapPin, Calendar, Trash2 } from "lucide-react";

const AREAS = [
  "Produccion",
  "Almacen",
  "Calidad",
  "Mantenimiento",
  "Logistica",
  "Oficinas",
  "Seguridad",
  "Embarques",
];

export default function NewGembaTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [area, setArea] = useState("");

  const { data: walks = [], isLoading } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gemba-walks", {
        date,
        area,
        createdBy: userId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      setArea("");
      toast({ title: "Gemba creado", description: "Ahora agrega hallazgos." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/gemba-walks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      toast({ title: "Gemba eliminado" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Nuevo Gemba Walk</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">Fecha</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                data-testid="input-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area">Area</Label>
              <Select value={area} onValueChange={setArea}>
                <SelectTrigger data-testid="select-area">
                  <SelectValue placeholder="Seleccionar area" />
                </SelectTrigger>
                <SelectContent>
                  {AREAS.map((a) => (
                    <SelectItem key={a} value={a} data-testid={`option-area-${a}`}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!date || !area || createMutation.isPending}
            data-testid="button-create-gemba"
          >
            {createMutation.isPending ? "Creando..." : "Crear Gemba Walk"}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Recorridos recientes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
              </Card>
            ))}
          </div>
        ) : walks.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay recorridos aun. Crea tu primer Gemba Walk.</p>
          </Card>
        ) : (
          walks.map((walk) => (
            <Card key={walk.id} className="p-4 hover-elevate">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-walk-date-${walk.id}`}>{walk.date}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-walk-area-${walk.id}`}>{walk.area}</span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMutation.mutate(walk.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-walk-${walk.id}`}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
