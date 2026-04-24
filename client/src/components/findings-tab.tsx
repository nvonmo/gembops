import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { isUnauthorizedError } from "@/lib/auth-utils";
import { useAuth } from "@/hooks/use-auth";
import type { Finding, GembaWalk } from "@shared/schema";
import { Plus, User, Users, CalendarDays, Tag, MapPin, Edit, Search, Filter, X, Star, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Mic, MicOff, RefreshCw, Download, AlertTriangle, HelpCircle, Trash2, CheckCircle2 } from "lucide-react";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { cn, isOverdueByDate } from "@/lib/utils";
import { findingCardGhostButtonClass } from "@/lib/finding-list-ui";
import { listImageThumbnailSrc, LIST_IMAGE_CARD_FEED_MAX_PX } from "@/lib/list-image-thumbnail";

// Categories are now loaded dynamically from the API

interface User {
  id: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
}

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  open: { label: "Abierto", variant: "destructive" },
  closed: { label: "Cerrado", variant: "secondary" },
};

interface FilterState {
  search: string;
  status: string;
  category: string;
  responsibleId: string;
  area: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

const STORAGE_KEY = "gemba-findings-filters";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  status: "",
  category: "",
  responsibleId: "",
  area: "",
  sortBy: "createdAt",
  sortOrder: "desc",
};

