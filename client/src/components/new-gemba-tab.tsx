import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useAuth } from "@/hooks/use-auth";
import type { GembaWalk, Area, Finding } from "@shared/schema";
import { format, parseISO, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { MapPin, Calendar as CalendarIcon, Trash2, Users, UserCheck, X, List, CalendarDays, Eye, AlertCircle, CheckCircle2, Clock, Tag, User, Repeat, CheckCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";

interface User {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  confirmedAt?: string | null;
}

export default function NewGembaTab({ userId }: { userId: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const isAdmin = user?.role === "admin";
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [leaderId, setLeaderId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<"weekly" | "monthly" | "">("");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("calendar");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [selectedWalkId, setSelectedWalkId] = useState<number | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const { data: walks = [], isLoading } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const { data: areasList = [], isLoading: isLoadingAreas } = useQuery<Area[]>({
    queryKey: ["/api/areas"],
  });

  const { data: usersList = [] } = useQuery<User[]>({
    queryKey: ["/api/users/list"],
  });

  const toggleArea = (areaName: string) => {
    setSelectedAreas(prev => 
      prev.includes(areaName) 
        ? prev.filter(a => a !== areaName)
        : [...prev, areaName]
    );
  };

  const toggleParticipant = (participantId: string) => {
    setParticipantIds(prev =>
      prev.includes(participantId)
        ? prev.filter(id => id !== participantId)
        : [...prev, participantId]
    );
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gemba-walks", {
        date,
        areas: selectedAreas,
        leaderId: leaderId || null,
        participantIds,
        createdBy: userId,
        isRecurring,
        recurrencePattern: isRecurring ? recurrencePattern : null,
        recurrenceEndDate: isRecurring && recurrenceEndDate ? recurrenceEndDate : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      setSelectedAreas([]);
      setLeaderId("");
      setParticipantIds([]);
      setIsRecurring(false);
      setRecurrencePattern("");
      setRecurrenceEndDate("");
      setCreateDialogOpen(false);
      toast({ 
        title: "Gemba Walk programado", 
        description: isRecurring 
          ? `Gemba Walk recurrente creado. Los siguientes eventos se crearán automáticamente.`
          : "Ahora puedes agregar hallazgos durante el recorrido."
      });
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
      const res = await fetch(`/api/gemba-walks/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text || res.statusText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      toast({ title: "Gemba eliminado" });
    },
    onError: (error: Error) => {
      console.error("Error deleting gemba walk:", error);
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/login"), 500);
        return;
      }
      toast({ title: "Error al eliminar", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-medium text-muted-foreground">Recorridos programados</h3>
          <div className="flex items-center gap-2">
            {isAdmin && (
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              className="gap-1.5 shrink-0"
              data-testid="button-open-create-gemba"
            >
              <CalendarIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Agendar Gemba Walk</span>
            </Button>
            )}
            <Button
              variant={viewMode === "calendar" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("calendar")}
              className="gap-1.5"
            >
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Calendario</span>
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "outline"}
              size="sm"
              onClick={() => setViewMode("list")}
              className="gap-1.5"
            >
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Lista</span>
            </Button>
          </div>
        </div>

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
        ) : viewMode === "calendar" ? (
          <Card className="p-3 sm:p-4">
            <Calendar
              locale={es}
              className="rounded-md border-0"
              modifiers={{
                hasWalk: (date) => {
                  const onDate = walks.filter((walk: any) => isSameDay(parseISO(walk.date), date));
                  const isLeader = onDate.some((w: any) => w.leaderId === user?.id);
                  const isParticipant = onDate.some((w: any) => w.participants?.some((p: any) => p.id === user?.id) && w.leaderId !== user?.id);
                  return onDate.length > 0 && !isLeader && !isParticipant;
                },
                imLeader: (date) => walks.some((walk: any) => isSameDay(parseISO(walk.date), date) && walk.leaderId === user?.id),
                imParticipant: (date) => walks.some((walk: any) => isSameDay(parseISO(walk.date), date) && walk.participants?.some((p: any) => p.id === user?.id) && walk.leaderId !== user?.id),
              }}
              modifiersClassNames={{
                hasWalk: "bg-primary/10 text-primary font-semibold hover:bg-primary/20",
                imParticipant: "bg-primary/20 text-primary font-semibold hover:bg-primary/30 ring-1 ring-primary/30",
                imLeader: "bg-amber-500/25 text-amber-800 dark:text-amber-200 font-semibold hover:bg-amber-500/35 ring-1 ring-amber-500/40",
              }}
              onDayClick={(day) => {
                const walksOnDate = walks.filter((walk: any) => isSameDay(parseISO(walk.date), day));
                if (walksOnDate.length > 0) {
                  setSelectedDate(day);
                  // If only one walk on this date, open details directly
                  if (walksOnDate.length === 1) {
                    setSelectedWalkId(walksOnDate[0].id);
                    setDetailDialogOpen(true);
                  }
                } else {
                  setSelectedDate(undefined);
                }
              }}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-primary/10 border border-primary/20" aria-hidden />
                Recorrido
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-primary/20 border border-primary/30" aria-hidden />
                Eres participante
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-4 w-4 rounded bg-amber-500/25 border border-amber-500/40" aria-hidden />
                Eres líder
              </span>
            </div>
            {selectedDate && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">
                    Gemba Walks del {format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es })}
                  </h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDate(undefined)}
                    className="h-6 w-6 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {walks
                    .filter((walk: any) => isSameDay(parseISO(walk.date), selectedDate))
                    .map((walk: any) => {
                      const walkAreas = walk.areas || [walk.area];
                      const walkLeader = walk.leader;
                      const walkParticipants = walk.participants || [];
                      return (
                        <Card key={walk.id} className="p-3 border-l-4 border-l-primary">
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedWalkId(walk.id);
                                    setDetailDialogOpen(true);
                                  }}
                                  className="gap-1.5 h-7 text-xs"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Ver detalles
                                </Button>
                                {(walk as any).isRecurring && (
                                  <Badge variant="outline" className="gap-1 text-xs">
                                    <Repeat className="h-3 w-3" />
                                    Recurrente
                                  </Badge>
                                )}
                                {walkLeader && (
                                  <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="truncate">
                                      Líder: {[walkLeader.firstName, walkLeader.lastName].filter(Boolean).join(" ") || walkLeader.username}
                                    </span>
                                  </div>
                                )}
                              </div>
                              {isAdmin && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    if (confirm("¿Estás seguro de que quieres eliminar este Gemba Walk? Esta acción también eliminará todos los hallazgos asociados.")) {
                                      deleteMutation.mutate(walk.id);
                                    }
                                  }}
                                  disabled={deleteMutation.isPending}
                                  className="shrink-0 h-7 w-7"
                                  data-testid={`button-delete-walk-${walk.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                            <div className="flex items-start gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                                <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <span className="font-medium">Áreas:</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {walkAreas.map((areaName: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {areaName}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                            {walkParticipants.length > 0 && (
                              <div className="flex items-start gap-2 flex-wrap">
                                <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                                  <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                  <span className="font-medium">Integrantes:</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {walkParticipants.map((participant: User) => {
                                    const displayName = [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.username;
                                    return (
                                      <Badge key={participant.id} variant="secondary" className="text-xs gap-1">
                                        {participant.confirmedAt && <CheckCheck className="h-3 w-3 text-green-600" />}
                                        {displayName}
                                      </Badge>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                </div>
              </div>
            )}
          </Card>
        ) : (
          walks.map((walk: any) => {
            const walkAreas = walk.areas || [walk.area];
            const walkLeader = walk.leader;
            const walkParticipants = walk.participants || [];
            return (
              <Card key={walk.id} className="p-3 sm:p-4 hover-elevate">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 flex-wrap min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span data-testid={`text-walk-date-${walk.id}`}>{walk.date}</span>
                        {(walk as any).isRecurring && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Repeat className="h-3 w-3" />
                            Recurrente
                          </Badge>
                        )}
                      </div>
                      {walkLeader && (
                        <div className="flex items-center gap-1.5 text-sm">
                          <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-xs">
                            Líder: {[walkLeader.firstName, walkLeader.lastName].filter(Boolean).join(" ") || walkLeader.username}
                          </span>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedWalkId(walk.id);
                          setDetailDialogOpen(true);
                        }}
                        className="gap-1.5 h-7 text-xs ml-auto"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Ver detalles
                      </Button>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm("¿Estás seguro de que quieres eliminar este Gemba Walk? Esta acción también eliminará todos los hallazgos asociados.")) {
                            deleteMutation.mutate(walk.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="shrink-0"
                        data-testid={`button-delete-walk-${walk.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span className="font-medium">Áreas:</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {walkAreas.map((areaName: string, idx: number) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {areaName}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {walkParticipants.length > 0 && (
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="font-medium">Integrantes:</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {walkParticipants.map((participant: User) => {
                          const displayName = [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.username;
                          return (
                            <Badge key={participant.id} variant="secondary" className="text-xs gap-1">
                              {participant.confirmedAt && <CheckCheck className="h-3 w-3 text-green-600" />}
                              {displayName}
                            </Badge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Create Gemba Walk Dialog (admin only) */}
      {isAdmin && (
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg">Nuevo Gemba Walk</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="dialog-date" className="text-sm">Fecha Programada</Label>
                <Input
                  id="dialog-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="text-base"
                  data-testid="input-date"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Áreas a Recorrer</Label>
                {isLoadingAreas ? (
                  <p className="text-sm text-muted-foreground">Cargando áreas...</p>
                ) : areasList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay áreas disponibles</p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                    {areasList.map((a) => (
                      <div key={a.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`dialog-area-${a.id}`}
                          checked={selectedAreas.includes(a.name)}
                          onCheckedChange={() => toggleArea(a.name)}
                        />
                        <Label
                          htmlFor={`dialog-area-${a.id}`}
                          className="text-sm font-normal cursor-pointer flex-1"
                        >
                          {a.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
                {selectedAreas.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedAreas.map((areaName) => (
                      <Badge key={areaName} variant="secondary" className="gap-1">
                        {areaName}
                        <X
                          className="h-3 w-3 cursor-pointer"
                          onClick={() => toggleArea(areaName)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  <UserCheck className="h-4 w-4" />
                  Líder del Gemba Walk
                </Label>
                <Select value={leaderId || "none"} onValueChange={(value) => setLeaderId(value === "none" ? "" : value)}>
                  <SelectTrigger className="text-base">
                    <SelectValue placeholder="Seleccionar líder (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin líder asignado</SelectItem>
                    {usersList.map((user) => {
                      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
                      return (
                        <SelectItem key={user.id} value={user.id} className="text-base py-3">
                          {displayName} ({user.username})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Integrantes
                </Label>
                {usersList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay usuarios disponibles</p>
                ) : (
                  <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
                    {usersList.map((user) => {
                      const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
                      return (
                        <div key={user.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`dialog-participant-${user.id}`}
                            checked={participantIds.includes(user.id)}
                            onCheckedChange={() => toggleParticipant(user.id)}
                            disabled={user.id === leaderId}
                          />
                          <Label
                            htmlFor={`dialog-participant-${user.id}`}
                            className="text-sm font-normal cursor-pointer flex-1"
                          >
                            {displayName} {user.id === leaderId && <span className="text-muted-foreground">(Líder)</span>}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
                {participantIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {participantIds.map((pid) => {
                      const user = usersList.find(u => u.id === pid);
                      const displayName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username : pid;
                      return (
                        <Badge key={pid} variant="secondary" className="gap-1">
                          {displayName}
                          <X
                            className="h-3 w-3 cursor-pointer"
                            onClick={() => toggleParticipant(pid)}
                          />
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="dialog-recurring"
                    checked={isRecurring}
                    onCheckedChange={(checked) => {
                      setIsRecurring(checked as boolean);
                      if (!checked) {
                        setRecurrencePattern("");
                        setRecurrenceEndDate("");
                      }
                    }}
                  />
                  <Label htmlFor="dialog-recurring" className="text-sm font-normal cursor-pointer">
                    Hacer recurrente
                  </Label>
                </div>
                {isRecurring && (
                  <div className="space-y-3 pl-6 border-l-2">
                    <div className="space-y-2">
                      <Label className="text-sm">Frecuencia</Label>
                      <Select value={recurrencePattern} onValueChange={(value) => setRecurrencePattern(value as "weekly" | "monthly")}>
                        <SelectTrigger className="text-base h-11 sm:h-10">
                          <SelectValue placeholder="Seleccionar frecuencia" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="weekly" className="text-base py-3">Semanal</SelectItem>
                          <SelectItem value="monthly" className="text-base py-3">Mensual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Fecha de finalización (opcional)</Label>
                      <Input
                        type="date"
                        value={recurrenceEndDate}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="text-base h-11 sm:h-10"
                        min={date}
                      />
                      <p className="text-xs text-muted-foreground">
                        Si no se especifica, el Gemba Walk se repetirá indefinidamente
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <Button
                className="w-full text-base min-h-[44px] sm:min-h-[36px] touch-manipulation"
                onClick={() => createMutation.mutate()}
                disabled={!date || selectedAreas.length === 0 || (isRecurring && !recurrencePattern) || createMutation.isPending}
                data-testid="button-create-gemba"
              >
                {createMutation.isPending ? "Programando..." : isRecurring ? "Programar Gemba Walk Recurrente" : "Programar Gemba Walk"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Gemba Walk Detail Dialog */}
      <GembaWalkDetailDialog
        walkId={selectedWalkId}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
        isAdmin={isAdmin}
        onDelete={(id) => {
          if (confirm("¿Estás seguro de que quieres eliminar este Gemba Walk? Esta acción también eliminará todos los hallazgos asociados.")) {
            deleteMutation.mutate(id);
            setDetailDialogOpen(false);
          }
        }}
      />
    </div>
  );
}

interface GembaWalkDetailDialogProps {
  walkId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onDelete: (id: number) => void;
}

function GembaWalkDetailDialog({ walkId, open, onOpenChange, isAdmin, onDelete }: GembaWalkDetailDialogProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: walkDetails, isLoading } = useQuery<any>({
    queryKey: ["/api/gemba-walks", walkId],
    enabled: !!walkId && open,
  });
  const confirmParticipantMutation = useMutation({
    mutationFn: async (participantUserId: string) => {
      const res = await fetch(`/api/gemba-walks/${walkId}/confirm-attendance`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: participantUserId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Error al confirmar");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks", walkId] });
      toast({ title: "Asistencia confirmada", description: "Has registrado la asistencia del participante." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });
  const isLeader = walkDetails?.leader?.id === user?.id;

  if (!walkId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-lg sm:text-xl">
              Detalles del Gemba Walk
            </DialogTitle>
            {isAdmin && walkDetails && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDelete(walkId)}
                className="h-8 w-8"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 bg-muted rounded w-2/3 animate-pulse" />
            ))}
          </div>
        ) : walkDetails ? (
          <div className="space-y-6 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Fecha</Label>
                </div>
                <p className="text-base">{walkDetails.date}</p>
              </Card>
              
              {walkDetails.leader && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Líder</Label>
                  </div>
                  <p className="text-base">
                    {[walkDetails.leader.firstName, walkDetails.leader.lastName].filter(Boolean).join(" ") || walkDetails.leader.username}
                  </p>
                </Card>
              )}
            </div>

            {/* Areas */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Áreas</Label>
              </div>
              <div className="flex flex-wrap gap-2">
                {walkDetails.areas?.map((area: string, idx: number) => (
                  <Badge key={idx} variant="outline" className="text-sm">
                    {area}
                  </Badge>
                ))}
              </div>
            </Card>

            {/* Participants: leader can confirm attendance */}
            {walkDetails.participants && walkDetails.participants.length > 0 && (
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">Integrantes</Label>
                  {isLeader && (
                    <span className="text-xs text-muted-foreground font-normal">
                      — Marca a quienes asistieron
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {walkDetails.participants.map((participant: any) => {
                    const displayName = [participant.firstName, participant.lastName].filter(Boolean).join(" ") || participant.username;
                    const confirmed = !!participant.confirmedAt;
                    const isConfirming = confirmParticipantMutation.isPending && confirmParticipantMutation.variables === participant.id;
                    return (
                      <div key={participant.id} className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-sm gap-1.5">
                          {confirmed && <CheckCheck className="h-3.5 w-3.5 text-green-600" />}
                          {displayName}
                          {confirmed && <span className="text-xs text-muted-foreground">(asistió)</span>}
                        </Badge>
                        {isLeader && !confirmed && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-7 text-xs"
                            onClick={() => confirmParticipantMutation.mutate(participant.id)}
                            disabled={confirmParticipantMutation.isPending}
                          >
                            <CheckCheck className="h-3 w-3" />
                            {isConfirming ? "..." : "Confirmar asistencia"}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Statistics */}
            {walkDetails.stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Tag className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Total</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold">{walkDetails.stats.total}</p>
                </Card>
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="h-4 w-4 text-destructive" />
                    <span className="text-xs text-muted-foreground">Abiertos</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-destructive">{walkDetails.stats.open}</p>
                </Card>
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground">Cerrados</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-primary">{walkDetails.stats.closed}</p>
                </Card>
                <Card className="p-3 sm:p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-4 w-4 text-orange-500" />
                    <span className="text-xs text-muted-foreground">Vencidos</span>
                  </div>
                  <p className="text-xl sm:text-2xl font-bold text-orange-500">{walkDetails.stats.overdue}</p>
                </Card>
              </div>
            )}

            {/* Findings */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold">Hallazgos ({walkDetails.findings?.length || 0})</Label>
              </div>
              {walkDetails.findings && walkDetails.findings.length > 0 ? (
                <div className="space-y-3">
                  {walkDetails.findings.map((finding: Finding & { responsibleUser?: any }) => {
                    const isOverdue = finding.status !== "closed" && finding.dueDate && new Date(finding.dueDate) < new Date();
                    return (
                      <Card key={finding.id} className="p-3 border-l-4 border-l-primary">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium leading-relaxed">{finding.description}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant={finding.status === "closed" ? "secondary" : "destructive"} className="text-xs">
                                {finding.status === "closed" ? "Cerrado" : "Abierto"}
                              </Badge>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-xs">Vencido</Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Tag className="h-3 w-3" />
                              {finding.category}
                            </div>
                            {finding.responsibleUser && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {[finding.responsibleUser.firstName, finding.responsibleUser.lastName].filter(Boolean).join(" ") || finding.responsibleUser.username}
                              </div>
                            )}
                            {finding.dueDate && (
                              <div className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {finding.dueDate}
                              </div>
                            )}
                          </div>
                          {finding.closeComment && (
                            <div className="pt-2 border-t">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Comentario de cierre:</span> {finding.closeComment}
                              </p>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay hallazgos registrados para este Gemba Walk.
                </p>
              )}
            </Card>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
