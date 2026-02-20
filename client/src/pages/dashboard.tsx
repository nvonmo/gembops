import { useAuth } from "@/hooks/use-auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, ListChecks, AlertTriangle, Settings, Users, BarChart3, Calendar, Tag } from "lucide-react";
import NewGembaTab from "@/components/new-gemba-tab";
import FindingsTab from "@/components/findings-tab";
import FollowUpTab from "@/components/follow-up-tab";
import AnalyticsTab from "@/components/analytics-tab";
import AdminAreasTab from "@/components/admin-areas-tab";
import AdminUsersTab from "@/components/admin-users-tab";
import AdminCategoriesTab from "@/components/admin-categories-tab";
import { NotificationsDropdown } from "@/components/notifications-dropdown";

export default function Dashboard() {
  const { user, logout } = useAuth();

  if (!user) return null;

  const initials = (user.firstName?.[0] || user.username[0] || "U").toUpperCase();

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-primary shadow-md">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 px-3 sm:px-6 py-1.5">
          <div className="flex items-center">
            <span className="flex items-center justify-center shrink-0">
              <img
                src="/logo-g.png"
                alt="Gembops"
                className="object-contain w-11 h-11 sm:w-12 sm:h-12"
                width={48}
                height={48}
              />
            </span>
          </div>
          <div className="flex items-center gap-2 text-primary-foreground">
            <NotificationsDropdown />
            <Avatar className="h-8 w-8 ring-2 ring-primary-foreground/30">
              <AvatarFallback className="text-xs bg-primary-foreground/15 text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-sm hidden sm:inline font-medium" data-testid="text-username">
              {user.firstName || user.username}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logout()}
              data-testid="button-logout"
              className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-6 py-4 pb-6">
        <Tabs defaultValue="gemba-walks" className="space-y-4">
          <TabsList
            className={
              "w-full sticky top-[53px] z-40 flex items-center justify-start overflow-x-auto overflow-y-hidden rounded-lg border-2 border-primary/20 bg-muted p-1.5 gap-1 min-h-[44px] shadow-sm " +
              "sm:grid sm:justify-stretch sm:overflow-hidden sm:min-h-[2.75rem] sm:items-stretch " +
              (user.role === "admin" ? "sm:grid-cols-6" : "sm:grid-cols-4")
            }
          >
            <TabsTrigger value="gemba-walks" data-testid="tab-gemba-walks" className="flex-shrink-0 min-w-[4.5rem] gap-1.5 text-xs sm:text-sm py-2.5 sm:min-w-0 sm:min-h-0 sm:py-2 sm:rounded-md">
              <Calendar className="h-4 w-4 shrink-0" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="findings" data-testid="tab-findings" className="flex-shrink-0 min-w-[4.5rem] gap-1.5 text-xs sm:text-sm py-2.5 sm:min-w-0 sm:min-h-0 sm:py-2 sm:rounded-md">
              <ListChecks className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Hallazgos</span>
              <span className="sm:hidden">Hallazgos</span>
            </TabsTrigger>
            <TabsTrigger value="followup" data-testid="tab-followup" className="flex-shrink-0 min-w-[4.5rem] gap-1.5 text-xs sm:text-sm py-2.5 sm:min-w-0 sm:min-h-0 sm:py-2 sm:rounded-md">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Seguimiento</span>
              <span className="sm:hidden">Seguir</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics" className="flex-shrink-0 min-w-[4.5rem] gap-1.5 text-xs sm:text-sm py-2.5 sm:min-w-0 sm:min-h-0 sm:py-2 sm:rounded-md">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Analytics</span>
              <span className="sm:hidden">Stats</span>
            </TabsTrigger>
            {user.role === "admin" && (
              <TabsTrigger value="admin" data-testid="tab-admin" className="flex-shrink-0 min-w-[4.5rem] gap-1.5 text-xs sm:text-sm py-2.5 sm:min-w-0 sm:min-h-0 sm:py-2 sm:rounded-md">
                <Settings className="h-4 w-4 shrink-0" />
                <span className="hidden sm:inline">Admin</span>
                <span className="sm:hidden">Admin</span>
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="gemba-walks">
            <NewGembaTab userId={user.id} />
          </TabsContent>
          <TabsContent value="findings">
            <FindingsTab />
          </TabsContent>
          <TabsContent value="followup">
            <FollowUpTab />
          </TabsContent>
          <TabsContent value="analytics">
            <AnalyticsTab />
          </TabsContent>
          {user.role === "admin" && (
            <TabsContent value="admin">
              <Tabs defaultValue="areas" className="space-y-4">
                <TabsList className="w-full grid grid-cols-3">
                  <TabsTrigger value="areas" className="gap-1.5 text-xs sm:text-sm py-2.5">
                    <Settings className="h-4 w-4 shrink-0" />
                    <span>Areas</span>
                  </TabsTrigger>
                  <TabsTrigger value="categories" className="gap-1.5 text-xs sm:text-sm py-2.5">
                    <Tag className="h-4 w-4 shrink-0" />
                    <span>Categorías</span>
                  </TabsTrigger>
                  <TabsTrigger value="users" className="gap-1.5 text-xs sm:text-sm py-2.5">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>Usuarios</span>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="areas">
                  <AdminAreasTab />
                </TabsContent>
                <TabsContent value="categories">
                  <AdminCategoriesTab />
                </TabsContent>
                <TabsContent value="users">
                  <AdminUsersTab />
                </TabsContent>
              </Tabs>
            </TabsContent>
          )}
        </Tabs>
      </main>
    </div>
  );
}
