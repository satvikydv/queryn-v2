"use client";

import {
  LayoutDashboard,
  MessageSquareText,
  Video,
  CreditCard,
  PlusCircle,
  Github,
  Folder,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import useProject from "@/hooks/use-project";
import { Skeleton } from "@/components/ui/skeleton";

// Navigation items
const mainNavItems = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    href: "/dashboard",
  },
  {
    title: "Q&A",
    icon: MessageSquareText,
    href: "/qa",
  },
  {
    title: "Meetings",
    icon: Video,
    href: "/meetings",
  },
  {
    title: "Billing",
    icon: CreditCard,
    href: "/billing",
  },
];


function AppSidebar() {
  const pathname = usePathname();
  const { open } = useSidebar();
  const { projects, projectId, setProjectId, isLoading } = useProject(); //from the useProject hook that gets the projects from the server

  return (
    <Sidebar collapsible="icon" variant="floating">
      <SidebarHeader>
        <div
          className={cn(
            "p-4",
            open ? "flex items-center gap-2" : "flex justify-center",
          )}
        >
          <Github className="h-5 w-5" />
          {open && <h1 className="text-lg font-bold">Queryn</h1>}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main Navigation */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            {mainNavItems.map(({ title, icon: Icon, href }) => {
              const isActive = pathname === href;

              return (
                <SidebarMenuItem key={title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={title}
                    className={cn(isActive && "bg-black text-white")}
                  >
                    <Link href={href} className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span>{title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        {/* Projects Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Your Projects</SidebarGroupLabel>
          <SidebarMenu>
            {isLoading ? (
              [1, 2, 3].map((i) => (
                <SidebarMenuItem key={`skeleton-${i}`}>
                  <SidebarMenuButton asChild>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center bg-white text-primary rounded-sm">
                        <Skeleton className="h-4 w-4" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            ) : (
              projects?.map((project) => (
                <SidebarMenuItem key={project.name}>
                  <SidebarMenuButton asChild tooltip={project.name}>
                    <div onClick={() => setProjectId(project.id)}>
                      <div className={cn("flex items-center justify-center bg-white text-primary rounded-sm",
                        {
                          'bg-primary text-white': project.id === projectId
                        }
                      )}>
                        <Folder className="h-4 w-4" />
                      </div>
                      <span>{project.name}</span>
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {open && (<SidebarFooter>
        <div className="p-2">
          <Link href="/create-project">
            <Button className="w-full justify-start" size="lg">
              <PlusCircle className="mr-2 h-4 w-4" />
              Create Project
            </Button>
          </Link>
        </div>
      </SidebarFooter>)}

      <SidebarRail />
    </Sidebar>
  );
}

export default AppSidebar;
