import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import type { Finding, GembaWalk } from "@shared/schema";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { User, CalendarDays, Download, FileSpreadsheet, AlertCircle, Clock, CheckCircle2, X, RefreshCw, HelpCircle } from "lucide-react";
import { cn, daysSinceFindingCreated, isOverdueByDate } from "@/lib/utils";
import { findingListPrimaryActionButtonClass } from "@/lib/finding-list-ui";
import { listImageThumbnailSrc, LIST_IMAGE_CARD_FEED_MAX_PX } from "@/lib/list-image-thumbnail";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface User {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
}

type FindingWithUser = Finding & { responsibleUser?: User | null; closedByUser?: User | null; walkLeaderId?: string | null; areas?: string[]; canClose?: boolean };

export default function FollowUpTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterMonth, setFilterMonth] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [modalFullImageLoaded, setModalFullImageLoaded] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingWithUser | null>(null);
  const [closeComment, setCloseComment] = useState("");
  const [closeEvidenceFile, setCloseEvidenceFile] = useState<File | null>(null);

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setVideoLoadError(false);
    setModalFullImageLoaded(false);
    setImageModalOpen(true);
  };

  const handleCloseFinding = (finding: FindingWithUser) => {
    setSelectedFinding(finding);
    setCloseComment("");
    setCloseEvidenceFile(null);
    setCloseDialogOpen(true);
  };

  interface FindingsResponse {
    findings: FindingWithUser[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }

  // Pedir todos los hallazgos abiertos (limit alto); incluir user?.id en la key para que canClose se refetch al cambiar de usuario (evitar caché de admin)
  const { data: findingsData, isLoading, error: findingsError, refetch: refetchFindings, isRefetching } = useQuery<FindingsResponse>({
    queryKey: ["/api/findings?status=open&limit=500", user?.id],
  });

  const findings = findingsData?.findings || [];

  const { data: walks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const { data: categoriesList = [] } = useQuery<{ id: number; name: string; isActive?: boolean; includesDescription?: string | null }[]>({
    queryKey: ["/api/categories"],
  });

  const openFindings = findings.filter((f) => f.status !== "closed");
  const overdue = openFindings.filter((f) => f.dueDate && isOverdueByDate(f.dueDate));
  const pending = openFindings.filter((f) => f.dueDate && !isOverdueByDate(f.dueDate));
  const withoutDate = openFindings.filter((f) => !f.dueDate);

  const byResponsible = new Map<string, FindingWithUser[]>();
  openFindings.forEach((f) => {
    const responsibleName = f.responsibleUser
      ? [f.responsibleUser.firstName, f.responsibleUser.lastName].filter(Boolean).join(" ") || f.responsibleUser.username
      : f.responsibleId || "Sin asignar";
    const list = byResponsible.get(responsibleName) || [];
    list.push(f);
    byResponsible.set(responsibleName, list);
  });

  const months = Array.from(
    new Set(
      walks.map((w) => {
        const d = new Date(w.date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      })
    )
  ).sort().reverse();

  const handleExportPdf = () => {
    const params = filterMonth && filterMonth !== "all" ? `?month=${filterMonth}` : "";
    window.open(`/api/reports/pdf${params}`, "_blank");
  };

  const handleExportExcel = () => {
    const params = filterMonth && filterMonth !== "all" ? `?month=${filterMonth}` : "";
    window.open(`/api/reports/excel${params}`, "_blank");
  };

  const closeFindingMutation = useMutation({
    mutationFn: async (data: { findingId: number; closeComment?: string; closeEvidenceFile?: File | null }) => {
      const { closeEvidenceFile: evidenceFile, ...restData } = data;
      
      // If there's evidence file, use FormData
      if (evidenceFile) {
        const formData = new FormData();
        formData.append("status", "closed");
        if (restData.closeComment !== undefined) formData.append("closeComment", restData.closeComment);
        formData.append("closeEvidence", evidenceFile);
        
        const res = await fetch(`/api/findings/${data.findingId}`, {
          method: "PATCH",
          body: formData,
          credentials: "include",
        });
        
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status}: ${text}`);
        }
        
        return res.json();
      } else {
        // Otherwise use JSON
        const res = await apiRequest("PATCH", `/api/findings/${data.findingId}`, {
          status: "closed",
          closeComment: restData.closeComment,
        });
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings?status=open&limit=500"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setCloseDialogOpen(false);
      setCloseComment("");
      setCloseEvidenceFile(null);
      setSelectedFinding(null);
      toast({ title: "Hallazgo cerrado", description: "El hallazgo ha sido cerrado exitosamente." });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesión expirada", description: "Iniciando sesión...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (findingsError) {
    return (
      <div className="space-y-5">
        <Card className="p-8 text-center">
          <p className="text-destructive font-medium mb-2">Error al cargar el seguimiento</p>
          <p className="text-sm text-muted-foreground mb-4">{findingsError.message}</p>
          <Button
            variant="default"
            onClick={() => refetchFindings()}
            disabled={isRefetching}
            className="gap-2"
            data-testid="button-retry-followup"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Reintentando..." : "Reintentar"}
          </Button>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className="h-9 w-9 rounded-md shrink-0" />
              <div>
                <Skeleton className="h-7 w-12 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </Card>
          <Card className="p-3 sm:p-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Skeleton className="h-9 w-9 rounded-md shrink-0" />
              <div>
                <Skeleton className="h-7 w-12 mb-1" />
                <Skeleton className="h-3 w-16" />
              </div>
            </div>
          </Card>
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-24" />
          <div className="flex flex-col sm:flex-row gap-2">
            <Skeleton className="h-10 sm:w-[180px]" />
            <div className="grid grid-cols-2 gap-2">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-4 w-32" />
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[120px]" />
                <Skeleton className="h-5 w-6 rounded" />
              </div>
              <div className="space-y-2 pt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-20" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-md bg-destructive/10 shrink-0">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold" data-testid="text-overdue-count">{overdue.length}</p>
              <p className="text-xs text-muted-foreground">Vencidos</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-md bg-primary/10 shrink-0">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold" data-testid="text-pending-count">{pending.length}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </div>
        </Card>
        <Card className="p-3 sm:p-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 rounded-md bg-muted shrink-0">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xl sm:text-2xl font-bold" data-testid="text-without-date-count">{withoutDate.length}</p>
              <p className="text-xs text-muted-foreground">Sin fecha compromiso (abiertos)</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-3">
        <h2 className="text-base sm:text-lg font-semibold">Reportes</h2>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="text-base sm:w-[180px]" data-testid="select-month-filter">
              <SelectValue placeholder="Todos los meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-base py-3">Todos los meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m} className="text-base py-3">{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={handleExportPdf} className="gap-1.5" data-testid="button-export-pdf">
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="gap-1.5" data-testid="button-export-excel">
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground">Por responsable</h3>
        {byResponsible.size === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <p>No hay hallazgos pendientes. Todo al corriente.</p>
          </Card>
        ) : (
          Array.from(byResponsible.entries()).map(([name, items]) => (
            <Card key={name}>
              <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{name}</span>
                  <Badge variant="secondary" className="ml-auto shrink-0">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0 px-3 sm:px-6 pb-3 sm:pb-6">
                {items.map((f) => {
                  const isOverdue = f.dueDate ? isOverdueByDate(f.dueDate) : false;
                  const daysOpen = daysSinceFindingCreated(f.createdAt);
                  const daysOpenLabel =
                    daysOpen === null
                      ? null
                      : daysOpen === 0
                        ? "Hoy"
                        : daysOpen === 1
                          ? "1 día"
                          : `${daysOpen} días`;
                  const mediaUrls: string[] = (f as FindingWithUser & { photoUrls?: string[] }).photoUrls?.length
                    ? (f as FindingWithUser & { photoUrls?: string[] }).photoUrls!
                    : f.photoUrl
                      ? [f.photoUrl]
                      : [];
                  const toAbs = (u: string) =>
                    u.startsWith("http://") || u.startsWith("https://") ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`;
                  const canCloseRow = (f.canClose === true || user?.id === f.responsibleId) && f.status !== "closed";

                  const mediaCount = mediaUrls.filter((x) => x?.trim()).length;

                  return (
                    <div
                      key={f.id}
                      className="space-y-3 border-b border-border py-3.5 last:border-0 last:pb-0 first:pt-0"
                      data-testid={`followup-item-${f.id}`}
                    >
                      <div className="flex gap-3 sm:gap-4">
                      {/* Columna media: grande pero acotada; carrusel si hay varias */}
                      <div className="w-[min(36vw,140px)] shrink-0 sm:w-40">
                        {mediaUrls.length > 0 ? (
                          <div
                            className="flex w-full overflow-x-auto snap-x snap-mandatory rounded-xl border border-border bg-muted shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                            aria-label={mediaCount > 1 ? "Desliza para ver más fotos o videos" : undefined}
                          >
                            {mediaUrls.map((url, idx) => {
                              const u = url?.trim();
                              if (!u) return null;
                              const absUrl = toAbs(u);
                              const isVideo = u.match(/\.(mp4|webm|ogg|mov|avi)$/i) || u.includes("video");
                              const isExternal =
                                (absUrl.startsWith("http://") || absUrl.startsWith("https://")) &&
                                !absUrl.startsWith(window.location.origin);
                              const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(absUrl)}` : absUrl;
                              return (
                                <div key={idx} className="min-w-full shrink-0 snap-center snap-always">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleImageClick(u);
                                    }}
                                    className="relative block aspect-[3/4] w-full touch-manipulation overflow-hidden bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    title="Ver a tamaño completo"
                                  >
                                    {isVideo ? (
                                      <video
                                        src={videoSrc}
                                        referrerPolicy="no-referrer"
                                        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                                        muted
                                        playsInline
                                      />
                                    ) : (
                                      <img
                                        src={listImageThumbnailSrc(absUrl, LIST_IMAGE_CARD_FEED_MAX_PX)}
                                        alt={`Evidencia ${idx + 1}`}
                                        loading={idx === 0 ? "eager" : "lazy"}
                                        decoding="async"
                                        referrerPolicy="no-referrer"
                                        fetchPriority={idx === 0 ? "high" : "low"}
                                        className="absolute inset-0 h-full w-full object-cover pointer-events-none"
                                      />
                                    )}
                                    {mediaCount > 1 && (
                                      <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-full bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                                        {idx + 1}/{mediaCount}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-border bg-muted/40 px-2 text-center">
                            <span className="text-[10px] font-medium leading-tight text-muted-foreground">Sin evidencia</span>
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {isOverdue ? (
                              <Badge variant="destructive" className="text-xs">
                                Vencido
                              </Badge>
                            ) : !f.dueDate ? (
                              <Badge variant="outline" className="text-xs">
                                Sin fecha
                              </Badge>
                            ) : (
                              <Badge variant="default" className="text-xs">
                                Abierto
                              </Badge>
                            )}
                          </div>
                          {canCloseRow && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleCloseFinding(f)}
                              className={cn(findingListPrimaryActionButtonClass, "shrink-0 gap-1.5")}
                            >
                              <CheckCircle2 className="h-4 w-4 shrink-0" />
                              <span>Cerrar</span>
                            </Button>
                          )}
                        </div>

                        <p className="text-sm leading-snug text-foreground">{f.description}</p>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {(f.area || (f as FindingWithUser).areas?.[0]) && (
                            <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left text-xs sm:max-w-md">
                              {f.area || (f as FindingWithUser).areas?.[0]}
                            </Badge>
                          )}
                          <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs sm:max-w-md">
                            {f.category}
                          </Badge>
                          {f.dueDate ? (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              {f.dueDate}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-destructive">
                              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                              Sin fecha compromiso
                            </span>
                          )}
                          {daysOpenLabel != null && f.createdAt && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex cursor-default items-center gap-1 text-muted-foreground">
                                  <Clock className="h-3.5 w-3.5 shrink-0" />
                                  <span>{daysOpen === 0 ? "Hoy" : `Hace ${daysOpenLabel}`}</span>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p>
                                  Días desde el levantamiento del hallazgo
                                  {typeof f.createdAt === "string" || f.createdAt instanceof Date
                                    ? ` (${new Date(f.createdAt).toLocaleDateString("es-MX", { dateStyle: "medium" })})`
                                    : ""}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                      </div>

                      {f.status === "closed" && f.closeEvidenceUrl && (
                        <div className="rounded-lg border border-border bg-muted/30 p-2">
                          <p className="mb-2 text-xs font-medium text-muted-foreground">Evidencia de cierre</p>
                          {(() => {
                            const absUrl = toAbs(f.closeEvidenceUrl!.trim());
                            const isVideo = f.closeEvidenceUrl!.match(/\.(mp4|webm|ogg|mov|avi)$/i) || f.closeEvidenceUrl!.includes("video");
                            const isExternal =
                              (absUrl.startsWith("http://") || absUrl.startsWith("https://")) &&
                              !absUrl.startsWith(window.location.origin);
                            const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(absUrl)}` : absUrl;
                            return isVideo ? (
                              <button
                                type="button"
                                onClick={() => handleImageClick(f.closeEvidenceUrl!)}
                                className="relative block aspect-video w-full max-w-md overflow-hidden rounded-md border border-border touch-manipulation"
                              >
                                <video
                                  src={videoSrc}
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover pointer-events-none"
                                  muted
                                  playsInline
                                />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleImageClick(f.closeEvidenceUrl!);
                                }}
                                className="relative block aspect-video w-full max-w-md overflow-hidden rounded-md border border-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                title="Ver evidencia"
                              >
                                <img
                                  src={listImageThumbnailSrc(absUrl, LIST_IMAGE_CARD_FEED_MAX_PX)}
                                  alt="Evidencia de cierre"
                                  loading="lazy"
                                  decoding="async"
                                  referrerPolicy="no-referrer"
                                  className="h-full w-full object-cover"
                                />
                              </button>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Image/Video Modal */}
      <Dialog
        open={imageModalOpen}
        onOpenChange={(open) => {
          setImageModalOpen(open);
          if (!open) {
            setModalFullImageLoaded(false);
            setVideoLoadError(false);
          }
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] p-2 sm:p-0">
          <div className="p-4 border-b">
            <DialogTitle className="text-lg">
              {selectedImageUrl && (selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video"))
                ? (/\.mp4$/i.test(selectedImageUrl) ? "Ver video (MP4)" : "Ver video (MOV)")
                : "Ver imagen"}
            </DialogTitle>
          </div>
          <div className="p-4 flex flex-col items-center justify-center bg-muted/50 gap-3">
            {selectedImageUrl && (
              (() => {
                const toAbsolute = (u: string) => (u.startsWith("http://") || u.startsWith("https://") ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`);
                const displayUrl = toAbsolute(selectedImageUrl.trim());
                const isVideo = selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video");
                const isMov = /\.mov$/i.test(selectedImageUrl);
                const isMp4 = /\.mp4$/i.test(selectedImageUrl);
                const isExternal = (displayUrl.startsWith("http://") || displayUrl.startsWith("https://")) && !displayUrl.startsWith(window.location.origin);
                const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(displayUrl)}` : displayUrl;
                return isVideo ? (
                  <>
                    <p className="text-sm text-muted-foreground text-center">
                      {isMp4 ? "Usa el botón de reproducir (▶) abajo. Si no carga, descarga el archivo." : "Los .MOV a veces no se reproducen en Chrome. Si no ves el video, descarga el archivo."}
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
                        No se pudo cargar. Prueba descargar el video o verifica que sea el hallazgo con video en MP4 (subido después del 26 feb).
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
                  <div className="relative">
                    {!modalFullImageLoaded && (
                      <img
                        src={listImageThumbnailSrc(displayUrl, LIST_IMAGE_CARD_FEED_MAX_PX)}
                        alt="Imagen ampliada (vista previa)"
                        loading="eager"
                        decoding="async"
                        referrerPolicy="no-referrer"
                        fetchPriority="high"
                        className="max-w-full max-h-[70vh] object-contain rounded-md"
                      />
                    )}
                    <img
                      src={displayUrl}
                      alt="Imagen ampliada"
                      loading="eager"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      fetchPriority="high"
                      onLoad={() => setModalFullImageLoaded(true)}
                      className={cn(
                        "max-w-full max-h-[70vh] object-contain rounded-md",
                        modalFullImageLoaded ? "opacity-100" : "absolute inset-0 opacity-0"
                      )}
                    />
                  </div>
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Close Finding Dialog */}
      <Dialog open={closeDialogOpen} onOpenChange={(open) => {
        setCloseDialogOpen(open);
        if (!open) {
          setCloseComment("");
          setCloseEvidenceFile(null);
          setSelectedFinding(null);
        }
      }}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cerrar hallazgo</DialogTitle>
          </DialogHeader>
          {selectedFinding && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">{selectedFinding.description}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="closeComment">Comentario (opcional)</Label>
                <Textarea
                  id="closeComment"
                  value={closeComment}
                  onChange={(e) => setCloseComment(e.target.value)}
                  placeholder="Describe cómo se resolvió el hallazgo..."
                  className="min-h-[80px] text-base"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="closeEvidence">Evidencia fotográfica o video (opcional)</Label>
                <Input
                  id="closeEvidence"
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setCloseEvidenceFile(file);
                    }
                  }}
                  className="text-base h-11 sm:h-10"
                />
                <p className="text-xs text-muted-foreground">
                  En dispositivos móviles puedes tomar una foto o grabar un video directamente desde la cámara
                </p>
                {closeEvidenceFile && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">Vista previa:</p>
                    {closeEvidenceFile.type.startsWith("image/") ? (
                      <img
                        src={URL.createObjectURL(closeEvidenceFile)}
                        alt="Vista previa evidencia"
                        className="w-full max-w-xs rounded-md border object-cover"
                      />
                    ) : closeEvidenceFile.type.startsWith("video/") ? (
                      <video
                        src={URL.createObjectURL(closeEvidenceFile)}
                        controls
                        className="w-full max-w-xs rounded-md border"
                      >
                        Tu navegador no soporta la reproducción de videos.
                      </video>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCloseDialogOpen(false);
                    setCloseComment("");
                    setCloseEvidenceFile(null);
                    setSelectedFinding(null);
                  }}
                  disabled={closeFindingMutation.isPending}
                  className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto touch-manipulation"
                >
                  Cancelar
                </Button>
                <Button
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] text-base touch-manipulation"
                  onClick={() => {
                    closeFindingMutation.mutate({
                      findingId: selectedFinding.id,
                      closeComment: closeComment || undefined,
                      closeEvidenceFile: closeEvidenceFile,
                    });
                  }}
                  disabled={closeFindingMutation.isPending}
                >
                  {closeFindingMutation.isPending ? "Cerrando..." : "Cerrar hallazgo"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
