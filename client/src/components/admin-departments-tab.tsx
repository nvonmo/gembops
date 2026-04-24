import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Department } from "@shared/schema";
import { Plus, Trash2, Edit2, Save, X, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export default function AdminDepartmentsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newDeptName, setNewDeptName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  const { data: departmentsList = [], isLoading } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/departments", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setNewDeptName("");
      toast({ title: "Departamento creado", description: "El departamento ha sido creado exitosamente." });
    },
    onError: (error: Error) => {
      console.error("Error creating department:", error);
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      let errorMessage = error.message || "Error al crear departamento";
      if (error.message.includes("403")) {
        errorMessage = "No tienes permisos de administrador para crear departamentos";
      } else if (error.message.includes("400")) {
        errorMessage = error.message.replace(/^\d+:\s*/, "") || "El nombre del departamento es inválido o ya existe";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const res = await apiRequest("PATCH", `/api/departments/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      setEditingId(null);
      setEditingName("");
      toast({ title: "Departamento actualizado", description: "El departamento ha sido actualizado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al actualizar departamento", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/departments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "Departamento eliminado", description: "El departamento ha sido desactivado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al eliminar departamento", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/departments/${id}`, { isActive: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departments"] });
      toast({ title: "Departamento reactivado", description: "El departamento ha sido reactivado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al reactivar departamento", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newDeptName.trim()) {
      toast({ title: "Error", description: "El nombre del departamento es requerido", variant: "destructive" });
      return;
    }
    createMutation.mutate(newDeptName.trim());
  };

  const handleStartEdit = (dept: Department) => {
    setEditingId(dept.id);
    setEditingName(dept.name);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) {
      toast({ title: "Error", description: "El nombre del departamento es requerido", variant: "destructive" });
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
          <CardTitle className="text-base sm:text-lg">Gestionar Departamentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del departamento"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreate();
                }
              }}
              className="text-base"
            />
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="shrink-0"
              title={!newDeptName.trim() ? "Escribe un nombre para el departamento" : undefined}
            >
              <Plus className="h-4 w-4 mr-2" />
              Crear
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Departamentos existentes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
              </Card>
            ))}
          </div>
        ) : departmentsList.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay departamentos creados. Crea tu primer departamento.</p>
          </Card>
        ) : (
          departmentsList.map((dept) => (
            <Card key={dept.id} className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                {editingId === dept.id ? (
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
                      <span className="text-base">{dept.name}</span>
                      {!dept.isActive && (
                        <Badge variant="secondary" className="text-xs">
                          Inactivo
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!dept.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => reactivateMutation.mutate(dept.id)}
                          disabled={reactivateMutation.isPending}
                          title="Reactivar departamento"
                        >
                          <RotateCcw className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(dept)}
                        disabled={deleteMutation.isPending || reactivateMutation.isPending}
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {dept.isActive && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={deleteMutation.isPending}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Eliminar Departamento</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3">
                              <p>¿Estás seguro de que quieres desactivar este departamento?</p>
                              <p className="text-xs text-muted-foreground">
                                No se eliminarán los usuarios ni los hallazgos asociados, pero ya no se podrá asignar este
                                departamento hasta reactivarlo.
                              </p>
                              <div className="flex justify-end gap-2 pt-2">
                                <DialogClose asChild>
                                  <Button variant="outline">Cancelar</Button>
                                </DialogClose>
                                <DialogClose asChild>
                                  <Button
                                    variant="destructive"
                                    onClick={() => deleteMutation.mutate(dept.id)}
                                    disabled={deleteMutation.isPending}
                                  >
                                    Eliminar
                                  </Button>
                                </DialogClose>
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

