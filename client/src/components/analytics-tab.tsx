import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Target, Users, MapPin, Tag, CalendarX2 } from "lucide-react";

interface AnalyticsData {
  findingsByMonth: { month: string; open: number; closed: number }[];
  findingsByCategory: { category: string; count: number }[];
  findingsByArea: { area: string; count: number }[];
  findingsByAreaOpen?: { area: string; count: number }[];
  topResponsibles: { name: string; count: number; openCount?: number }[];
  metrics: {
    totalFindings: number;
    openFindings: number;
    closedFindings: number;
    overdueCount: number;
    pendingDueDateCount: number;
    closureRate: number;
    avgResolutionDays: number;
    complianceRate: number;
  };
}

// Paleta de la app: primary #22B2D7, azul claro, grises, acento naranja
const CHART_COLORS = ['#22B2D7', '#5BC9E0', '#8c8c8c', '#f7a83a', '#2e2e2e', '#6ab7d8', '#737373', '#e09830'];

export default function AnalyticsTab() {
  const { data, isLoading, error } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4 animate-pulse">
            <div className="h-4 bg-muted rounded w-1/2" />
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    console.error("Error loading analytics:", error);
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p className="text-destructive">Error al cargar los datos de analytics</p>
        <p className="text-sm mt-2">{String(error)}</p>
      </Card>
    );
  }

  if (!data || data.metrics.totalFindings === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        <p>No hay datos disponibles</p>
        <p className="text-sm mt-2">Crea algunos hallazgos para ver las estadísticas</p>
      </Card>
    );
  }

  const { metrics, findingsByMonth, findingsByCategory, findingsByArea, findingsByAreaOpen = [], topResponsibles } = data;

  return (
    <div className="space-y-6">
      {/* Métricas principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Hallazgos</p>
                <p className="text-2xl font-bold">{metrics.totalFindings}</p>
              </div>
              <Target className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Abiertos</p>
                <p className="text-2xl font-bold text-destructive">{metrics.openFindings}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cerrados</p>
                <p className="text-2xl font-bold text-green-600">{metrics.closedFindings}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Vencidos</p>
                <p className="text-2xl font-bold text-red-600">{metrics.overdueCount}</p>
              </div>
              <Clock className="h-8 w-8 text-red-600 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pendientes de definir fecha</p>
                <p className="text-2xl font-bold text-amber-600">{metrics.pendingDueDateCount ?? 0}</p>
              </div>
              <CalendarX2 className="h-8 w-8 text-amber-600 opacity-50" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Sin fecha compromiso
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Métricas de rendimiento */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tasa de Cierre</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">{metrics.closureRate}%</p>
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.closedFindings} de {metrics.totalFindings} hallazgos cerrados
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tiempo Promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">{metrics.avgResolutionDays}</p>
              <span className="text-sm text-muted-foreground">días</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tiempo promedio de resolución
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cumplimiento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <p className="text-3xl font-bold">{metrics.complianceRate}%</p>
              <Target className="h-5 w-5 text-green-600" />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Cerrados en o antes de la fecha compromiso (solo con fecha definida)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfica de tendencias por mes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 shrink-0" />
            <span>Tendencia de Hallazgos</span>
            <span className="text-sm font-normal text-muted-foreground">(Últimos 6 Meses)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={findingsByMonth}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="month" 
                tickFormatter={(value) => {
                  const [year, month] = value.split("-");
                  const date = new Date(parseInt(year), parseInt(month) - 1);
                  return date.toLocaleDateString("es-MX", { month: "short" });
                }}
              />
              <YAxis />
              <Tooltip 
                labelFormatter={(value) => {
                  const [year, month] = value.split("-");
                  const date = new Date(parseInt(year), parseInt(month) - 1);
                  return date.toLocaleDateString("es-MX", { month: "long", year: "numeric" });
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="open" stroke="#f7a83a" name="Abiertos" strokeWidth={2} />
              <Line type="monotone" dataKey="closed" stroke="#22B2D7" name="Cerrados" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6">
        {/* Hallazgos por categoría: barras horizontales para que las etiquetas no se solapen */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-5 w-5" />
              Hallazgos por Categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(280, findingsByCategory.slice(0, 10).length * 36)}>
              <BarChart
                data={findingsByCategory.slice(0, 10)}
                layout="vertical"
                margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={260}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(value) => (value.length > 48 ? value.slice(0, 47) + "…" : value)}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#22B2D7" name="Hallazgos" barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Áreas con Más Hallazgos (pastel) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" />
              Top Áreas con Más Hallazgos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
                <Pie
                  data={findingsByArea}
                  cx="50%"
                  cy="50%"
                  nameKey="area"
                  labelLine={false}
                  label={false}
                  outerRadius={100}
                  fill="#22B2D7"
                  dataKey="count"
                >
                  {findingsByArea.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            {/* Leyenda debajo con espaciado para que no se solapen */}
            <div className="flex flex-wrap gap-x-5 gap-y-3 mt-4 pt-3 border-t">
              {findingsByArea.map((entry, index) => (
                <div key={entry.area} className="flex items-start gap-2 min-w-0 max-w-full">
                  <span
                    className="shrink-0 w-3 h-3 rounded-sm mt-0.5"
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    aria-hidden
                  />
                  <span className="text-xs break-words max-w-[220px] min-w-0" title={entry.area}>{entry.area}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top áreas con más hallazgos abiertos - barras horizontales para etiquetas legibles */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" />
              Top Áreas con Más Hallazgos Abiertos
            </CardTitle>
          </CardHeader>
          <CardContent>
            {findingsByAreaOpen.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No hay hallazgos abiertos por área</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(260, findingsByAreaOpen.length * 40)}>
                <BarChart
                  data={findingsByAreaOpen}
                  layout="vertical"
                  margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="area"
                    width={200}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(value) => (value.length > 35 ? value.slice(0, 34) + "…" : value)}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill="#f7a83a" name="Abiertos" barSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top responsables: total (azul) y abiertos (naranja) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Top Responsables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topResponsibles.map((r) => ({ ...r, openCount: r.openCount ?? 0 }))} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="count" fill="#22B2D7" name="Total" />
              <Bar dataKey="openCount" fill="#f7a83a" name="Abiertos" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
