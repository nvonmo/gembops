import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, Clock, CheckCircle2, AlertCircle, Target, Users, MapPin, Tag } from "lucide-react";

interface AnalyticsData {
  findingsByMonth: { month: string; open: number; closed: number }[];
  findingsByCategory: { category: string; count: number }[];
  findingsByArea: { area: string; count: number }[];
  topResponsibles: { name: string; count: number }[];
  metrics: {
    totalFindings: number;
    openFindings: number;
    closedFindings: number;
    overdueCount: number;
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

  const { metrics, findingsByMonth, findingsByCategory, findingsByArea, topResponsibles } = data;

  return (
    <div className="space-y-6">
      {/* Métricas principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              Cerrados a tiempo
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hallazgos por categoría */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-5 w-5" />
              Hallazgos por Categoría
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={findingsByCategory.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="category" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  tick={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#22B2D7" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Hallazgos por área */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-5 w-5" />
              Top Áreas con Más Hallazgos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <Pie
                  data={findingsByArea}
                  cx="50%"
                  cy="45%"
                  nameKey="area"
                  labelLine={false}
                  label={false}
                  outerRadius={80}
                  fill="#22B2D7"
                  dataKey="count"
                >
                  {findingsByArea.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  layout="vertical"
                  wrapperStyle={{ paddingTop: 12 }}
                  formatter={(value) => <span className="text-xs">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top responsables */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Top Responsables
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topResponsibles} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#22B2D7" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
