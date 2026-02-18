import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ClipboardCheck, LogOut, Plus, ListChecks, AlertTriangle } from "lucide-react";
import NewGembaTab from "@/components/new-gemba-tab";
import FindingsTab from "@/components/findings-tab";
import FollowUpTab from "@/components/follow-up-tab";

export default function Dashboard() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = (user.firstName?.[0] || user.username[0] || "U").toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b sticky top-0 z-50 bg-background/80 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-3 sm:px-6 py-2.5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold text-base sm:text-lg">Gemba Walk</span>
          </div>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm hidden sm:inline" data-testid="text-username">
              {user.firstName || user.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 pb-6">
        <Tabs defaultValue="new" className="space-y-4">
          <TabsList className="w-full grid grid-cols-3 sticky top-[53px] z-40">
            <TabsTrigger value="new" data-testid="tab-new-gemba" className="gap-1.5 text-xs sm:text-sm py-2.5">
              <Plus className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Nuevo Gemba</span>
              <span className="sm:hidden">Nuevo</span>
            </TabsTrigger>
            <TabsTrigger value="findings" data-testid="tab-findings" className="gap-1.5 text-xs sm:text-sm py-2.5">
              <ListChecks className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Hallazgos</span>
              <span className="sm:hidden">Hallazgos</span>
            </TabsTrigger>
            <TabsTrigger value="followup" data-testid="tab-followup" className="gap-1.5 text-xs sm:text-sm py-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0" />
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
