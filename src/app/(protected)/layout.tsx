import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar"
import { UserButton } from "@clerk/nextjs"
import type React from "react"
import AppSidebar from "./app-sidebar"
import { Separator } from "@/components/ui/separator"
import { SearchBar } from "./_components/search-bar"

type Props = {
  children: React.ReactNode
}

function SidebarLayout({ children }: Props) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="bg-background">
        <header className="flex h-16 items-center gap-4 border-b bg-background px-6">
          <SidebarTrigger className="-ml-2" />
          <Separator orientation="vertical" className="h-6" />
          <SearchBar />
          <div className="ml-auto flex items-center gap-2">
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <main className="flex-1 p-6 min-h-[calc(100vh-4rem)]">
          <div className="rounded-lg border bg-card shadow-sm">
            <div className="p-6">{children}</div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default SidebarLayout
