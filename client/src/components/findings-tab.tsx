import { useState, useEffect, useRef } from "react";
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
import { useAuth } from "@/hooks/use-auth";
import type { Finding, GembaWalk } from "@shared/schema";
import { Plus, User, CalendarDays, Tag, MapPin, Edit, Search, Filter, X, Star, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Mic, MicOff, RefreshCw, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious, PaginationEllipsis } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

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

export default function FindingsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWalk, setSelectedWalk] = useState("");
  const [selectedArea, setSelectedArea] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const recognitionRef = useRef<any>(null);

  // Filters and search state
  const [filters, setFilters] = useState<FilterState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {
      search: "",
      status: "",
      category: "",
      responsibleId: "",
      area: "",
      sortBy: "createdAt",
      sortOrder: "desc" as const,
    };
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [savedFilters, setSavedFilters] = useState<Array<{ name: string; filters: FilterState }>>(() => {
    const saved = localStorage.getItem(`${STORAGE_KEY}-favorites`);
    return saved ? JSON.parse(saved) : [];
  });

  const { user } = useAuth();
  const { data: allWalks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });
  
  // Filter walks where current user is the leader (for creation only)
  const walks = allWalks.filter((walk: any) => {
    return walk.leaderId === user?.id;
  });
  
  // Use allWalks for displaying findings (everyone can see all findings)
  const allWalksForDisplay = allWalks;

  const { data: usersList = [], isLoading: isLoadingUsers, error: usersError } = useQuery<User[]>({
    queryKey: ["/api/users/list"],
    retry: 2,
  });

  // Load categories from API
  const { data: categoriesList = [], isLoading: isLoadingCategories } = useQuery<Array<{ id: number; name: string; isActive: boolean }>>({
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
    queryKey: [`/api/findings?${queryParams.toString()}`],
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
      formData.append("responsibleId", responsibleId);
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
        setTimeout(() => (window.location.href = "/api/login"), 500);
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
            <DialogTrigger asChild>
              <Button data-testid="button-add-finding" className="gap-1.5 min-h-[44px] sm:min-h-[36px] text-sm sm:text-xs touch-manipulation">
                <Plus className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                <span className="whitespace-nowrap">Agregar</span>
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90dvh] overflow-y-auto p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>Nuevo Hallazgo</DialogTitle>
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
                        No hay Gemba Walks donde seas líder
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
              {selectedWalk && walkAreas.length > 0 && (
                <div className="space-y-2">
                  <Label>Área específica donde se detectó el hallazgo</Label>
                  <Select value={selectedArea} onValueChange={setSelectedArea}>
                    <SelectTrigger className="text-base h-11 sm:h-10">
                      <SelectValue placeholder="Seleccionar área" />
                    </SelectTrigger>
                    <SelectContent>
                      {walkAreas.map((area: string) => (
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
              )}
              <div className="space-y-2">
                <Label>Categoria</Label>
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
                      categoriesList.map((cat) => (
                        <SelectItem key={cat.id} value={cat.name} className="text-base py-3">
                          {cat.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
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
                <Label>Responsable</Label>
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
                      usersList.map((user) => {
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
                disabled={!selectedWalk || !selectedArea || !category || !description || !responsibleId || createMutation.isPending}
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
            Solo puedes crear hallazgos si eres líder de un Gemba Walk programado
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
                    <Select value={filters.status || "all"} onValueChange={(value) => saveFilters({ ...filters, status: value === "all" ? "" : value })}>
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
                    <Select value={filters.category || "all"} onValueChange={(value) => saveFilters({ ...filters, category: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {uniqueCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Responsible Filter */}
                  <div className="space-y-2">
                    <Label className="text-xs">Responsable</Label>
                    <Select value={filters.responsibleId || "all"} onValueChange={(value) => saveFilters({ ...filters, responsibleId: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {usersList.map((user) => {
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
                    <Select value={filters.area || "all"} onValueChange={(value) => saveFilters({ ...filters, area: value === "all" ? "" : value })}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        {uniqueAreas.map((area) => (
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
              const isOverdue = f.status !== "closed" && !!f.dueDate && new Date(f.dueDate) < new Date();
              return (
                <FindingCard
                  key={f.id}
                  finding={f}
                  walkArea={walkArea}
                  statusInfo={statusInfo}
                  isOverdue={isOverdue}
                  walks={walks}
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
}: {
  finding: Finding & { responsibleUser?: User | null };
  walkArea?: string;
  statusInfo: { label: string; variant: "default" | "secondary" | "destructive" };
  isOverdue: boolean;
  walks: GembaWalk[];
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
  const isResponsible = user?.id === finding.responsibleId;
  const [walk] = walks.filter(w => w.id === finding.gembaWalkId);
  const isCreator = walk?.createdBy === user?.id;

  const handleImageClick = (imageUrl: string) => {
    setSelectedImageUrl(imageUrl);
    setVideoLoadError(false);
    setImageModalOpen(true);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: { status?: string; closeComment?: string; dueDate?: string; closeEvidenceFile?: File | null }) => {
      const { closeEvidenceFile: evidenceFile, ...restData } = data;
      
      // If there's evidence file, use FormData
      if (evidenceFile) {
        const formData = new FormData();
        formData.append("status", restData.status || finding.status);
        if (restData.closeComment !== undefined) formData.append("closeComment", restData.closeComment);
        if (restData.dueDate !== undefined) formData.append("dueDate", restData.dueDate || "");
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
        setTimeout(() => (window.location.href = "/api/login"), 500);
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

  const mediaUrls: string[] = (finding as any).photoUrls?.length ? (finding as any).photoUrls : (finding.photoUrl ? [finding.photoUrl] : []);
  const toAbsolute = (u: string) => (u.startsWith("http://") || u.startsWith("https://") ? u : `${window.location.origin}${u.startsWith("/") ? u : `/${u}`}`);

  return (
    <Card className="p-3 sm:p-4 space-y-3" data-testid={`card-finding-${finding.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
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
          <p className="text-sm leading-relaxed" data-testid={`text-finding-desc-${finding.id}`}>
            {finding.description}
          </p>
        </div>
        {mediaUrls.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap shrink-0">
            {mediaUrls.slice(0, 4).map((url, idx) => {
              const absUrl = toAbsolute(url.trim());
              const isVideo = url.match(/\.(mp4|webm|ogg|mov|avi)$/i) || url.includes("video");
              return isVideo ? (
                <video
                  key={idx}
                  src={absUrl}
                  className="w-12 h-12 sm:w-14 sm:h-14 object-cover rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => handleImageClick(absUrl)}
                  data-testid={`video-finding-${finding.id}-${idx}`}
                  muted
                  playsInline
                />
              ) : (
                <div key={idx} className="w-12 h-12 sm:w-14 sm:h-14 rounded-md border overflow-hidden bg-muted">
                  <img
                    src={absUrl}
                    alt={`Hallazgo ${idx + 1}`}
                    loading="lazy"
                    decoding="async"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleImageClick(absUrl)}
                    data-testid={`img-finding-${finding.id}-${idx}`}
                  />
                </div>
              );
            })}
            {mediaUrls.length > 4 && (
              <button
                type="button"
                onClick={() => handleImageClick(toAbsolute(mediaUrls[4].trim()))}
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-md border bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground hover:bg-muted/80"
              >
                +{mediaUrls.length - 4}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        {(finding as any).area && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {(finding as any).area}
          </span>
        )}
        <span className="flex items-center gap-1">
          <User className="h-3.5 w-3.5 shrink-0" />
          {finding.responsibleUser 
            ? [finding.responsibleUser.firstName, finding.responsibleUser.lastName].filter(Boolean).join(" ") || finding.responsibleUser.username
            : finding.responsibleId || "Sin asignar"}
        </span>
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          {finding.dueDate ? (
            finding.dueDate
          ) : isResponsible ? (
            <span className="text-destructive">Fecha pendiente</span>
          ) : (
            <span className="text-muted-foreground">Sin fecha</span>
          )}
        </span>
        {walkArea && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            {walkArea}
          </span>
        )}
      </div>
      {finding.status === "closed" && (
        <div className="border-t pt-2 space-y-2">
          {finding.closeComment && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Comentario de cierre:</span> {finding.closeComment}
            </p>
          )}
          {finding.closeEvidenceUrl && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Evidencia de cierre:</p>
              {(() => {
                const closeEvidenceAbs = toAbsolute(finding.closeEvidenceUrl!.trim());
                const isVideo = finding.closeEvidenceUrl!.match(/\.(mp4|webm|ogg|mov|avi)$/i) || finding.closeEvidenceUrl!.includes("video");
                return isVideo ? (
                  <video
                    src={closeEvidenceAbs}
                    className="w-full max-w-xs rounded-md border cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => handleImageClick(closeEvidenceAbs)}
                    muted
                    playsInline
                  />
                ) : (
                  <div className="w-full max-w-xs rounded-md border overflow-hidden bg-muted">
                    <img
                      src={closeEvidenceAbs}
                      alt="Evidencia de cierre"
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="w-full h-auto object-cover cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => handleImageClick(closeEvidenceAbs)}
                    />
                  </div>
                );
              })()}
            </div>
          )}
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
                  {isResponsible && finding.status !== "closed" ? "Cerrar hallazgo" : "Actualizar hallazgo"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {!isResponsible && (
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
                {(newStatus === "closed" || (isResponsible && finding.status !== "closed")) && (
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
                        // Responsible closing the finding
                        updateMutation.mutate({
                          status: "closed",
                          closeComment: closeComment || undefined,
                          closeEvidenceFile: closeEvidenceFile,
                        });
                      } else {
                        // Creator updating status
                        updateMutation.mutate({
                          status: newStatus,
                          closeComment: newStatus === "closed" ? closeComment : undefined,
                          closeEvidenceFile: newStatus === "closed" ? closeEvidenceFile : null,
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

          {/* Image Modal */}
          <Dialog open={imageModalOpen} onOpenChange={setImageModalOpen}>
            <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[90vh] p-2 sm:p-0">
              <div className="p-4 border-b">
                <DialogTitle className="text-lg">
                  {selectedImageUrl && (selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video"))
                    ? "Ver video"
                    : "Ver imagen"}
                </DialogTitle>
              </div>
              <div className="p-4 flex flex-col items-center justify-center bg-muted/50 gap-3">
                {selectedImageUrl && (
                  (() => {
                    const displayUrl = toAbsolute(selectedImageUrl.trim());
                    const isVideo = selectedImageUrl.match(/\.(mp4|webm|ogg|mov|avi)$/i) || selectedImageUrl.includes("video");
                    const isMov = /\.mov$/i.test(selectedImageUrl);
                    return isVideo ? (
                      <>
                        <video
                          key={displayUrl}
                          src={displayUrl}
                          controls
                          autoPlay
                          playsInline
                          onError={() => setVideoLoadError(true)}
                          onLoadedData={() => setVideoLoadError(false)}
                          className="max-w-full max-h-[70vh] rounded-md"
                        >
                          Tu navegador no soporta la reproducción de videos.
                        </video>
                        {(videoLoadError || isMov) && (
                          <p className="text-sm text-muted-foreground text-center">
                            {isMov && "Chrome y otros navegadores a menudo no reproducen .MOV. "}
                            {videoLoadError && "No se pudo reproducir en el navegador. "}
                            Descarga el archivo:
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
                  })()
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </Card>
  );
}
