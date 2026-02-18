import { useAuth } from "@/hooks/use-auth";
import { useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ClipboardCheck, LogOut, Plus, ListChecks, AlertTriangle } from "lucide-react";
import NewGembaTab from "@/components/new-gemba-tab";
import FindingsTab from "@/components/findings-tab";
import FollowUpTab from "@/components/follow-up-tab";
import { useLocation } from "wouter";

export default function Dashboard() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Cargando...</div>
      </div>
    );
  }

  if (!user) return null;

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map((n) => n?.[0])
    .join("")
    .toUpperCase() || "U";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Gemba Walk</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.profileImageUrl || undefined} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <span className="text-sm hidden sm:inline" data-testid="text-username">
                {user.firstName || user.email || "Usuario"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (window.location.href = "/api/logout")}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6">
        <Tabs defaultValue="new" className="space-y-6">
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="new" data-testid="tab-new-gemba" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo Gemba</span>
              <span className="sm:hidden">Nuevo</span>
            </TabsTrigger>
            <TabsTrigger value="findings" data-testid="tab-findings" className="gap-1.5">
              <ListChecks className="h-4 w-4" />
              <span className="hidden sm:inline">Hallazgos</span>
              <span className="sm:hidden">Lista</span>
            </TabsTrigger>
            <TabsTrigger value="followup" data-testid="tab-followup" className="gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Seguimiento</span>
              <span className="sm:hidden">Seguir</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new">
            <NewGembaTab userId={user.id} />
          </TabsContent>
          <TabsContent value="findings">
            <FindingsTab />
          </TabsContent>
          <TabsContent value="followup">
            <FollowUpTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
