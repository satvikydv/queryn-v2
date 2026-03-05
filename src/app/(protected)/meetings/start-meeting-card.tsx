"use client"

import React from "react"
import { useAuth } from "@clerk/nextjs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Loader2,
  MicIcon,
  Square,
  VideoIcon,
} from "lucide-react"
import { toast } from "sonner"
import useRefetch from "@/hooks/use-refetch"

interface StartMeetingCardProps {
  projectId: string
}

type BotStatus =
  | "idle"
  | "starting"
  | "signing_in"
  | "joining"
  | "waiting_for_host"
  | "in_meeting"
  | "stopping"
  | "completed"
  | "error"

interface TranscriptLine {
  text: string
  isFinal: boolean
}

const STATUS_LABELS: Record<BotStatus, string> = {
  idle: "Ready",
  starting: "Starting bot...",
  signing_in: "Signing into Google...",
  joining: "Joining meeting...",
  waiting_for_host: "Waiting for host to admit...",
  in_meeting: "Recording",
  stopping: "Stopping...",
  completed: "Completed",
  error: "Error",
}

export default function StartMeetingCard({ projectId }: StartMeetingCardProps) {
  const { getToken } = useAuth()
  const refetch = useRefetch()

  const [meetingUrl, setMeetingUrl] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [botStatus, setBotStatus] = React.useState<BotStatus>("idle")
  const [sessionId, setSessionId] = React.useState<string | null>(null)
  const [transcript, setTranscript] = React.useState<TranscriptLine[]>([])
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const transcriptEndRef = React.useRef<HTMLDivElement>(null)
  const readerRef = React.useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  const isActive =
    botStatus === "starting" ||
    botStatus === "signing_in" ||
    botStatus === "joining" ||
    botStatus === "waiting_for_host" ||
    botStatus === "in_meeting" ||
    botStatus === "stopping"

  // Auto-scroll transcript
  React.useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [transcript])

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const connectSSE = React.useCallback(
    async (sid: string) => {
      abortRef.current = new AbortController()
      const token = await getToken()

      let response: Response
      try {
        response = await fetch(`/api/meetings/${sid}/stream`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abortRef.current.signal,
        })
      } catch {
        return // aborted
      }

      if (!response.body) return
      readerRef.current = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      const processLine = (line: string) => {
        if (!line.startsWith("data: ")) return
        const raw = line.slice(6).trim()
        if (!raw) return
        try {
          const parsed = JSON.parse(raw) as {
            type: string
            payload?: unknown
            isFinal?: boolean
          }

          if (parsed.type === "status") {
            const p = (parsed.payload as string).toLowerCase()
            if (p.includes("signing")) setBotStatus("signing_in")
            else if (p.includes("joining")) setBotStatus("joining")
            else if (p.includes("waiting")) setBotStatus("waiting_for_host")
            else if (p.includes("meeting") || p.includes("in_meeting")) setBotStatus("in_meeting")
          } else if (parsed.type === "transcript") {
            const text = parsed.payload as string
            const isFinal = !!parsed.isFinal
            setTranscript((prev) => {
              // replace last non-final or append
              if (prev.length > 0 && !prev[prev.length - 1]!.isFinal) {
                return [...prev.slice(0, -1), { text, isFinal }]
              }
              return [...prev, { text, isFinal }]
            })
          } else if (parsed.type === "completed") {
            setBotStatus("completed")
            toast.success("Meeting recording completed!")
            void refetch()
          } else if (parsed.type === "error") {
            setErrorMsg(parsed.payload as string)
            setBotStatus("error")
            toast.error(`Bot error: ${parsed.payload as string}`)
          }
        } catch {
          // ignore parse errors
        }
      }

      try {
        while (true) {
          const { done, value } = await readerRef.current.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""
          for (const line of lines) {
            processLine(line)
          }
        }
      } catch {
        // stream closed or aborted
      }
    },
    [getToken, refetch],
  )

  const handleStart = async () => {
    if (!meetingUrl.trim()) {
      toast.error("Please enter a Google Meet URL")
      return
    }
    if (!meetingUrl.includes("meet.google.com")) {
      toast.error("URL must be a Google Meet link (meet.google.com/...)")
      return
    }

    setBotStatus("starting")
    setTranscript([])
    setErrorMsg(null)

    const token = await getToken()
    let res: Response
    try {
      res = await fetch("/api/meetings/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ meetingUrl, title: title.trim() || undefined, projectId }),
      })
    } catch (e) {
      toast.error("Network error starting meeting")
      setBotStatus("error")
      return
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      toast.error(body.error ?? "Failed to start meeting bot")
      setBotStatus("error")
      return
    }

    const data = (await res.json()) as { sessionId: string }
    setSessionId(data.sessionId)
    setBotStatus("joining")
    void connectSSE(data.sessionId)
  }

  const handleStop = async () => {
    if (!sessionId) return
    setBotStatus("stopping")
    const token = await getToken()
    try {
      await fetch(`/api/meetings/${sessionId}/stop`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
    } catch {
      // ignore
    }
    abortRef.current?.abort()
  }

  const handleReset = () => {
    setBotStatus("idle")
    setSessionId(null)
    setTranscript([])
    setErrorMsg(null)
    setMeetingUrl("")
    setTitle("")
  }

  const showTranscript = transcript.length > 0 || isActive

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <VideoIcon className="w-4 h-4" />
          Join a Meeting
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Form */}
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="meetingUrl">Google Meet URL</Label>
            <Input
              id="meetingUrl"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={meetingUrl}
              onChange={(e) => setMeetingUrl(e.target.value)}
              disabled={isActive || botStatus === "completed"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meetingTitle">
              Title{" "}
              <span className="text-muted-foreground text-xs font-normal">
                (optional)
              </span>
            </Label>
            <Input
              id="meetingTitle"
              placeholder="e.g. Sprint planning"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={isActive || botStatus === "completed"}
            />
          </div>
        </div>

        {/* Status row */}
        {botStatus !== "idle" && (
          <div className="flex items-center gap-2">
            {isActive && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
            )}
            <Badge
              variant={
                botStatus === "completed"
                  ? "default"
                  : botStatus === "error"
                    ? "destructive"
                    : "secondary"
              }
              className="text-xs"
            >
              {STATUS_LABELS[botStatus]}
            </Badge>
            {errorMsg && (
              <p className="text-xs text-destructive truncate max-w-xs">
                {errorMsg}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {botStatus === "idle" && (
            <Button
              onClick={handleStart}
              disabled={!meetingUrl.trim()}
              className="gap-2"
            >
              <MicIcon className="w-4 h-4" />
              Start Recording
            </Button>
          )}
          {isActive && (
            <Button
              variant="destructive"
              onClick={handleStop}
              disabled={botStatus === "stopping"}
              className="gap-2"
            >
              {botStatus === "stopping" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4 fill-current" />
              )}
              Stop Bot
            </Button>
          )}
          {(botStatus === "completed" || botStatus === "error") && (
            <Button variant="outline" onClick={handleReset}>
              New Meeting
            </Button>
          )}
        </div>

        {/* Live transcript */}
        {showTranscript && (
          <>
            <Separator />
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <MicIcon className="w-3 h-3" />
                Live Transcript
              </p>
              <ScrollArea className="h-40 rounded-md border bg-muted/30 p-3">
                {transcript.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    Waiting for speech...
                  </p>
                ) : (
                  <div className="space-y-1">
                    {transcript.map((line, i) => (
                      <p
                        key={i}
                        className={`text-xs leading-relaxed ${
                          line.isFinal
                            ? "text-foreground"
                            : "text-muted-foreground italic"
                        }`}
                      >
                        {line.text}
                      </p>
                    ))}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </ScrollArea>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
