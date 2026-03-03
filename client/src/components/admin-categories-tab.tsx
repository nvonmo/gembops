import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Category } from "@shared/schema";
import { Plus, Trash2, Edit2, Save, X, RotateCcw } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";

export default function AdminCategoriesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIncludes, setNewCategoryIncludes] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIncludes, setEditingIncludes] = useState("");

  const { data: categoriesList = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories/all"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; includesDescription?: string }) => {
      const res = await apiRequest("POST", "/api/categories", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/all"] });
      setNewCategoryName("");
      setNewCategoryIncludes("");
      toast({ title: "Categoria creada", description: "La categoria ha sido creada exitosamente." });
    },
    onError: (error: Error) => {
      console.error("Error creating category:", error);
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      // Parse error message to show more details
      let errorMessage = error.message || "Error al crear categoria";
      if (error.message.includes("403")) {
        errorMessage = "No tienes permisos de administrador para crear categorías";
      } else if (error.message.includes("400")) {
        errorMessage = error.message.replace(/^\d+:\s*/, "") || "El nombre de la categoría es inválido o ya existe";
      }
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, name, includesDescription }: { id: number; name: string; includesDescription?: string }) => {
      const res = await apiRequest("PATCH", `/api/categories/${id}`, { name, includesDescription });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/all"] });
      setEditingId(null);
      setEditingName("");
      setEditingIncludes("");
      toast({ title: "Categoria actualizada", description: "La categoria ha sido actualizada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al actualizar categoria", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/all"] });
      toast({ title: "Categoria eliminada", description: "La categoria ha sido desactivada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al eliminar categoria", variant: "destructive" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/categories/${id}`, { isActive: true });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories/all"] });
      toast({ title: "Categoria reactivada", description: "La categoria ha sido reactivada exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al reactivar categoria", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Error", description: "El nombre de la categoria es requerido", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      name: newCategoryName.trim(),
      includesDescription: newCategoryIncludes.trim() || undefined,
    });
  };

  const handleStartEdit = (category: Category) => {
    setEditingId(category.id);
    setEditingName(category.name);
    setEditingIncludes((category as Category & { includesDescription?: string | null }).includesDescription ?? "");
  };

  const handleSaveEdit = () => {
    if (!editingId || !editingName.trim()) {
      toast({ title: "Error", description: "El nombre de la categoria es requerido", variant: "destructive" });
      return;
    }
    updateMutation.mutate({
      id: editingId,
      name: editingName.trim(),
      includesDescription: editingIncludes.trim() || undefined,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingIncludes("");
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Gestionar Categorías</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nombre de la categoría</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Nombre de la categoria"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreate();
                  }
                }}
                className="text-base flex-1"
              />
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="shrink-0"
                title={!newCategoryName.trim() ? "Escribe un nombre para la categoría" : undefined}
              >
                <Plus className="h-4 w-4 mr-2" />
                Crear
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Qué incluye esta categoría (opcional)</Label>
            <Textarea
              placeholder="Incluir un texto donde se especifique qué incluye la categoría"
              value={newCategoryIncludes}
              onChange={(e) => setNewCategoryIncludes(e.target.value)}
              rows={2}
              className="text-base resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Categorías existentes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
              </Card>
            ))}
          </div>
        ) : categoriesList.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay categorías creadas. Crea tu primera categoría.</p>
          </Card>
        ) : (
          categoriesList.map((category) => (
            <Card key={category.id} className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-3">
                {editingId === category.id ? (
                  <div className="flex flex-col gap-3 flex-1 min-w-0">
                    <div className="flex gap-2">
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
                        placeholder="Nombre"
                        autoFocus
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSaveEdit}
                        disabled={updateMutation.isPending}
                        title="Guardar"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCancelEdit}
                        disabled={updateMutation.isPending}
                        title="Cancelar"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Qué incluye esta categoría (opcional)</Label>
                      <Textarea
                        value={editingIncludes}
                        onChange={(e) => setEditingIncludes(e.target.value)}
                        placeholder="Texto que especifica qué incluye la categoría"
                        rows={2}
                        className="text-base resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                      <span className="text-base">{category.name}</span>
                      {(category as Category & { includesDescription?: string | null }).includesDescription && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {(category as Category & { includesDescription?: string | null }).includesDescription}
                        </p>
                      )}
                      {!category.isActive && (
                        <Badge variant="secondary" className="text-xs w-fit mt-1">
                          Inactiva
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!category.isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => reactivateMutation.mutate(category.id)}
                          disabled={reactivateMutation.isPending}
                          title="Reactivar categoria"
                        >
                          <RotateCcw className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStartEdit(category)}
                        disabled={deleteMutation.isPending || reactivateMutation.isPending}
                      >
                        <Edit2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      {category.isActive && (
                        <Dialog>
                        <DialogTrigger asChild>
                          <Button variant="ghost" size="icon" disabled={deleteMutation.isPending}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Eliminar Categoría</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-2">
                            <p className="text-sm text-muted-foreground">
                              ¿Estas seguro de que deseas eliminar la categoría &quot;{category.name}&quot;?
                              Esta accion desactivara la categoría y no se podra usar en nuevos hallazgos.
                            </p>
                            <div className="flex justify-end gap-2">
                              <DialogClose asChild>
                                <Button variant="outline">
                                  Cancelar
                                </Button>
                              </DialogClose>
                              <Button
                                variant="destructive"
                                onClick={() => deleteMutation.mutate(category.id)}
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
