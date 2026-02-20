import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Area } from "@shared/schema";
import { Plus, Trash2, Edit2, Save, X, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export default function AdminAreasTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newAreaName, setNewAreaName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: areasList = [], isLoading } = useQuery<Area[]>({
    queryKey: ["/api/areas"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/areas", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      setNewAreaName("");
      toast({ title: "Area creada", description: "El area ha sido creada exitosamente." });
    },
    onError: (error: Error) => {
      console.error("Error creating area:", error);
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      // Parse error message to show more details
      let errorMessage = error.message || "Error al crear area";
      if (error.message.includes("403")) {
        errorMessage = "No tienes permisos de administrador para crear áreas";
      } else if (error.message.includes("400")) {
        errorMessage = error.message.replace(/^\d+:\s*/, "") || "El nombre del área es inválido o ya existe";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/areas/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      setEditingId(null);
      setEditingName("");
      toast({ title: "Area actualizada", description: "El area ha sido actualizada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al actualizar area", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/areas/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      toast({ title: "Area eliminada", description: "El area ha sido desactivada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al eliminar area", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/areas/${id}`, { isActive: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/areas"] });
      toast({ title: "Area reactivada", description: "El area ha sido reactivada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al reactivar area", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newAreaName.trim()) {
      toast({ title: "Error", description: "El nombre del area es requerido", variant: "destructive" });
      return;
    }
    createMutation.mutate(newAreaName.trim());
  };

  const handleStartEdit = (area: Area) => {
    setEditingId(area.id);
    setEditingName(area.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) {
      toast({ title: "Error", description: "El nombre del area es requerido", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: editingId, name: editingName.trim() });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Gestionar Areas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del area"
              value={newAreaName}
              onChange={(e) => setNewAreaName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                }
              }}
              className="text-base"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !newAreaName.trim()}
              className="shrink-0"
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Areas existentes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
              </Card>
            ))}
          </div>
        ) : areasList.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay areas creadas. Crea tu primera area.</p>
          </Card>
        ) : (
          areasList.map((area) => (
            <Card key={area.id} className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                {editingId === area.id ? (
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          handleSaveEdit();
                        } else if (e.key === "Escape") {
                          handleCancelEdit();
                        }
                      }}
                      className="text-base flex-1"
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleSaveEdit}
                      disabled={updateMutation.isPending}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleCancelEdit}
                      disabled={updateMutation.isPending}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-base">{area.name}</span>
                      {!area.isActive && (
                        <Badge variant="secondary" className="text-xs">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!area.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => reactivateMutation.mutate(area.id)}
                          disabled={reactivateMutation.isPending}
                          title="Reactivar area"
                        >
                          <RotateCcw className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(area)}
                        disabled={deleteMutation.isPending || reactivateMutation.isPending}
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {area.isActive && (
                        <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Eliminar Area</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <p className="text-sm text-muted-foreground">
                              ¿Estas seguro de que deseas eliminar el area &quot;{area.name}&quot;?
                              Esta accion desactivara el area y no se podra usar en nuevos Gemba Walks.
                            </p>
                            <div className="flex justify-end gap-2">
                              <DialogClose asChild>
                                <Button variant="outline">
                                  Cancelar
                                </Button>
                              </DialogClose>
                              <Button
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(area.id)}
                                disabled={deleteMutation.isPending}
                              >
                                {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                      )}
                    </div>
                  </>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
