import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { Bell, Check, CheckCheck, CalendarDays } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Notification {
  id: number;
  userId: string;
  type: string;
  title: string;
  message: string;
  relatedFindingId: number | null;
  isRead: boolean;
  isActionRequired: boolean;
  isActionCompleted: boolean;
  createdAt: string;
}

interface FindingDetail {
  id: number;
  description: string;
  category: string;
  area?: string | null;
  photoUrl?: string | null;
  photoUrls?: string[];
  areas?: string[];
}

export function NotificationsDropdown() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [dueDateDialogOpen, setDueDateDialogOpen] = useState<number | null>(null);
  const [dueDate, setDueDate] = useState("");

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const { data: pendingCount = { count: 0 } } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/pending-count"],
    refetchInterval: 30000,
  });

  const { data: findingDetail, isLoading: findingDetailLoading } = useQuery<FindingDetail>({
    queryKey: [`/api/findings/${dueDateDialogOpen}`],
    enabled: !!dueDateDialogOpen,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/notifications/read-all");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/pending-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
      toast({ title: "Todas las notificaciones marcadas como leídas" });
    },
  });

  const markActionCompletedMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("PATCH", `/api/notifications/${id}/action-completed`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/pending-count"] });
      toast({ title: "Acción marcada como completada" });
    },
  });

  const setFindingDueDateMutation = useMutation({
    mutationFn: async ({ findingId, date }: { findingId: number; date: string }) => {
      await apiRequest("PATCH", `/api/findings/${findingId}`, { dueDate: date });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/pending-count"] });
      setDueDateDialogOpen(null);
      setDueDate("");
      // Mark notification as completed
      const notification = notifications.find(n => n.relatedFindingId === variables.findingId);
      if (notification) {
        markActionCompletedMutation.mutate(notification.id);
      }
      toast({ title: "Fecha de compromiso establecida" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message || "Error al establecer fecha", variant: "destructive" });
    },
  });

  const handleSetDueDate = (findingId: number) => {
    if (!dueDate) {
      toast({ title: "Error", description: "Debes seleccionar una fecha", variant: "destructive" });
      return;
    }
    setFindingDueDateMutation.mutate({ findingId, date: dueDate });
  };

  const unreadNotifications = notifications.filter(n => !n.isRead);
  const actionRequiredNotifications = notifications.filter(n => n.isActionRequired && !n.isActionCompleted);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {pendingCount.count > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {pendingCount.count > 9 ? "9+" : pendingCount.count}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-h-[80vh] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notificaciones</span>
          {unreadNotifications.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-1 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                markAllAsReadMutation.mutate();
              }}
              disabled={markAllAsReadMutation.isPending}
            >
              Marcar todas como leídas
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Cargando...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No hay notificaciones
          </div>
        ) : (
          <>
            {notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-3 cursor-pointer ${
                  !notification.isRead ? "bg-muted/50" : ""
                }`}
                onClick={() => {
                  if (!notification.isRead) {
                    markAsReadMutation.mutate(notification.id);
                  }
                }}
              >
                <div className="flex items-start justify-between w-full gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{notification.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {notification.message}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), {
                        addSuffix: true,
                      })}
                    </div>
                  </div>
                  {!notification.isRead && (
                    <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                  )}
                </div>
                {notification.isActionRequired && !notification.isActionCompleted && notification.type === "finding_assigned" && notification.relatedFindingId && (
                  <Dialog open={dueDateDialogOpen === notification.relatedFindingId} onOpenChange={(open) => {
                    setDueDateDialogOpen(open ? notification.relatedFindingId : null);
                    if (!open) setDueDate("");
                  }}>
                    <DialogTrigger asChild>
                      <Button
                        variant="default"
                        size="sm"
                        className="mt-2 h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDueDateDialogOpen(notification.relatedFindingId!);
                        }}
                      >
                        <CalendarDays className="h-3 w-3 mr-1" />
                        Establecer fecha compromiso
                      </Button>
                    </DialogTrigger>
                    <DialogContent onClick={(e) => e.stopPropagation()} className="max-w-md max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Establecer fecha de compromiso</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        {findingDetailLoading ? (
                          <div className="text-sm text-muted-foreground py-4">Cargando hallazgo...</div>
                        ) : findingDetail ? (
                          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">Hallazgo asignado</p>
                            <p className="text-sm leading-relaxed">{findingDetail.description}</p>
                            <div className="flex flex-wrap gap-1.5">
                              <Badge variant="secondary" className="text-xs">{findingDetail.category}</Badge>
                              {(findingDetail.areas?.[0] ?? findingDetail.area) && (
                                <Badge variant="outline" className="text-xs">{findingDetail.areas?.[0] ?? findingDetail.area}</Badge>
                              )}
                            </div>
                            {(() => {
                              const mediaUrls: string[] = findingDetail.photoUrls?.length ? findingDetail.photoUrls : (findingDetail.photoUrl ? [findingDetail.photoUrl] : []);
                              if (mediaUrls.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-2">
                                  {mediaUrls.slice(0, 6).map((url, idx) => {
                                    const isVideo = url.match(/\.(mp4|webm|ogg|mov|avi)$/i) || url.includes("video");
                                    return isVideo ? (
                                      <video
                                        key={idx}
                                        src={url}
                                        referrerPolicy="no-referrer"
                                        className="w-20 h-20 object-cover rounded-md border"
                                        muted
                                        playsInline
                                      />
                                    ) : (
                                      <img
                                        key={idx}
                                        src={url}
                                        alt={`Adjunto ${idx + 1}`}
                                        loading="lazy"
                                        referrerPolicy="no-referrer"
                                        className="w-20 h-20 object-cover rounded-md border"
                                      />
                                    );
                                  })}
                                  {mediaUrls.length > 6 && (
                                    <span className="text-xs text-muted-foreground self-center">+{mediaUrls.length - 6}</span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                        <div className="space-y-2">
                          <Label>Fecha compromiso</Label>
                          <Input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="text-base"
                            min={new Date().toISOString().split("T")[0]}
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={() => {
                            setDueDateDialogOpen(null);
                            setDueDate("");
                          }}>
                            Cancelar
                          </Button>
                          <Button onClick={() => handleSetDueDate(notification.relatedFindingId!)} disabled={setFindingDueDateMutation.isPending || !dueDate}>
                            {setFindingDueDateMutation.isPending ? "Guardando..." : "Guardar"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                {notification.isActionRequired && !notification.isActionCompleted && notification.type !== "finding_assigned" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      markActionCompletedMutation.mutate(notification.id);
                    }}
                    disabled={markActionCompletedMutation.isPending}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    Marcar como completado
                  </Button>
                )}
                {notification.isActionCompleted && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    <CheckCheck className="h-3 w-3 mr-1" />
                    Completado
                  </Badge>
                )}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
