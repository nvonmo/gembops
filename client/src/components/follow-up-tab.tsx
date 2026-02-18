import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import type { Finding, GembaWalk } from "@shared/schema";
import { useState } from "react";
import { User, CalendarDays, Download, FileSpreadsheet, AlertCircle, Clock } from "lucide-react";

export default function FollowUpTab() {
  const [filterMonth, setFilterMonth] = useState("");

  const { data: findings = [], isLoading } = useQuery<Finding[]>({
    queryKey: ["/api/findings"],
  });

  const { data: walks = [] } = useQuery<GembaWalk[]>({
    queryKey: ["/api/gemba-walks"],
  });

  const now = new Date();
  const openFindings = findings.filter((f) => f.status !== "closed");
  const overdue = openFindings.filter((f) => new Date(f.dueDate) < now);
  const pending = openFindings.filter((f) => new Date(f.dueDate) >= now);

  const byResponsible = new Map<string, Finding[]>();
  openFindings.forEach((f) => {
    const list = byResponsible.get(f.responsible) || [];
    list.push(f);
    byResponsible.set(f.responsible, list);
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
    const params = filterMonth ? `?month=${filterMonth}` : "";
    window.open(`/api/reports/pdf${params}`, "_blank");
  };

  const handleExportExcel = () => {
    const params = filterMonth ? `?month=${filterMonth}` : "";
    window.open(`/api/reports/excel${params}`, "_blank");
  };

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
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-destructive/10">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-overdue-count">{overdue.length}</p>
              <p className="text-xs text-muted-foreground">Vencidos</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-md bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold" data-testid="text-pending-count">{pending.length}</p>
              <p className="text-xs text-muted-foreground">Pendientes</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold">Reportes</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filterMonth} onValueChange={setFilterMonth}>
            <SelectTrigger className="w-[160px]" data-testid="select-month-filter">
              <SelectValue placeholder="Todos los meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExportPdf} className="gap-1.5" data-testid="button-export-pdf">
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportExcel} className="gap-1.5" data-testid="button-export-excel">
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
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
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {name}
                  <Badge variant="secondary" className="ml-auto">{items.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.map((f) => {
                  const isOverdue = new Date(f.dueDate) < now;
                  return (
                    <div
                      key={f.id}
                      className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                      data-testid={`followup-item-${f.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{f.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">{f.category}</Badge>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            {f.dueDate}
                          </span>
                        </div>
                      </div>
                      {isOverdue ? (
                        <Badge variant="destructive" className="text-xs shrink-0">Vencido</Badge>
                      ) : (
                        <Badge variant="default" className="text-xs shrink-0">
                          {f.status === "in_progress" ? "En progreso" : "Abierto"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
