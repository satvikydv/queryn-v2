"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { VideoIcon } from "lucide-react"

const MeetingCard = () => {
  return (
    <Card className="col-span-2 flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <VideoIcon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Start a Meeting
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          Let the AI bot join your Google Meet and transcribe it in real-time.
        </p>
      </div>
      <Button asChild size="sm" className="mt-1">
        <Link href="/meetings">Go to Meetings</Link>
      </Button>
    </Card>
  )
}

export default MeetingCard
