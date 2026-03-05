"use client"

import React from "react"
import { api } from "@/trpc/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
import { CalendarIcon, ClockIcon, LinkIcon } from "lucide-react"
import MDEditor from "@uiw/react-md-editor"

interface MeetingDetailDialogProps {
  sessionId: string | null
  open: boolean
  onClose: () => void
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

export default function MeetingDetailDialog({
  sessionId,
  open,
  onClose,
}: MeetingDetailDialogProps) {
  const { data: session, isLoading } = api.meeting.getMeeting.useQuery(
    { sessionId: sessionId! },
    { enabled: !!sessionId && open },
  )

  const summary = session?.summary as
    | {
        summary?: string
        actionItems?: string[]
        decisions?: string[]
        keyPoints?: string[]
      }
    | null
    | undefined

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b">
          {isLoading ? (
            <Skeleton className="h-6 w-48" />
          ) : (
            <>
              <DialogTitle className="text-lg font-semibold leading-tight">
                {session?.title ?? "Meeting Recording"}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                {session?.createdAt && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3" />
                    {formatDate(session.createdAt)}
                  </span>
                )}
                {session?.duration && (
                  <span className="flex items-center gap-1">
                    <ClockIcon className="w-3 h-3" />
                    {formatDuration(session.duration)}
                  </span>
                )}
                {session?.meetingUrl && (
                  <a
                    href={session.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    <LinkIcon className="w-3 h-3" />
                    Meeting link
                  </a>
                )}
                <Badge
                  variant={
                    session?.status === "COMPLETED"
                      ? "default"
                      : session?.status === "FAILED"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-xs"
                >
                  {session?.status}
                </Badge>
              </div>
            </>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="p-6 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ) : (
            <Tabs defaultValue="summary" className="flex flex-col h-full">
              <TabsList className="mx-6 mt-3 mb-0 w-fit">
                <TabsTrigger value="summary">Summary</TabsTrigger>
                <TabsTrigger value="actions">Action Items</TabsTrigger>
                <TabsTrigger value="transcript">Transcript</TabsTrigger>
              </TabsList>

              {/* Summary Tab */}
              <TabsContent value="summary" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-[calc(85vh-180px)] px-6 py-4">
                  {summary?.summary ? (
                    <div data-color-mode="light" className="prose prose-sm max-w-none">
                      <MDEditor.Markdown source={summary.summary} />
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      No summary available.
                    </p>
                  )}
                  {summary?.keyPoints && summary.keyPoints.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold mb-2">Key Points</h4>
                      <ul className="space-y-1">
                        {summary.keyPoints.map((point, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Action Items Tab */}
              <TabsContent value="actions" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-[calc(85vh-180px)] px-6 py-4 space-y-6">
                  {summary?.actionItems && summary.actionItems.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-semibold mb-3">Action Items</h4>
                      <ul className="space-y-2">
                        {summary.actionItems.map((item, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <Checkbox id={`action-${i}`} className="mt-0.5" />
                            <label
                              htmlFor={`action-${i}`}
                              className="text-sm cursor-pointer leading-snug"
                            >
                              {item}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      No action items recorded.
                    </p>
                  )}
                  {summary?.decisions && summary.decisions.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-sm font-semibold mb-3">Decisions</h4>
                      <ul className="space-y-2">
                        {summary.decisions.map((decision, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2 p-2 rounded-md bg-muted/50 text-sm"
                          >
                            <span className="text-primary font-bold">→</span>
                            {decision}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </ScrollArea>
              </TabsContent>

              {/* Transcript Tab */}
              <TabsContent value="transcript" className="flex-1 overflow-hidden mt-0">
                <ScrollArea className="h-[calc(85vh-180px)] px-6 py-4">
                  {session?.transcript ? (
                    <pre className="text-xs leading-relaxed whitespace-pre-wrap font-mono text-muted-foreground">
                      {session.transcript}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-sm italic">
                      No transcript available.
                    </p>
                  )}
                </ScrollArea>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
