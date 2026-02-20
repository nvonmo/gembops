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
import { Plus, Trash2, Edit2, Save, X, User, Shield } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface User {
  id: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export default function AdminUsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreating, setIsCreating] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    role: "user",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<Partial<User>>({});

  const { data: usersList = [], isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const createMutation = useMutation({
    mutationFn: async (userData: typeof newUser) => {
      const res = await apiRequest("POST", "/api/users", userData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setIsCreating(false);
      setNewUser({
        username: "",
        password: "",
        firstName: "",
        lastName: "",
        email: "",
        role: "user",
      });
      toast({ title: "Usuario creado", description: "El usuario ha sido creado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al crear usuario", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<User & { password?: string }> }) => {
      const res = await apiRequest("PATCH", `/api/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setEditingId(null);
      setEditingUser({});
      toast({ title: "Usuario actualizado", description: "El usuario ha sido actualizado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al actualizar usuario", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Usuario eliminado", description: "El usuario ha sido eliminado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al eliminar usuario", variant: "destructive" });
    },
  });

  const handleCreate = () => {
    if (!newUser.username.trim() || !newUser.password.trim()) {
      toast({ title: "Error", description: "Usuario y contraseña son requeridos", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      ...newUser,
      username: newUser.username.trim(),
      firstName: newUser.firstName.trim() || undefined,
      lastName: newUser.lastName.trim() || undefined,
      email: newUser.email.trim() || undefined,
    });
  };

  const handleStartEdit = (user: User) => {
    setEditingId(user.id);
    setEditingUser({
      username: user.username,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      role: user.role,
    });
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    const updateData: any = {
      username: editingUser.username,
      firstName: editingUser.firstName || null,
      lastName: editingUser.lastName || null,
      email: editingUser.email || null,
      role: editingUser.role,
    };
    updateMutation.mutate({ id: editingId, data: updateData });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingUser({});
  };

  const handlePasswordReset = (userId: string) => {
    const newPassword = prompt("Ingresa la nueva contraseña (mínimo 4 caracteres):");
    if (!newPassword || newPassword.length < 4) {
      toast({ title: "Error", description: "La contraseña debe tener al menos 4 caracteres", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ id: userId, data: { password: newPassword } });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base sm:text-lg">Gestionar Usuarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isCreating ? (
            <Button onClick={() => setIsCreating(true)} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Crear Nuevo Usuario
            </Button>
          ) : (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">Nuevo Usuario</h3>
                <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Usuario *</Label>
                  <Input
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    placeholder="nombre_usuario"
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contraseña *</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Mínimo 4 caracteres"
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    value={newUser.firstName}
                    onChange={(e) => setNewUser({ ...newUser, firstName: e.target.value })}
                    placeholder="Nombre"
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Apellido</Label>
                  <Input
                    value={newUser.lastName}
                    onChange={(e) => setNewUser({ ...newUser, lastName: e.target.value })}
                    placeholder="Apellido"
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="email@ejemplo.com"
                    className="text-base"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                    <SelectTrigger className="text-base">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">Usuario</SelectItem>
                      <SelectItem value="admin">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createMutation.isPending} className="flex-1">
                  {createMutation.isPending ? "Creando..." : "Crear Usuario"}
                </Button>
                <Button variant="outline" onClick={() => setIsCreating(false)} disabled={createMutation.isPending}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground">Usuarios existentes</h3>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3" />
              </Card>
            ))}
          </div>
        ) : usersList.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay usuarios creados. Crea tu primer usuario.</p>
          </Card>
        ) : (
          usersList.map((user) => (
            <Card key={user.id} className="p-3 sm:p-4">
              {editingId === user.id ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Usuario</Label>
                      <Input
                        value={editingUser.username || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, username: e.target.value })}
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Rol</Label>
                      <Select
                        value={editingUser.role || "user"}
                        onValueChange={(value) => setEditingUser({ ...editingUser, role: value })}
                      >
                        <SelectTrigger className="text-base">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">Usuario</SelectItem>
                          <SelectItem value="admin">Administrador</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Nombre</Label>
                      <Input
                        value={editingUser.firstName || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, firstName: e.target.value })}
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Apellido</Label>
                      <Input
                        value={editingUser.lastName || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, lastName: e.target.value })}
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        value={editingUser.email || ""}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        className="text-base"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} className="flex-1">
                      <Save className="h-4 w-4 mr-2" />
                      Guardar
                    </Button>
                    <Button variant="outline" onClick={handleCancelEdit} disabled={updateMutation.isPending}>
                      <X className="h-4 w-4 mr-2" />
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      {user.role === "admin" ? (
                        <Shield className="h-4 w-4 text-primary shrink-0" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-medium">{user.username}</span>
                          <Badge variant={user.role === "admin" ? "default" : "secondary"} className="text-xs">
                            {user.role === "admin" ? "Admin" : "Usuario"}
                          </Badge>
                        </div>
                        {(user.firstName || user.lastName) && (
                          <p className="text-sm text-muted-foreground truncate">
                            {[user.firstName, user.lastName].filter(Boolean).join(" ")}
                          </p>
                        )}
                        {user.email && (
                          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleStartEdit(user)}
                      disabled={deleteMutation.isPending}
                      title="Editar usuario"
                    >
                      <Edit2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePasswordReset(user.id)}
                      disabled={updateMutation.isPending}
                      title="Restablecer contraseña"
                    >
                      <Save className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" disabled={deleteMutation.isPending} title="Eliminar usuario">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Eliminar Usuario</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <p className="text-sm text-muted-foreground">
                            ¿Estas seguro de que deseas eliminar el usuario &quot;{user.username}&quot;?
                            Esta accion no se puede deshacer.
                          </p>
                          <div className="flex justify-end gap-2">
                            <DialogClose asChild>
                              <Button variant="outline">Cancelar</Button>
                            </DialogClose>
                            <Button
                              variant="destructive"
                              onClick={() => deleteMutation.mutate(user.id)}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
                            </Button>
                          </div>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
