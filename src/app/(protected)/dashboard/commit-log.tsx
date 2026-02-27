"use client"

import useProject from '@/hooks/use-project'
import { api } from '@/trpc/react'
import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'

const CommitLog = () => {
    const {projectId, project} = useProject()
    const { data: commits, isLoading } = api.project.getCommits.useQuery({ projectId })
    
  return (
    <>
        <ul className='space-y-6'>
            {isLoading ? (
                [1,2,3].map((i) => (
                    <li key={`skeleton-${i}`} className='relative flex gap-x-4'>
                        <div className={cn(
                            'h-6',
                            'absolute left-0 top-0 w-6 flex justify-center'
                        )}>
                            <div className="w-px translate-x-1 bg-gray-200"></div>
                        </div>
                        <>
                            <Skeleton className='h-8 w-8 rounded-full' />
                            <div className="flex-auto rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200">
                                <div className="flex justify-between gap-x-4">
                                    <div className='py-0.5 text-xs leading-5'>
                                        <Skeleton className='h-4 w-24' />
                                    </div>
                                </div>
                                <div className='font-semibold mt-2'>
                                    <Skeleton className='h-5 w-40' />
                                </div>
                                <div className='mt-2'>
                                    <Skeleton className='h-3 w-full' />
                                    <div className='mt-1'><Skeleton className='h-3 w-5/6' /></div>
                                </div>
                            </div>
                        </>
                    </li>
                ))
            ) : !commits || commits.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                    <p>No commits found for this project.</p>
                    <p className="text-sm mt-2">Commits may still be processing, or there might be an issue fetching commits from the repository.</p>
                </div>
            ) : (
            commits?.map((commit, commitIdx) => {
                return <li key={commit.id} className='relative flex gap-x-4'>
                    <div className={cn(
                        commitIdx === commits.length - 1 ? 'h-6' : '-bottom-6',
                        'absolute left-0 top-0 w-6 flex justify-center'
                    )}>
                        <div className="w-px translate-x-1 bg-gray-200"></div>
                    </div>
                    <>
                        <img src={commit.commitAuthorAvatar} alt={commit.commitAuthorName} className='relative flex-none size-6 rounded-full bg-gray-50' />
                        <div className="flex-auto rounded-md bg-white p-3 ring-1 ring-inset ring-gray-200">
                            <div className="flex justify-between gap-x-4">
                                <Link target='_blank' href={`${project?.githubUrl}/commits/${commit.commitHash}`} className='py-0.5 text-xs leading-5 text-gray-600'>
                                    <span className='font-medium text-gray-900'>
                                        {commit.commitAuthorName}
                                    </span>{" "}
                                    <span className='inline-flex items-center'>
                                        commited <ExternalLink className='ml-1 size-4' />
                                    </span>                                        
                                </Link>
                            </div>
                            <span className='font-semibold'>
                                {commit.commitMessage}
                            </span>
                            <pre className='mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700'>
                                {commit.summary || "No summary available"}
                            </pre>
                        </div>
                    </>
                </li>
            }))}
        </ul>
    </>
  )
}

export default CommitLog