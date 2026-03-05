"use client"

import React from "react"
import useProject from "@/hooks/use-project"
import StartMeetingCard from "./start-meeting-card"
import MeetingList from "./meeting-list"
import { VideoIcon } from "lucide-react"

export default function MeetingsPage() {
  const { projectId, project } = useProject()

  if (!projectId || !project) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Select a project to view meetings.
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
          <VideoIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold leading-tight">Meetings</h1>
          <p className="text-xs text-muted-foreground">
            Let the AI bot join and transcribe your Google Meet calls.
          </p>
        </div>
      </div>

      {/* Start new meeting */}
      <StartMeetingCard projectId={projectId} />

      {/* Past meetings */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Past Meetings
        </h2>
        <MeetingList projectId={projectId} />
      </div>
    </div>
  )
}
