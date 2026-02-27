"use client";

import useProject from "@/hooks/use-project";
import { useUser } from "@clerk/nextjs";
import { ExternalLink, Github } from "lucide-react";
import CommitLog from "./commit-log";
import Link from "next/link";

import React from "react";
import AskQuestionCard from "./ask-question-card";
// import MeetingCard from "./meeting-card";
import ArchiveButton from "./archive-button";
import InviteButton from "./invite-button";
import TeamMembers from "./team-members";

function Dashboard() {
  const { project } = useProject();
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-y-4">
        {/* github link */}
        <div className="bg-primary w-fit rounded-md px-4 py-2 text-white">
          <div className="flex items-center">
            <Github className="size-5 text-white" />
            <div className="ml-2">
              <p className="text-sm font-medium text-white">
                This project is linked to{" "}
                <Link
                  href={project?.githubUrl || "#"}
                  target="_blank"
                  className="inline-flex items-center text-white/80 hover:underline"
                >
                  {project?.githubUrl || "No Repository Linked"}
                  <ExternalLink className="ml-1 size-4" />
                </Link>
              </p>
            </div>
          </div>
        </div>

        <div className="h-4"></div>

        <div className="flex items-center gap-4">
          <TeamMembers />
          <ArchiveButton />
          <InviteButton />
        </div>
      </div>

      <div className="mt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <AskQuestionCard /> 
          {/* <MeetingCard /> */}
        </div>
      </div>

      <div className="mt-8"></div>
      <CommitLog />
    </div>
  );
}

export default Dashboard;
