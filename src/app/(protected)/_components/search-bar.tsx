"use client"

import React from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { api } from "@/trpc/react"
import useProject from "@/hooks/use-project"

function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = React.useState(value)
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debouncedValue
}

export function SearchBar() {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const debouncedQuery = useDebounce(query)
  const router = useRouter()
  const { setProjectId } = useProject()

  // Only fire query when there's at least 2 chars
  const { data, isFetching } = api.project.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 },
  )

  // Ctrl+K / Cmd+K shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [])

  function selectProject(id: string) {
    setProjectId(id)
    router.push("/dashboard")
    setOpen(false)
    setQuery("")
  }

  function selectQuestion(projectId: string) {
    setProjectId(projectId)
    router.push("/qa")
    setOpen(false)
    setQuery("")
  }

  const hasResults =
    (data?.projects?.length ?? 0) > 0 || (data?.questions?.length ?? 0) > 0

  return (
    <>
      {/* Trigger: looks like a normal search input */}
      <div
        className="relative w-full max-w-sm cursor-pointer"
        onClick={() => setOpen(true)}
      >
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          readOnly
          type="search"
          placeholder="Search projects & Q&A… (⌘K)"
          className="w-full bg-background pl-8 focus-visible:ring-1 cursor-pointer"
        />
      </div>

      {/* Command dialog */}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput
          placeholder="Search projects and Q&A history…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {!isFetching && debouncedQuery.length >= 2 && !hasResults && (
            <CommandEmpty>No results found.</CommandEmpty>
          )}

          {(data?.projects?.length ?? 0) > 0 && (
            <CommandGroup heading="Projects">
              {data!.projects.map((p) => (
                <CommandItem
                  key={p.id}
                  value={`project-${p.id}`}
                  onSelect={() => selectProject(p.id)}
                >
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                  <span>{p.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground truncate max-w-[160px]">
                    {p.githubUrl.replace("https://github.com/", "")}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {(data?.projects?.length ?? 0) > 0 &&
            (data?.questions?.length ?? 0) > 0 && <CommandSeparator />}

          {(data?.questions?.length ?? 0) > 0 && (
            <CommandGroup heading="Q&A History">
              {data!.questions.map((q) => (
                <CommandItem
                  key={q.id}
                  value={`qa-${q.id}`}
                  onSelect={() => selectQuestion(q.projectId)}
                >
                  <Search className="mr-2 h-4 w-4 opacity-50" />
                  <span className="truncate">{q.question}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  )
}