function parseFiltersFromStorage(): FilterState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_FILTERS;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return DEFAULT_FILTERS;
    return {
      search: typeof parsed.search === "string" ? parsed.search : "",
      status: typeof parsed.status === "string" ? parsed.status : "",
      category: typeof parsed.category === "string" ? parsed.category : "",
      responsibleId: typeof parsed.responsibleId === "string" ? parsed.responsibleId : "",
      area: typeof parsed.area === "string" ? parsed.area : "",
      sortBy: typeof parsed.sortBy === "string" && ["createdAt", "dueDate", "description", "category", "status"].includes(parsed.sortBy) ? parsed.sortBy : "createdAt",
      sortOrder: parsed.sortOrder === "asc" || parsed.sortOrder === "desc" ? parsed.sortOrder : "desc",
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function parseSavedFiltersFromStorage(): Array<{ name: string; filters: FilterState }> {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}-favorites`);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item: any) => item && typeof item.name === "string" && item.filters && typeof item.filters === "object"
    ).map((item: any) => ({
      name: item.name,
      filters: { ...DEFAULT_FILTERS, ...item.filters },
    }));
  } catch {
    return [];
  }
}

export default function FindingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWalk, setSelectedWalk] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  // Filters and search state (safe parse to avoid blank screen on corrupt localStorage)
  const [filters, setFilters] = useState<FilterState>(parseFiltersFromStorage);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; filters: FilterState }>>(parseSavedFiltersFromStorage);

  const { user } = useAuth();
  const { data: allWalks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });
  
  // Filter walks: líder y fecha dentro de los últimos 5 días o hoy
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const minWalkDateStr = format(new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  const walks = allWalks.filter((walk: any) => {
    return walk.leaderId === user?.id && walk.date && walk.date <= todayStr && walk.date >= minWalkDateStr;
  });
  
  // Use allWalks for displaying findings (everyone can see all findings)
  const allWalksForDisplay = allWalks;

  const { data: usersList = [], isLoading: isLoadingUsers, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users/list"],
    retry: 2,
  });

  const { data: departmentsList = [] } = useQuery<Array<{ id: number; name: string; isActive: boolean }>>({
    queryKey: ["/api/departments"],
    retry: 2,
  });

  // Load categories from API
  const { data: categoriesList = [], isLoading: isLoadingCategories } = useQuery<Array<{ id: number; name: string; isActive: boolean; includesDescription?: string | null }>>({
    queryKey: ["/api/categories"],
    retry: 2,
  });

  // Build query string for filters
  const queryParams = new URLSearchParams();
  if (filters.search) queryParams.set("search", filters.search);
  if (filters.status) queryParams.set("status", filters.status);
  if (filters.category) queryParams.set("category", filters.category);
  if (filters.responsibleId) queryParams.set("responsibleId", filters.responsibleId);
  if (filters.area) queryParams.set("area", filters.area);
  queryParams.set("sortBy", filters.sortBy);
  queryParams.set("sortOrder", filters.sortOrder);
  queryParams.set("page", currentPage.toString());
  queryParams.set("limit", itemsPerPage.toString());

  interface FindingsResponse {
    findings: Finding[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasMore: boolean;
    };
  }

  const { data: findingsData, isLoading, error: findingsError, refetch: refetchFindings, isRefetching } = useQuery<FindingsResponse>({
    queryKey: [`/api/findings?${queryParams.toString()}`, user?.id],
  });

  const findings = findingsData?.findings || [];
  const pagination = findingsData?.pagination || { page: 1, limit: itemsPerPage, total: 0, totalPages: 1, hasMore: false };
  
  // Log error for debugging
  if (findingsError) {
    console.error("Error loading findings:", findingsError);
  }

  // Reset to page 1 when filters change
  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setCurrentPage(1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newFilters));
  };

  // Save filters to localStorage (now uses handleFilterChange)
  const saveFilters = handleFilterChange;

  // Save current filters as favorite
  const saveAsFavorite = () => {
    const name = prompt("Nombre para este filtro:");
    if (name && name.trim()) {
      const newFavorites = [...savedFilters, { name: name.trim(), filters }];
      setSavedFilters(newFavorites);
      localStorage.setItem(`${STORAGE_KEY}-favorites`, JSON.stringify(newFavorites));
      toast({ title: "Filtro guardado" });
    }
  };

  // Load favorite filter
  const loadFavorite = (favFilters: FilterState) => {
    handleFilterChange(favFilters);
    setFiltersOpen(false);
    toast({ title: "Filtro cargado" });
  };

  // Delete favorite
  const deleteFavorite = (index: number) => {
    const newFavorites = savedFilters.filter((_, i) => i !== index);
    setSavedFilters(newFavorites);
    localStorage.setItem(`${STORAGE_KEY}-favorites`, JSON.stringify(newFavorites));
    toast({ title: "Filtro eliminado" });
  };

  // Get unique categories from findings (for filters)
  // Use categories from API for the dropdown, but also include any categories used in findings that might not be in the list
  const categoriesFromFindings = Array.from(new Set(findings.map(f => f.category)));
  const uniqueCategories = Array.from(new Set([
    ...categoriesList.map(c => c.name),
    ...categoriesFromFindings
  ])).sort();
  // Get all areas from findings (including specific finding area and walk areas)
  const uniqueAreas = Array.from(new Set(
    findings.flatMap(f => {
      const areas: string[] = [];
      // First, add the specific area of the finding if it exists
      if ((f as any).area) {
        areas.push((f as any).area);
      }
      // Then add areas from the walk
      if ((f as any).areas && Array.isArray((f as any).areas)) {
        areas.push(...(f as any).areas);
      } else {
        const walk = walks.find((w: any) => w.id === f.gembaWalkId);
        if (walk?.area) {
          areas.push(walk.area);
        }
      }
      return areas;
    }).filter(Boolean)
  )).sort();

  // Normalize filter values for Select: only pass values that exist in options to avoid blank/crash (Radix)
  const validUserIds = new Set((usersList || []).filter((u) => u.id != null && u.id !== "").map((u) => u.id));
  const statusSelectValue = filters.status === "open" || filters.status === "closed" ? filters.status : "all";
  const categorySelectValue = filters.category && uniqueCategories.includes(filters.category) ? filters.category : "all";
  const responsibleSelectValue = filters.responsibleId && validUserIds.has(filters.responsibleId) ? filters.responsibleId : "all";
  const areaSelectValue = filters.area && uniqueAreas.includes(filters.area) ? filters.area : "all";

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognitionInstance = new SpeechRecognition();
        recognitionInstance.continuous = true;
        recognitionInstance.interimResults = true;
        recognitionInstance.lang = "es-ES"; // Spanish language
        
        recognitionInstance.onresult = (event: any) => {
          let interimTranscript = "";
          let finalTranscript = "";
          
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcript + " ";
            } else {
              interimTranscript += transcript;
            }
          }
          
          setDescription((prev) => {
            // Remove previous interim results and add new ones
            const baseText = prev.replace(/\s*\[Grabando\.\.\.\]\s*$/, "");
            return baseText + finalTranscript + (interimTranscript ? `[Grabando...]` : "");
          });
        };
        
        recognitionInstance.onerror = (event: any) => {
          console.error("Speech recognition error:", event.error);
          setIsRecording(false);
          if (event.error === "no-speech") {
            toast({ title: "No se detectó voz", description: "Intenta hablar más cerca del micrófono", variant: "destructive" });
          } else if (event.error === "not-allowed") {
            toast({ title: "Permiso denegado", description: "Por favor permite el acceso al micrófono", variant: "destructive" });
          } else {
            toast({ title: "Error de reconocimiento", description: "No se pudo procesar el audio", variant: "destructive" });
          }
        };
        
        recognitionInstance.onend = () => {
          setIsRecording(false);
          // Remove [Grabando...] text when recording ends
          setDescription((prev) => prev.replace(/\s*\[Grabando\.\.\.\]\s*$/, ""));
        };
        
        recognitionRef.current = recognitionInstance;
        setRecognition(recognitionInstance);

        // Cleanup on unmount
        return () => {
          if (recognitionInstance) {
            try {
              recognitionInstance.stop();
            } catch (_) {}
          }
          recognitionRef.current = null;
        };
      }
    }
  }, []);

  const stopRecordingIfActive = () => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch (_) {}
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (!recognition) {
      toast({ title: "No disponible", description: "El reconocimiento de voz no está disponible en tu navegador", variant: "destructive" });
      return;
    }

    if (isRecording) {
      try {
        recognition.stop();
      } catch (_) {}
      setIsRecording(false);
    } else {
      try {
        recognition.start();
        setIsRecording(true);
        toast({ title: "Grabando...", description: "Habla ahora. Presiona el micrófono nuevamente para detener." });
      } catch (error) {
        console.error("Error starting recognition:", error);
        toast({ title: "Error", description: "No se pudo iniciar la grabación", variant: "destructive" });
      }
    }
  };

  // Get areas for selected walk
  const selectedWalkData = walks.find((w: any) => String(w.id) === selectedWalk);
  const walkAreas = selectedWalkData 
    ? [selectedWalkData.area, ...((selectedWalkData as any).areas || [])].filter(Boolean)
    : [];

  function resetForm() {
    stopRecordingIfActive();
    setSelectedWalk("");
    setSelectedArea("");
    setCategory("");
    setDescription("");
    setResponsibleId("");
    setPhotoFiles([]);
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("gembaWalkId", selectedWalk);
      if (selectedArea) {
        formData.append("area", selectedArea);
      }
      formData.append("category", category);
      formData.append("description", description);
      if (responsibleId) {
        formData.append("responsibleId", responsibleId);
      }
      if (departmentId) {
        formData.append("departmentId", departmentId);
      }
      formData.append("status", "open");
      photoFiles.forEach((file) => formData.append("photos", file));
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
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const activeFiltersCount = [
    filters.search,
    filters.status,
    filters.category,
    filters.responsibleId,
    filters.area,
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-base sm:text-lg font-semibold">Hallazgos</h2>
        {walks.length > 0 && (
          <div className="flex items-center gap-2">
            <Dialog
              open={dialogOpen}
              onOpenChange={(open) => {
                if (!open) stopRecordingIfActive();
                setDialogOpen(open);
              }}
            >
              <Button
                data-testid="button-add-finding"
                className="gap-1.5 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs touch-manipulation"
                onClick={() => setDialogOpen(true)}
                type="button"
              >
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="whitespace-nowrap">Agregar</span>
              </Button>
          <DialogContent
            className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] min-h-[min(60vh,400px)] overflow-y-auto overflow-x-hidden p-4 sm:p-6 bg-background"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle>Nuevo Hallazgo</DialogTitle>
              <DialogDescription className="sr-only">Formulario para registrar un nuevo hallazgo del Gemba Walk.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Gemba Walk</Label>
                <Select value={selectedWalk} onValueChange={(value) => {
                  setSelectedWalk(value);
                  setSelectedArea(""); // Reset area when walk changes
                }}>
                  <SelectTrigger data-testid="select-walk" className="text-base h-11 sm:h-10">
                    <SelectValue placeholder="Seleccionar recorrido" />
                  </SelectTrigger>
                  <SelectContent>
                    {walks.length === 0 ? (
                      <SelectItem value="no-walks" disabled>
                        No hay recorridos (últimos 5 días o hoy) donde seas líder
                      </SelectItem>
                    ) : (
                      walks.map((w: any) => {
                        const areas = (w.areas || [w.area]).filter(Boolean);
                        return (
                          <SelectItem key={w.id} value={String(w.id)} className="text-base py-3">
                            {w.date} - {areas.join(", ")}
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              {selectedWalk && (
                walkAreas.length > 0 ? (
                  <div className="space-y-2">
                    <Label>Área específica donde se detectó el hallazgo</Label>
                    <Select value={selectedArea} onValueChange={setSelectedArea}>
                      <SelectTrigger className="text-base h-11 sm:h-10">
                        <SelectValue placeholder="Seleccionar área" />
                      </SelectTrigger>
                      <SelectContent>
                        {walkAreas.filter(Boolean).map((area: string) => (
                          <SelectItem key={area} value={area} className="text-base py-3">
                            {area}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Selecciona el área específica donde se detectó este hallazgo
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Este recorrido no tiene áreas asignadas; el hallazgo se guardará sin área.</p>
                )
              )}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label>Categoria</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-muted-foreground cursor-help" aria-label="Ayuda">
                        <HelpCircle className="h-4 w-4" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>Pasa el cursor sobre cada opción para ver qué incluye la categoría y asignarla correctamente.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger data-testid="select-category" className="text-base h-11 sm:h-10">
                    <SelectValue placeholder="Seleccionar categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingCategories ? (
                      <SelectItem value="loading" disabled>
                        Cargando categorías...
                      </SelectItem>
                    ) : categoriesList.length === 0 ? (
                      <SelectItem value="no-categories" disabled>
                        No hay categorías disponibles. Contacta al administrador.
                      </SelectItem>
                    ) : (
                      categoriesList.filter((c) => c.name).map((cat) => (
                        <SelectItem key={cat.id} value={cat.name!} className="text-base py-3" title={cat.includesDescription ?? undefined}>
                          {cat.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {category && (() => {
                  const selected = categoriesList.find((c) => c.name === category);
                  return selected?.includesDescription ? (
                    <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2 py-1">Qué incluye: {selected.includesDescription}</p>
                  ) : null;
                })()}
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Descripcion</Label>
                  {recognition && (
                    <Button
                      type="button"
                      variant={isRecording ? "destructive" : "ghost"}
                      size="sm"
                      onClick={toggleRecording}
                      className="h-8 px-2 gap-1.5"
                      title={isRecording ? "Detener grabación" : "Iniciar grabación de voz"}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="h-4 w-4" />
                          <span className="text-xs">Detener</span>
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" />
                          <span className="text-xs">Voz</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe brevemente el hallazgo o presiona el micrófono para hablar"
                    rows={3}
                    maxLength={200}
                    className="text-base min-h-[80px] sm:min-h-[60px] pr-10"
                    data-testid="input-description"
                  />
                  {isRecording && (
                    <div className="absolute top-2 right-2 flex items-center gap-1.5">
                      <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse"></div>
                      <span className="text-xs text-red-500 font-medium">Grabando...</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Responsable (obligatorio)</Label>
                <Select value={responsibleId} onValueChange={setResponsibleId}>
                  <SelectTrigger data-testid="select-responsible" className="text-base h-11 sm:h-10">
                    <SelectValue placeholder="Seleccionar responsable" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingUsers ? (
                      <SelectItem value="loading" disabled>
                        Cargando usuarios...
                      </SelectItem>
                    ) : usersError ? (
                      <SelectItem value="error" disabled>
                        Error al cargar usuarios
                      </SelectItem>
                    ) : usersList.length === 0 ? (
                      <SelectItem value="no-users" disabled>
                        No hay usuarios disponibles
                      </SelectItem>
                    ) : (
                      usersList.filter((u) => u.id != null && u.id !== "").map((user) => {
                        const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
                        return (
                          <SelectItem key={user.id} value={user.id} className="text-base py-3">
                            {displayName} ({user.username})
                          </SelectItem>
                        );
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Departamento responsable (opcional)</Label>
                <Select
                  value={departmentId || "__none__"}
                  onValueChange={(v) => setDepartmentId(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger data-testid="select-department" className="text-base h-11 sm:h-10">
                    <SelectValue placeholder="Seleccionar departamento (o dejar vacío)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin departamento</SelectItem>
                    {departmentsList
                      .filter((d) => d.isActive)
                      .map((dept) => (
                        <SelectItem key={dept.id} value={String(dept.id)} className="text-base py-3">
                          {dept.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Opcional: también puedes asignar un departamento además del responsable.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Fotos o videos (opcional, hasta 10)</Label>
                <Input
                  type="file"
                  accept="image/*,video/*"
                  capture
                  multiple
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    setPhotoFiles((prev) => [...prev, ...newFiles].slice(0, 10));
                    e.target.value = "";
                  }}
                  className="text-base h-11 sm:h-10"
                  data-testid="input-photo"
                />
                <p className="text-xs text-muted-foreground">
                  Puedes anexar varias fotos o videos. En móvil puedes tomar o grabar desde la cámara.
                </p>
                {photoFiles.length > 0 && (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {photoFiles.length} archivo(s) seleccionado(s)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {photoFiles.map((file, i) => (
                        <div key={i} className="relative">
                          {file.type.startsWith("image/") ? (
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Vista previa ${i + 1}`}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-md border object-cover"
                            />
                          ) : file.type.startsWith("video/") ? (
                            <video
                              src={URL.createObjectURL(file)}
                              className="w-20 h-20 sm:w-24 sm:h-24 rounded-md border object-cover"
                              muted
                              playsInline
                            />
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setPhotoFiles((prev) => prev.filter((_, j) => j !== i))}
                            className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center text-xs"
                            aria-label="Quitar"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button
                className="w-full text-base min-h-[44px] sm:min-h-[36px] touch-manipulation"
                disabled={
                  !selectedWalk ||
                  (walkAreas.length > 0 && !selectedArea) ||
                  !category ||
                  !description ||
                  !responsibleId ||
                  createMutation.isPending
                }
                onClick={() => {
                  stopRecordingIfActive();
                  createMutation.mutate();
                }}
                data-testid="button-save-finding"
              >
                {createMutation.isPending ? "Guardando..." : "Guardar Hallazgo"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
        )}
        {walks.length === 0 && (
          <div className="text-sm text-muted-foreground">
            Solo puedes crear hallazgos si eres líder de un Gemba Walk de hoy o de los últimos 5 días
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar por descripción, categoría, área o responsable..."
              value={filters.search}
              onChange={(e) => saveFilters({ ...filters, search: e.target.value })}
              className="pl-9 sm:pl-10 h-11 sm:h-10 text-base"
            />
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-2">
            <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="default" className="gap-2 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs">
                  <Filter className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden xs:inline">Filtros</span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary" className="ml-1 min-w-[20px] h-5 flex items-center justify-center">
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-80 max-w-sm" align="start">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Filtros</h4>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={saveAsFavorite}
                        className="h-7 px-2"
                      >
                        <Star className="h-3 w-3" />
                      </Button>
                      {activeFiltersCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const cleared = {
                              search: "",
                              status: "",
                              category: "",
                              responsibleId: "",
                              area: "",
                              sortBy: "createdAt",
                              sortOrder: "desc" as const,
                            };
                            saveFilters(cleared);
                          }}
                          className="h-7 px-2 text-xs"
                        >
                          Limpiar
                        </Button>
                      )}
                    </div>
                  </div>

                  <Separator />

                  {/* Status Filter */}
                  <div className="space-y-2">
                    <Label className="text-xs">Estado</Label>
                    <Select value={statusSelectValue} onValueChange={(value) => saveFilters({ ...filters, status: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="open">Abierto</SelectItem>
                        <SelectItem value="closed">Cerrado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Category Filter */}
                  <div className="space-y-2">
                    <Label className="text-xs">Categoría</Label>
                    <Select value={categorySelectValue} onValueChange={(value) => saveFilters({ ...filters, category: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {uniqueCategories.filter(Boolean).map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Responsible Filter */}
                  <div className="space-y-2">
                    <Label className="text-xs">Responsable</Label>
                    <Select value={responsibleSelectValue} onValueChange={(value) => saveFilters({ ...filters, responsibleId: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {usersList.filter((u) => u.id != null && u.id !== "").map((user) => {
                          const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
                          return (
                            <SelectItem key={user.id} value={user.id}>{displayName}</SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Area Filter */}
                  <div className="space-y-2">
                    <Label className="text-xs">Área</Label>
                    <Select value={areaSelectValue} onValueChange={(value) => saveFilters({ ...filters, area: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {uniqueAreas.filter(Boolean).map((area) => (
                          <SelectItem key={area} value={area}>{area}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Sort */}
                  <div className="space-y-2">
                    <Label className="text-xs">Ordenar por</Label>
                    <div className="flex gap-2">
                      <Select value={filters.sortBy} onValueChange={(value) => saveFilters({ ...filters, sortBy: value })}>
                        <SelectTrigger className="h-8 flex-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="createdAt">Fecha creación</SelectItem>
                          <SelectItem value="dueDate">Fecha compromiso</SelectItem>
                          <SelectItem value="description">Descripción</SelectItem>
                          <SelectItem value="category">Categoría</SelectItem>
                          <SelectItem value="status">Estado</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 px-3"
                        onClick={() => saveFilters({ ...filters, sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}
                      >
                        {filters.sortOrder === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {/* Saved Filters */}
                  {savedFilters.length > 0 && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <Label className="text-xs">Filtros guardados</Label>
                        <div className="space-y-1">
                          {savedFilters.map((fav, index) => (
                            <div key={index} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="flex-1 justify-start h-auto py-1"
                                onClick={() => loadFavorite(fav.filters)}
                              >
                                <Star className="h-3 w-3 mr-2 fill-yellow-400 text-yellow-400" />
                                <span className="text-xs">{fav.name}</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => deleteFavorite(index)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Active Filters Tags */}
            {filters.status && (
              <Badge variant="secondary" className="gap-1">
                Estado: {filters.status === "open" ? "Abierto" : "Cerrado"}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => saveFilters({ ...filters, status: "" })}
                />
              </Badge>
            )}
            {filters.category && (
              <Badge variant="secondary" className="gap-1">
                {filters.category}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => saveFilters({ ...filters, category: "" })}
                />
              </Badge>
            )}
            {filters.area && (
              <Badge variant="secondary" className="gap-1">
                {filters.area}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => saveFilters({ ...filters, area: "" })}
                />
              </Badge>
            )}
            {filters.responsibleId && (
              <Badge variant="secondary" className="gap-1">
                {usersList.find(u => u.id === filters.responsibleId)?.firstName || "Responsable"}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => saveFilters({ ...filters, responsibleId: "" })}
                />
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4 sm:p-5">
              <div className="flex gap-3">
                <Skeleton className="w-14 h-14 sm:w-16 sm:h-16 rounded-md shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                  <div className="flex gap-2 pt-1">
                    <Skeleton className="h-3.5 w-16" />
                    <Skeleton className="h-3.5 w-20" />
                    <Skeleton className="h-3.5 w-14" />
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : findingsError ? (
        <Card className="p-8 text-center">
          <p className="text-destructive font-medium mb-2">Error al cargar hallazgos</p>
          <p className="text-sm text-muted-foreground mb-4">{findingsError.message}</p>
          <Button
            variant="default"
            onClick={() => refetchFindings()}
            disabled={isRefetching}
            className="gap-2"
            data-testid="button-retry-findings"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            {isRefetching ? "Reintentando..." : "Reintentar"}
          </Button>
        </Card>
      ) : findings.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          <p>No hay hallazgos registrados. Agrega el primero.</p>
          {pagination.total > 0 && (
            <p className="text-xs mt-2">Total de hallazgos: {pagination.total} (filtrados)</p>
          )}
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {findings.map((f) => {
              // Use areas from finding if available (from backend), otherwise find walk
              const findingAreas = (f as any).areas && Array.isArray((f as any).areas) 
                ? (f as any).areas 
                : (() => {
                    const walk = allWalksForDisplay.find((w: any) => w.id === f.gembaWalkId);
                    return walk?.area ? [walk.area] : [];
                  })();
              const walkArea = findingAreas.length > 0 ? findingAreas[0] : undefined;
              const statusInfo = STATUS_MAP[f.status] || STATUS_MAP.open;
              const isOverdue = f.status !== "closed" && !!f.dueDate && isOverdueByDate(f.dueDate);
              return (
                <FindingCard
                  key={f.id}
                  finding={f}
                  walkArea={walkArea}
                  statusInfo={statusInfo}
                  isOverdue={isOverdue}
                  walks={walks}
                  categoriesList={categoriesList}
                  usersList={usersList}
                  departmentsList={departmentsList}
                />
              );
            })}
          </div>
          
          {/* Pagination Controls - Mobile Optimized */}
          {pagination.totalPages > 1 && (
            <div className="mt-6 space-y-3">
              {/* Page info - centered on mobile */}
              <div className="text-center sm:text-left text-sm text-muted-foreground">
                Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} hallazgos
              </div>
              
              {/* Pagination buttons - simplified for mobile */}
              <div className="flex items-center justify-center gap-2 sm:gap-1">
                {/* Previous button - larger on mobile */}
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={pagination.page === 1}
                  className="gap-1.5 min-h-[44px] sm:min-h-[36px] px-4 sm:px-3 touch-manipulation"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="hidden sm:inline">Anterior</span>
                </Button>
                
                {/* Page numbers - responsive display */}
                <div className="flex items-center gap-1 sm:gap-0.5">
                  {/* Always show first page if not visible */}
                  {pagination.page > 3 && pagination.totalPages > 5 && (
                    <>
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setCurrentPage(1)}
                        className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] px-0 touch-manipulation hidden sm:flex"
                      >
                        1
                      </Button>
                      {pagination.page > 4 && (
                        <span className="px-1 text-muted-foreground hidden sm:inline">...</span>
                      )}
                    </>
                  )}
                  
                  {/* Current page and neighbors - show fewer on mobile */}
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (pagination.page <= 3) {
                      pageNum = i + 1;
                    } else if (pagination.page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = pagination.page - 2 + i;
                    }
                    
                    // On mobile, hide pages that are far from current
                    const isFarFromCurrent = Math.abs(pageNum - pagination.page) > 1;
                    const shouldHideOnMobile = pagination.totalPages > 5 && isFarFromCurrent && 
                      !(pagination.page <= 2 && pageNum <= 3) && 
                      !(pagination.page >= pagination.totalPages - 1 && pageNum >= pagination.totalPages - 2);
                    
                    return (
                      <Button
                        key={pageNum}
                        variant={pagination.page === pageNum ? "default" : "outline"}
                        size="default"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] px-0 font-medium touch-manipulation ${shouldHideOnMobile ? 'hidden sm:flex' : ''}`}
                      >
                        {pageNum}
                      </Button>
                    );
                  })}
                  
                  {/* Always show last page if not visible */}
                  {pagination.page < pagination.totalPages - 2 && pagination.totalPages > 5 && (
                    <>
                      {pagination.page < pagination.totalPages - 3 && (
                        <span className="px-1 text-muted-foreground hidden sm:inline">...</span>
                      )}
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => setCurrentPage(pagination.totalPages)}
                        className="min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] px-0 touch-manipulation hidden sm:flex"
                      >
                        {pagination.totalPages}
                      </Button>
                    </>
                  )}
                </div>
                
                {/* Next button - larger on mobile */}
                <Button
                  variant="outline"
                  size="default"
                  onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                  disabled={pagination.page === pagination.totalPages}
                  className="gap-1.5 min-h-[44px] sm:min-h-[36px] px-4 sm:px-3 touch-manipulation"
                >
                  <span className="hidden sm:inline">Siguiente</span>
                  <ChevronRight className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FindingCard({
  finding,
  walkArea,
  statusInfo,
  isOverdue,
  walks,
  categoriesList,
  usersList,
  departmentsList,
}: {
  finding: Finding & { responsibleUser?: User | null; closedByUser?: User | null; walkLeaderId?: string | null; areas?: string[]; departmentName?: string | null };
  walkArea?: string;
  statusInfo: { label: string; variant: "default" | "secondary" | "destructive" };
  isOverdue: boolean;
  walks: GembaWalk[];
  categoriesList: Array<{ id: number; name: string; isActive?: boolean; includesDescription?: string | null }>;
  usersList: User[];
  departmentsList: Array<{ id: number; name: string; isActive: boolean }>;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeComment, setCloseComment] = useState("");
  const [closeEvidenceFile, setCloseEvidenceFile] = useState<File | null>(null);
  const [newStatus, setNewStatus] = useState(finding.status);
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDate, setDueDate] = useState(finding.dueDate || "");
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);
  const [videoLoadError, setVideoLoadError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editDescription, setEditDescription] = useState(finding.description);
  const [editArea, setEditArea] = useState((finding as any).area || "");
  const [editCategory, setEditCategory] = useState(finding.category);
  const [editResponsibleId, setEditResponsibleId] = useState(finding.responsibleId ?? "");
  const [editDepartmentId, setEditDepartmentId] = useState(
    (finding as any).departmentId != null && (finding as any).departmentId !== "" ? String((finding as any).departmentId) : "__none__"
  );
  const [editPhotoFiles, setEditPhotoFiles] = useState<File[]>([]);
  useEffect(() => {
    if (editOpen) {
      setEditDescription(finding.description);
      setEditArea((finding as any).area || "");
      setEditCategory(finding.category);
      setEditResponsibleId(finding.responsibleId ?? "");
      setEditDepartmentId((finding as any).departmentId != null && (finding as any).departmentId !== "" ? String((finding as any).departmentId) : "__none__");
    }
  }, [editOpen, finding.id, finding.description, (finding as any).area, finding.category, finding.responsibleId, (finding as any).departmentId]);
  const isResponsible = user?.id === finding.responsibleId;
  const isLeader = (finding as any).walkLeaderId === user?.id;
  const isAdmin = user?.role != null && String(user.role).toLowerCase() === "admin";
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [walk] = walks.filter(w => w.id === finding.gembaWalkId);
  const isCreator = walk?.createdBy === user?.id;
  /** Quién puede cambiar estatus/cerrar: responsable, creador del walk o admin (backend solo permite a estos). */
  const canUpdateStatus = isResponsible || isCreator || isAdmin;
  const editAreas: string[] = (finding as any).areas && Array.isArray((finding as any).areas) ? (finding as any).areas : (walk?.area ? [walk.area] : []);

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setVideoLoadError(false);
    setImageModalOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: string; closeComment?: string; dueDate?: string; closeEvidenceFile?: File | null; riskIfRepeats?: boolean }) => {
      const { closeEvidenceFile: evidenceFile, ...restData } = data;
      
      // If there's evidence file, use FormData
      if (evidenceFile) {
        const formData = new FormData();
        formData.append("status", restData.status || finding.status);
        if (restData.closeComment !== undefined) formData.append("closeComment", restData.closeComment);
        if (restData.dueDate !== undefined) formData.append("dueDate", restData.dueDate || "");
        if (restData.riskIfRepeats !== undefined) formData.append("riskIfRepeats", String(restData.riskIfRepeats));
        formData.append("closeEvidence", evidenceFile);
        
        const res = await fetch(`/api/findings/${finding.id}`, {
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
        const res = await apiRequest("PATCH", `/api/findings/${finding.id}`, restData);
        return res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setCloseOpen(false);
      setDueDateOpen(false);
      setCloseEvidenceFile(null);
      setCloseComment("");
      toast({ title: "Hallazgo actualizado" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const editFindingMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("description", editDescription);
      formData.append("area", editArea);
      formData.append("category", editCategory);
      formData.append("responsibleId", editResponsibleId === "__none__" ? "" : editResponsibleId);
      formData.append("departmentId", editDepartmentId === "__none__" ? "" : editDepartmentId);
      editPhotoFiles.forEach((file) => formData.append("photos", file));
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: "PATCH",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Error al actualizar hallazgo");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gemba-walks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setEditOpen(false);
      setEditPhotoFiles([]);
      toast({ title: "Hallazgo actualizado" });
    },
    onError: (error: Error) => {
      if (isUnauthorizedError(error)) {
        toast({ title: "Sesion expirada", description: "Iniciando sesion...", variant: "destructive" });
        setTimeout(() => (window.location.href = "/api/auth/login"), 500);
        return;
      }
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/findings/${finding.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Error al eliminar");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/findings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/pending-count"] });
      setDeleteOpen(false);
      toast({ title: "Hallazgo eliminado" });
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

  const handleSetDueDate = () => {
    if (!dueDate) {
      toast({ title: "Error", description: "Debes seleccionar una fecha", variant: "destructive" });
      return;
    }
    updateMutation.mutate({ dueDate });
  };

  const mediaUrls: string[] = useMemo(() => {
    const raw = (finding as any).photoUrls?.length ? (finding as any).photoUrls : finding.photoUrl ? [finding.photoUrl] : [];
    if (!Array.isArray(raw)) return [];
    return raw.filter((u: unknown): u is string => typeof u === "string" && u.trim() !== "");
  }, [finding.id, finding.photoUrl, (finding as any).photoUrls]);
  const toAbsolute = (u: string) => (u.startsWith("http://") || u.startsWith("https://") ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`);
  const mediaCount = mediaUrls.filter((x) => x?.trim()).length;
  const closeEvidenceTrimmed =
    finding.status === "closed" && finding.closeEvidenceUrl ? String(finding.closeEvidenceUrl).trim() : "";
  const hasCloseEvidenceMedia = closeEvidenceTrimmed.length > 0;

  return (
    <Card className="space-y-3 p-3 sm:p-4" data-testid={`card-finding-${finding.id}`}>
      <div className="flex gap-3 sm:gap-4">
        <div className="w-[min(36vw,140px)] shrink-0 sm:w-40">
          {mediaUrls.length > 0 ? (
            <div
              className="flex w-full overflow-x-auto snap-x snap-mandatory rounded-xl border border-border bg-muted shadow-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
              aria-label={mediaCount > 1 ? "Desliza para ver más fotos o videos" : undefined}
            >
              {mediaUrls.map((url, idx) => {
                const absUrl = toAbsolute(url.trim());
                const isVideo = url.match(/\.(mp4|webm|ogg|mov|avi)$/i) || url.includes("video");
                const isExternal =
                  (absUrl.startsWith("http://") || absUrl.startsWith("https://")) &&
                  !absUrl.startsWith(window.location.origin);
                const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(absUrl)}` : absUrl;
                return (
                  <div key={idx} className="min-w-full shrink-0 snap-center snap-always">
                    <button
                      type="button"
                      onClick={() => handleImageClick(absUrl)}
                      className="relative block aspect-[3/4] w-full touch-manipulation overflow-hidden bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      title="Ver a tamaño completo"
                      data-testid={isVideo ? `video-finding-${finding.id}-${idx}` : `img-finding-${finding.id}-${idx}`}
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
                          alt={`Hallazgo ${idx + 1}`}
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
          <div className="flex flex-wrap items-center gap-1.5">
            {(isLeader || isAdmin) && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(findingCardGhostButtonClass, "gap-1 px-2")}
                onClick={() => {
                  setEditDescription(finding.description);
                  setEditArea((finding as any).area || "");
                  setEditCategory(finding.category);
                  setEditPhotoFiles([]);
                  setEditOpen(true);
                }}
                title="Editar hallazgo"
              >
                <Edit className="h-3 w-3" />
                Editar
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(findingCardGhostButtonClass, "gap-1 px-2 text-destructive hover:text-destructive hover:bg-destructive/10")}
                onClick={() => setDeleteOpen(true)}
                disabled={deleteMutation.isPending}
                title="Eliminar hallazgo"
                data-testid="button-delete-finding"
              >
                <Trash2 className="h-3 w-3" />
                Eliminar
              </Button>
            )}
            <Badge variant={statusInfo.variant} className="text-xs">
              {statusInfo.label}
            </Badge>
            {(finding as any).riskIfRepeats && (
              <Badge variant="outline" className="text-xs border-amber-500 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Riesgo mayor si se repite
              </Badge>
            )}
            {isOverdue && (
              <Badge variant="destructive" className="text-xs">
                Vencido
              </Badge>
            )}
            {(isLeader || isAdmin) && (
              <Button
                variant="ghost"
                size="sm"
                className={cn(findingCardGhostButtonClass, "gap-1 px-2 text-amber-700 dark:text-amber-400")}
                onClick={() => {
                  const next = !(finding as any).riskIfRepeats;
                  const message = next
                    ? "¿Confirmas que este hallazgo debe marcarse con la alerta de 'Riesgo mayor si se repite'? Esta acción quedará registrada."
                    : "¿Confirmas que quieres quitar la alerta de 'Riesgo mayor si se repite' de este hallazgo?";
                  if (!window.confirm(message)) return;
                  updateMutation.mutate({ riskIfRepeats: next });
                }}
                disabled={updateMutation.isPending}
                title={(finding as any).riskIfRepeats ? "Quitar alerta" : "Marcar: riesgo mayor si se repite"}
              >
                <AlertTriangle className="h-3 w-3" />
                {(finding as any).riskIfRepeats ? "Quitar alerta" : "Marcar alerta"}
              </Button>
            )}
          </div>
          <p className="text-sm leading-snug text-foreground" data-testid={`text-finding-desc-${finding.id}`}>
            {finding.description}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(finding as any).area && (
              <Badge variant="outline" className="max-w-full whitespace-normal break-words text-left text-xs sm:max-w-md">
                {(finding as any).area}
              </Badge>
            )}
            <Badge variant="secondary" className="max-w-full whitespace-normal break-words text-left text-xs sm:max-w-md">
              <Tag className="h-3 w-3 mr-1" />
              {finding.category}
            </Badge>
            <span className="flex items-center gap-1 text-muted-foreground">
              <User className="h-3.5 w-3.5 shrink-0" />
              {finding.responsibleUser
                ? [finding.responsibleUser.firstName, finding.responsibleUser.lastName].filter(Boolean).join(" ") ||
                  finding.responsibleUser.username
                : finding.responsibleId || "Sin asignar"}
            </span>
            {finding.departmentName && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Users className="h-3.5 w-3.5 shrink-0" />
                {finding.departmentName}
              </span>
            )}
            <span className="flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              {finding.dueDate ? (
                finding.dueDate
              ) : isResponsible ? (
                <span className="text-destructive">Fecha pendiente</span>
              ) : (
                <span>Sin fecha</span>
              )}
            </span>
            {walkArea && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {walkArea}
              </span>
            )}
          </div>
        </div>
      </div>

      {finding.status === "closed" && (
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2 dark:bg-muted/10">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <span className="text-sm font-semibold text-foreground">Resumen del cierre</span>
          </div>
          {(finding as { closedByUser?: User | null }).closedByUser && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground/90">Cerrado por:</span>{" "}
              {[finding.closedByUser!.firstName, finding.closedByUser!.lastName].filter(Boolean).join(" ") || finding.closedByUser!.username}
            </p>
          )}
          {finding.closeComment ? (
            <p className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground/90">Comentario:</span> {finding.closeComment}
            </p>
          ) : (
            !hasCloseEvidenceMedia && (
              <p className="text-xs italic text-muted-foreground">Sin comentario ni evidencia adjunta</p>
            )
          )}
        </div>
      )}

      {hasCloseEvidenceMedia && (
        <div className="rounded-lg border border-border bg-muted/30 p-2">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Evidencia de cierre</p>
          {(() => {
            const closeEvidenceAbs = toAbsolute(closeEvidenceTrimmed);
            const isVideo =
              closeEvidenceTrimmed.match(/\.(mp4|webm|ogg|mov|avi)$/i) || closeEvidenceTrimmed.includes("video");
            const isExternal =
              (closeEvidenceAbs.startsWith("http://") || closeEvidenceAbs.startsWith("https://")) &&
              !closeEvidenceAbs.startsWith(window.location.origin);
            const videoSrc = isVideo && isExternal ? `/api/media?url=${encodeURIComponent(closeEvidenceAbs)}` : closeEvidenceAbs;
            return isVideo ? (
              <button
                type="button"
                onClick={() => handleImageClick(closeEvidenceAbs)}
                className="relative block aspect-video w-full max-w-md overflow-hidden rounded-md border border-border touch-manipulation"
                title="Ver video de cierre"
                data-testid={`video-close-evidence-${finding.id}`}
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
                onClick={() => handleImageClick(closeEvidenceAbs)}
                className="relative block aspect-video w-full max-w-md overflow-hidden rounded-md border border-border touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                title="Ver imagen de cierre"
                data-testid={`img-close-evidence-${finding.id}`}
              >
                <img
                  src={listImageThumbnailSrc(closeEvidenceAbs, LIST_IMAGE_CARD_FEED_MAX_PX)}
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
      {finding.status !== "closed" && (
        <div className="flex gap-2 flex-wrap">
          {isResponsible && !finding.dueDate && (
            <Dialog open={dueDateOpen} onOpenChange={setDueDateOpen}>
              <DialogTrigger asChild>
                <Button variant="default" size="default" className="gap-1.5 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs flex-1 sm:flex-initial touch-manipulation">
                  <CalendarDays className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                  <span className="whitespace-nowrap">Establecer fecha compromiso</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Establecer fecha de compromiso</DialogTitle>
                  <DialogDescription className="sr-only">
                    Dialogo para seleccionar y guardar la fecha compromiso del hallazgo.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>Fecha compromiso</Label>
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="text-base h-11 sm:h-10"
                      min={new Date().toISOString().split("T")[0]}
                    />
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
                    <Button 
                      variant="outline" 
                      onClick={() => setDueDateOpen(false)}
                      className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto touch-manipulation"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleSetDueDate} 
                      disabled={updateMutation.isPending || !dueDate}
                      className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto touch-manipulation"
                    >
                      {updateMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          )}
          {canUpdateStatus && (
          <Dialog open={closeOpen} onOpenChange={(open) => {
            setCloseOpen(open);
            if (!open) {
              setCloseComment("");
              setCloseEvidenceFile(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button 
                variant={isResponsible && finding.status !== "closed" ? "default" : "outline"} 
                size="default" 
                className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs touch-manipulation" 
                data-testid={`button-update-finding-${finding.id}`}
              >
                {isResponsible && finding.status !== "closed" ? "Cerrar hallazgo" : "Actualizar estatus"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {isResponsible && finding.status !== "closed" ? "Cerrar hallazgo" : "Actualizar estatus"}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Dialogo para cerrar el hallazgo o actualizar su estatus.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Solo responsable al cerrar: formulario completo (comentario + evidencia). Admin/creador: solo cambio de estatus. */}
                {isResponsible && finding.status !== "closed" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Comentario de cierre (opcional)</Label>
                      <Textarea
                        value={closeComment}
                        onChange={(e) => setCloseComment(e.target.value)}
                        placeholder="Describe cómo se resolvió el hallazgo"
                        rows={3}
                        className="text-base"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Foto de evidencia (opcional)</Label>
                      <Input
                        type="file"
                        accept="image/*,video/*"
                        capture
                        onChange={(e) => setCloseEvidenceFile(e.target.files?.[0] || null)}
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
                  </>
                ) : (
                  <div className="space-y-2">
                    <Label>Nuevo estatus</Label>
                    <Select value={newStatus} onValueChange={setNewStatus}>
                      <SelectTrigger className="text-base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open" className="text-base py-3">Abierto</SelectItem>
                        <SelectItem value="closed" className="text-base py-3">Cerrado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setCloseOpen(false);
                      setCloseComment("");
                      setCloseEvidenceFile(null);
                    }}
                    disabled={updateMutation.isPending}
                    className="min-h-[44px] sm:min-h-[36px] w-full sm:w-auto touch-manipulation"
                  >
                    Cancelar
                  </Button>
                  <Button
                    className="w-full sm:w-auto min-h-[44px] sm:min-h-[36px] text-base touch-manipulation"
                    onClick={() => {
                      if (isResponsible && finding.status !== "closed") {
                        // Responsable: cierre con comentario y evidencia
                        updateMutation.mutate({
                          status: "closed",
                          closeComment: closeComment || undefined,
                          closeEvidenceFile: closeEvidenceFile,
                        });
                      } else {
                        // Admin/creador: solo cambio de estatus (sin comentario ni fotos)
                        updateMutation.mutate({
                          status: newStatus,
                          closeComment: undefined,
                          closeEvidenceFile: null,
                        });
                      }
                    }}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending 
                      ? "Guardando..." 
                      : isResponsible && finding.status !== "closed" 
                        ? "Cerrar hallazgo" 
                        : "Guardar cambios"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          )}
        </div>
      )}

      {/* Image Modal: fuera del bloque status !== "closed" para que las miniaturas abran también en hallazgos cerrados */}
      <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] p-2 sm:p-0">
          <DialogHeader className="p-4 border-b space-y-1.5">
            <DialogTitle className="text-lg">
              {selectedImageUrl && (selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video"))
                ? (/\.mp4$/i.test(selectedImageUrl) ? "Ver video (MP4)" : "Ver video (MOV)")
                : "Ver imagen"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Vista previa ampliada de evidencia en imagen o video del hallazgo.
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 flex flex-col items-center justify-center bg-muted/50 gap-3">
            {selectedImageUrl && (
              (() => {
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
                        No se pudo cargar. Prueba descargar el video o verifica que el hallazgo sea el que tiene video en MP4 (subido después del 26 feb).
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
                    fetchPriority="high"
                    className="max-w-full max-h-[70vh] object-contain rounded-md"
                  />
                );
              })()
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit finding dialog (leader only) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar hallazgo</DialogTitle>
            <DialogDescription className="sr-only">
              Formulario para editar la informacion del hallazgo seleccionado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Descripción</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
                maxLength={200}
                className="resize-none"
              />
            </div>
            {editAreas.length > 0 && (
              <div className="space-y-2">
                <Label>Área</Label>
                <Select value={editArea} onValueChange={setEditArea}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar área" />
                  </SelectTrigger>
                  <SelectContent>
                    {editAreas.filter(Boolean).map((a, i) => (
                      <SelectItem key={i} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>Categoría</Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex text-muted-foreground cursor-help" aria-label="Ayuda">
                      <HelpCircle className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>Pasa el cursor sobre cada opción para ver qué incluye la categoría.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesList.filter((c) => c.name).map((c) => (
                    <SelectItem key={c.id} value={c.name!} title={c.includesDescription ?? undefined}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editCategory && (() => {
                const selected = categoriesList.find((c) => c.name === editCategory);
                return selected?.includesDescription ? (
                  <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2 py-1">Qué incluye: {selected.includesDescription}</p>
                ) : null;
              })()}
            </div>
            <div className="space-y-2">
              <Label>Responsable</Label>
              <Select value={editResponsibleId || "__none__"} onValueChange={(v) => setEditResponsibleId(v === "__none__" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar responsable" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin asignar</SelectItem>
                  {usersList.filter((u) => u.id != null && u.id !== "").map((user) => {
                    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
                    return (
                      <SelectItem key={user.id} value={user.id}>{displayName} ({user.username})</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Departamento (opcional)</Label>
              <Select value={editDepartmentId} onValueChange={setEditDepartmentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin departamento</SelectItem>
                  {departmentsList.filter((d) => d.isActive).map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fotos o videos (opcional, reemplazan las actuales)</Label>
              <Input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={(e) => setEditPhotoFiles(e.target.files ? Array.from(e.target.files) : [])}
              />
              {editPhotoFiles.length > 0 && (
                <p className="text-xs text-muted-foreground">{editPhotoFiles.length} archivo(s) seleccionado(s)</p>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
                Cancelar
              </Button>
              <Button
                className="flex-1"
                disabled={!editDescription.trim() || !editCategory || editFindingMutation.isPending}
                onClick={() => editFindingMutation.mutate()}
              >
                {editFindingMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
            {isAdmin && (
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive border-destructive/50 hover:bg-destructive/10 hover:border-destructive"
                  onClick={() => {
                    setEditOpen(false);
                    setDeleteOpen(true);
                  }}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-finding-from-edit"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Eliminar hallazgo
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar hallazgo</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar este hallazgo? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Eliminando..." : "Eliminar"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
