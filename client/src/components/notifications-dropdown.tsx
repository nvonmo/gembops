import { useState, Fragment } from "react";
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
import { Bell, Check, CheckCheck, CalendarDays, Download } from "lucide-react";
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
  const [selectedMediaUrl, setSelectedMediaUrl] = useState<string | null>(null);
  const [mediaModalOpen, setMediaModalOpen] = useState(false);
  const [videoLoadError, setVideoLoadError] = useState(false);

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
    <Fragment>
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
                    <DialogContent
                        onClick={(e) => e.stopPropagation()}
                        onPointerDown={(e) => e.stopPropagation()}
                        className="max-w-md max-h-[90vh] overflow-y-auto"
                      >
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
                              const rawUrls: string[] = findingDetail.photoUrls?.length ? findingDetail.photoUrls : (findingDetail.photoUrl ? [findingDetail.photoUrl] : []);
                              const mediaUrls = rawUrls.filter((u): u is string => !!u && typeof u === "string" && u.trim() !== "");
                              const toAbsolute = (u: string) => (u.startsWith("http://") || u.startsWith("https://") ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`);
                              if (mediaUrls.length === 0) return null;
                              return (
                                <div className="flex flex-wrap gap-2">
                                  {mediaUrls.slice(0, 6).map((url, idx) => {
                                    const absUrl = toAbsolute(url.trim());
                                    const isVideo = url.match(/\.(mp4|webm|ogg|mov|avi)$/i) || url.includes("video");
                                    const isExternal = (absUrl.startsWith("http://") || absUrl.startsWith("https://")) && !absUrl.startsWith(window.location.origin);
                                    const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(absUrl)}` : absUrl;
                                    const openMedia = (e: React.MouseEvent | React.PointerEvent) => {
                                      e.stopPropagation();
                                      e.preventDefault();
                                      setSelectedMediaUrl(absUrl);
                                      setVideoLoadError(false);
                                      setMediaModalOpen(true);
                                    };
                                    const btnClass = "w-20 h-20 min-w-[48px] min-h-[48px] rounded-md border overflow-hidden bg-muted cursor-pointer hover:opacity-80 active:opacity-90 transition-opacity p-0 shrink-0";
                                    return isVideo ? (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={openMedia}
                                        onPointerUp={openMedia}
                                        className={btnClass}
                                        aria-label="Ver video"
                                      >
                                        <video
                                          src={videoSrc}
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover pointer-events-none"
                                          muted
                                          playsInline
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        key={idx}
                                        type="button"
                                        onClick={openMedia}
                                        onPointerUp={openMedia}
                                        className={btnClass}
                                        aria-label={`Ver imagen ${idx + 1}`}
                                      >
                                        <img
                                          src={absUrl}
                                          alt={`Adjunto ${idx + 1}`}
                                          loading="eager"
                                          referrerPolicy="no-referrer"
                                          className="w-full h-full object-cover"
                                        />
                                      </button>
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

    {/* Modal para ver imagen/video al hacer clic en miniatura */}
    <Dialog open={mediaModalOpen} onOpenChange={(open) => {
      setMediaModalOpen(open);
      if (!open) setSelectedMediaUrl(null);
    }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] p-2 sm:p-0">
        <div className="p-4 border-b">
          <DialogTitle className="text-lg">
            {selectedMediaUrl && (selectedMediaUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedMediaUrl.includes("video"))
              ? (/\.mp4$/i.test(selectedMediaUrl) ? "Ver video (MP4)" : "Ver video (MOV)")
              : "Ver imagen"}
          </DialogTitle>
        </div>
        <div className="p-4 flex flex-col items-center justify-center bg-muted/50 gap-3">
          {selectedMediaUrl && (() => {
            const displayUrl = selectedMediaUrl.startsWith("http://") || selectedMediaUrl.startsWith("https://") ? selectedMediaUrl : `${window.location.origin}${selectedMediaUrl.startsWith("/") ? selectedMediaUrl : `/${selectedMediaUrl}`}`;
            const isVideo = selectedMediaUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedMediaUrl.includes("video");
            const isExternal = (displayUrl.startsWith("http://") || displayUrl.startsWith("https://")) && !displayUrl.startsWith(window.location.origin);
            const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(displayUrl)}` : displayUrl;
            return isVideo ? (
              <>
                <p className="text-sm text-muted-foreground text-center">
                  {/\.mp4$/i.test(selectedMediaUrl) ? "Usa el botón de reproducir (▶) abajo." : "Los .MOV a veces no se reproducen en Chrome. Si no ves el video, descarga el archivo."}
                </p>
                <video
                  key={videoSrc}
                  src={videoSrc}
                  controls
                  autoPlay
                  playsInline
                  onError={() => setVideoLoadError(true)}
                  onLoadedData={() => setVideoLoadError(false)}
                  className="max-w-full max-h-[70vh] rounded-md"
                >
                  Tu navegador no soporta la reproducción de videos.
                </video>
                {videoLoadError && (
                  <p className="text-sm text-destructive font-medium text-center">
                    No se pudo cargar. Prueba descargar el video.
                  </p>
                )}
                <Button variant="outline" size="sm" asChild>
                  <a href={displayUrl} download target="_blank" rel="noopener noreferrer" className="gap-2">
                    <Download className="h-4 w-4" />
                    Descargar video
                  </a>
                </Button>
              </>
            ) : (
              <img
                src={displayUrl}
                alt="Imagen ampliada"
                loading="eager"
                decoding="async"
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] object-contain rounded-md"
              />
            );
          })()}
        </div>
      </DialogContent>
    </Dialog>
    </Fragment>
  );
}
