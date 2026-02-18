import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import type { Finding, GembaWalk } from "@shared/schema";
import { Plus, User, CalendarDays, Tag, Image } from "lucide-react";

const CATEGORIES = [
  "Seguridad",
  "Calidad",
  "Productividad",
  "Orden y Limpieza",
  "Mantenimiento",
  "Ergonomia",
  "Medio Ambiente",
  "Otro",
];

const RESPONSIBLES = [
  "Juan Perez",
  "Maria Garcia",
  "Carlos Lopez",
  "Ana Martinez",
  "Roberto Sanchez",
  "Laura Hernandez",
  "Miguel Torres",
  "Patricia Ramirez",
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  open: { label: "Abierto", variant: "destructive" },
  in_progress: { label: "En progreso", variant: "default" },
  closed: { label: "Cerrado", variant: "secondary" },
};

export default function FindingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWalk, setSelectedWalk] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [responsible, setResponsible] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const { data: walks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const { data: findings = [], isLoading } = useQuery<Finding[]>({
    queryKey: ["/api/findings"],
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("gembaWalkId", selectedWalk);
      formData.append("category", category);
      formData.append("description", description);
      formData.append("responsible", responsible);
      formData.append("dueDate", dueDate);
      formData.append("status", "open");
      if (photoFile) {
        formData.append("photo", photoFile);
      }
      const res = await fetch("/api/findings", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      resetForm();
      setDialogOpen(false);
      toast({ title: "Hallazgo registrado" });
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

  function resetForm() {
    setSelectedWalk("");
    setCategory("");
    setDescription("");
    setResponsible("");
    setDueDate("");
    setPhotoFile(null);
  }

  const walkMap = new Map(walks.map((w) => [w.id, w]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">Hallazgos</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-finding" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Agregar
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nuevo Hallazgo</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Gemba Walk</Label>
                <Select value={selectedWalk} onValueChange={setSelectedWalk}>
                  <SelectTrigger data-testid="select-walk">
                    <SelectValue placeholder="Seleccionar recorrido" />
                  </SelectTrigger>
                  <SelectContent>
                    {walks.map((w) => (
                      <SelectItem key={w.id} value={String(w.id)}>
                        {w.date} - {w.area}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Seleccionar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Descripcion</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe brevemente el hallazgo"
                  rows={2}
                  maxLength={200}
                  data-testid="input-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Responsable</Label>
                <Select value={responsible} onValueChange={setResponsible}>
                  <SelectTrigger data-testid="select-responsible">
                    <SelectValue placeholder="Seleccionar responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    {RESPONSIBLES.map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha compromiso</Label>
                <Input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  data-testid="input-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Foto (opcional)</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                  data-testid="input-photo"
                />
              </div>
              <Button
                className="w-full"
                disabled={!selectedWalk || !category || !description || !responsible || !dueDate || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                data-testid="button-save-finding"
              >
                {createMutation.isPending ? "Guardando..." : "Guardar Hallazgo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 animate-pulse">
              <div className="h-4 bg-muted rounded w-2/3" />
            </Card>
          ))}
        </div>
      ) : findings.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p>No hay hallazgos registrados. Agrega el primero.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {findings.map((f) => {
            const walk = walkMap.get(f.gembaWalkId);
            const statusInfo = STATUS_MAP[f.status] || STATUS_MAP.open;
            const isOverdue = f.status !== "closed" && new Date(f.dueDate) < new Date();
            return (
              <FindingCard
                key={f.id}
                finding={f}
                walkArea={walk?.area}
                statusInfo={statusInfo}
                isOverdue={isOverdue}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  walkArea,
  statusInfo,
  isOverdue,
}: {
  finding: Finding;
  walkArea?: string;
  statusInfo: { label: string; variant: "default" | "secondary" | "destructive" };
  isOverdue: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeComment, setCloseComment] = useState("");
  const [newStatus, setNewStatus] = useState(finding.status);

  const updateMutation = useMutation({
    mutationFn: async (data: { status: string; closeComment?: string }) => {
      const res = await apiRequest("PATCH", `/api/findings/${finding.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      setCloseOpen(false);
      toast({ title: "Hallazgo actualizado" });
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
    <Card className="p-4 space-y-3" data-testid={`card-finding-${finding.id}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-1 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={statusInfo.variant} className="text-xs">
              {statusInfo.label}
            </Badge>
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                Vencido
              </Badge>
            )}
            <Badge variant="secondary" className="text-xs">
              <Tag className="h-3 w-3 mr-1" />
              {finding.category}
            </Badge>
          </div>
          <p className="text-sm mt-2" data-testid={`text-finding-desc-${finding.id}`}>
            {finding.description}
          </p>
        </div>
        {finding.photoUrl && (
          <img
            src={finding.photoUrl}
            alt="Hallazgo"
            className="w-16 h-16 object-cover rounded-md border"
            data-testid={`img-finding-${finding.id}`}
          />
        )}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1">
          <User className="h-3 w-3" />
          {finding.responsible}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" />
          {finding.dueDate}
        </span>
        {walkArea && (
          <span className="flex items-center gap-1">
            <Image className="h-3 w-3" />
            {walkArea}
          </span>
        )}
      </div>
      {finding.closeComment && (
        <p className="text-xs text-muted-foreground border-t pt-2">
          Comentario de cierre: {finding.closeComment}
        </p>
      )}
      {finding.status !== "closed" && (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
          <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid={`button-update-finding-${finding.id}`}>
                Actualizar estatus
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Actualizar hallazgo</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Nuevo estatus</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Abierto</SelectItem>
                      <SelectItem value="in_progress">En progreso</SelectItem>
                      <SelectItem value="closed">Cerrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {newStatus === "closed" && (
                  <div className="space-y-2">
                    <Label>Comentario (opcional)</Label>
                    <Textarea
                      value={closeComment}
                      onChange={(e) => setCloseComment(e.target.value)}
                      placeholder="Comentario de cierre"
                      rows={2}
                    />
                  </div>
                )}
                <Button
                  className="w-full"
                  onClick={() =>
                    updateMutation.mutate({
                      status: newStatus,
                      closeComment: newStatus === "closed" ? closeComment : undefined,
                    })
                  }
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </Card>
  );
}
