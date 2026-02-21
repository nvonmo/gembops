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
import { User, CalendarDays, Download, FileSpreadsheet, AlertCircle, Clock, CheckCircle2, X } from "lucide-react";

interface User {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
}

type FindingWithUser = Finding & { responsibleUser?: User | null };

export default function FollowUpTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterMonth, setFilterMonth] = useState("");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [selectedFinding, setSelectedFinding] = useState<FindingWithUser | null>(null);
  const [closeComment, setCloseComment] = useState("");
  const [closeEvidenceFile, setCloseEvidenceFile] = useState<File | null>(null);

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
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

  const { data: findingsData, isLoading } = useQuery<FindingsResponse>({
    queryKey: ["/api/findings"],
  });

  const findings = findingsData?.findings || [];

  const { data: walks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const now = new Date();
  const openFindings = findings.filter((f) => f.status !== "closed");
  const overdue = openFindings.filter((f) => f.dueDate && new Date(f.dueDate) < now);
  const pending = openFindings.filter((f) => f.dueDate && new Date(f.dueDate) >= now);
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
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
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
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
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
              <CardContent className="space-y-1 px-3 sm:px-6 pb-3 sm:pb-6">
                {items.map((f) => {
                  const isOverdue = f.dueDate ? new Date(f.dueDate) < now : false;
                  return (
                    <div
                      key={f.id}
                      className="flex items-start sm:items-center justify-between gap-2 py-2.5 border-b last:border-0"
                      data-testid={`followup-item-${f.id}`}
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start gap-2">
                          <p className="text-sm leading-relaxed flex-1">{f.description}</p>
                          {f.photoUrl && (
                            (() => {
                              const isVideo = f.photoUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || f.photoUrl.includes("video");
                              return isVideo ? (
                                <video
                                  src={f.photoUrl}
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-md border shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleImageClick(f.photoUrl!)}
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={f.photoUrl}
                                  alt="Hallazgo"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-md border shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleImageClick(f.photoUrl!)}
                                />
                              );
                            })()
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="secondary" className="text-xs">{f.category}</Badge>
                          {f.dueDate ? (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="h-3 w-3 shrink-0" />
                              {f.dueDate}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-destructive">
                              <CalendarDays className="h-3 w-3 shrink-0" />
                              Sin fecha compromiso
                            </span>
                          )}
                        </div>
                        {f.status === "closed" && f.closeEvidenceUrl && (
                          <div className="mt-2">
                            <p className="text-xs text-muted-foreground mb-1">Evidencia de cierre:</p>
                            {(() => {
                              const isVideo = f.closeEvidenceUrl!.match(/\.(mp4|webm|ogg|mov|avi)$/i) || f.closeEvidenceUrl!.includes("video");
                              return isVideo ? (
                                <video
                                  src={f.closeEvidenceUrl}
                                  referrerPolicy="no-referrer"
                                  className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleImageClick(f.closeEvidenceUrl!)}
                                  muted
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={f.closeEvidenceUrl}
                                  alt="Evidencia de cierre"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  className="w-24 h-24 sm:w-32 sm:h-32 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                                  onClick={() => handleImageClick(f.closeEvidenceUrl!)}
                                />
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {isOverdue ? (
                          <Badge variant="destructive" className="text-xs">Vencido</Badge>
                        ) : !f.dueDate ? (
                          <Badge variant="outline" className="text-xs">Sin fecha</Badge>
                        ) : (
                          <Badge variant="default" className="text-xs">
                            Abierto
                          </Badge>
                        )}
                        {user?.id === f.responsibleId && f.status !== "closed" && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleCloseFinding(f)}
                            className="gap-1.5 h-7 text-xs min-h-[28px] px-2 sm:px-3"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="hidden sm:inline">Cerrar</span>
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Image/Video Modal */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] p-2 sm:p-0">
          <div className="p-4 border-b">
            <DialogTitle className="text-lg">
              {selectedImageUrl && (selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video"))
                ? "Ver video"
                : "Ver imagen"}
            </DialogTitle>
          </div>
          <div className="p-4 flex items-center justify-center bg-muted/50">
            {selectedImageUrl && (
              (() => {
                const isVideo = selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video");
                return isVideo ? (
                  <video
                    src={selectedImageUrl}
                    controls
                    autoPlay
                    className="max-w-full max-h-[70vh] rounded-md"
                  >
                    Tu navegador no soporta la reproducción de videos.
                  </video>
                ) : (
                  <img
                    src={selectedImageUrl}
                    alt="Imagen ampliada"
                    loading="eager"
                    className="max-w-full max-h-[70vh] object-contain rounded-md"
                  />
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
