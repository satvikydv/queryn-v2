"use client"

import React from "react"
import { api } from "@/trpc/react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  CalendarIcon,
  ClockIcon,
  Loader2,
  TrashIcon,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"
import MeetingDetailDialog from "./meeting-detail-dialog"

interface MeetingListProps {
  projectId: string
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString(undefined, {
    dateStyle: "medium",
  })
}

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  SCHEDULED: { label: "Scheduled", variant: "secondary" },
  IN_PROGRESS: { label: "In Progress", variant: "outline" },
  COMPLETED: { label: "Completed", variant: "default" },
  FAILED: { label: "Failed", variant: "destructive" },
}

export default function MeetingList({ projectId }: MeetingListProps) {
  const { data: meetings, isLoading, refetch } = api.meeting.getMeetings.useQuery(
    { projectId },
    { refetchInterval: 5000 }, // poll every 5s to catch in-progress completions
  )
  const deleteMutation = api.meeting.deleteMeeting.useMutation({
    onSuccess: () => {
      toast.success("Meeting deleted")
      void refetch()
    },
    onError: (e) => toast.error(e.message),
  })

  const [detailSessionId, setDetailSessionId] = React.useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (!meetings || meetings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
        <VideoIcon className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">No meetings recorded yet.</p>
        <p className="text-xs mt-1">Start a meeting above to get started.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {meetings.map((meeting) => {
          const config = STATUS_CONFIG[meeting.status] ?? STATUS_CONFIG.SCHEDULED!
          const isInProgress = meeting.status === "IN_PROGRESS"
          const isCompleted = meeting.status === "COMPLETED"

          return (
            <Card
              key={meeting.id}
              className={`transition-shadow ${isCompleted ? "cursor-pointer hover:shadow-md" : ""}`}
              onClick={() => isCompleted && setDetailSessionId(meeting.id)}
            >
              <CardContent className="flex items-center gap-4 py-4 px-5">
                {/* Icon */}
                <div className="flex-shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center">
                  {isInProgress ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  ) : (
                    <VideoIcon className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">
                    {meeting.title ?? "Untitled Meeting"}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span className="flex items-center gap-1">
                      <CalendarIcon className="w-3 h-3" />
                      {formatDate(meeting.createdAt)}
                    </span>
                    {meeting.duration && (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="w-3 h-3" />
                        {formatDuration(meeting.duration)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Badge + Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Badge variant={config.variant} className="text-xs">
                    {config.label}
                  </Badge>
                  {!isInProgress && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteMutation.mutate({ sessionId: meeting.id })
                      }}
                    >
                      {deleteMutation.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <TrashIcon className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <MeetingDetailDialog
        sessionId={detailSessionId}
        open={!!detailSessionId}
        onClose={() => setDetailSessionId(null)}
      />
    </>
  )
}
