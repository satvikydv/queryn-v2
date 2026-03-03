"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import useProject from '@/hooks/use-project'
import useRefetch from '@/hooks/use-refetch'
import { readStreamableValue } from 'ai/rsc'
import { BookmarkIcon, BotIcon, Loader2, SparklesIcon, XIcon } from 'lucide-react'
import MDEditor from '@uiw/react-md-editor'
import React from 'react'
import { toast } from 'sonner'
import { api } from '@/trpc/react'
import CodeReferences from './code-references'
import { askQuestion } from './actions'
import * as DialogPrimitive from '@radix-ui/react-dialog'

function AskQuestionCard() {
    const { project } = useProject()
    const [question, setQuestion] = React.useState('')
    const [open, setOpen] = React.useState(false)
    const [loading, setLoading] = React.useState(false)
    const [filesReferences, setFilesReferences] = React.useState<{ fileName: string; sourceCode: string; summary: string }[]>([])
    const [answer, setAnswer] = React.useState('')
    const saveAnswer = api.project.saveAnswer.useMutation()
    const refetch = useRefetch()

    const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault()
        if (!project?.id) return
        setAnswer('')
        setFilesReferences([])
        setLoading(true)

        const { output, filesReferences } = await askQuestion(question, project.id)
        setFilesReferences(filesReferences)
        setOpen(true)

        for await (const delta of readStreamableValue(output)) {
            if (delta) setAnswer(ans => ans + delta)
        }
        setLoading(false)
    }

    return (
        <>
            <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
                <DialogPrimitive.Portal>
                    {/* Overlay */}
                    <DialogPrimitive.Overlay
                        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
                    />
                    {/* Content */}
                    <DialogPrimitive.Content
                        style={{
                            position: 'fixed',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            width: '95vw',
                            maxWidth: '1200px',
                            height: '85vh',
                            zIndex: 50,
                        }}
                        className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950 shadow-2xl shadow-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                    >
                        {/* Header */}
                        <div
                            className="relative flex-shrink-0 border-b border-zinc-800/60 px-6 py-4"
                            style={{ background: 'linear-gradient(to right, rgba(59,130,246,0.06), transparent)' }}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="flex size-8 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
                                        <BotIcon className="size-4 text-blue-400" />
                                    </div>
                                    <DialogPrimitive.Title className="text-[15px] font-semibold tracking-tight text-zinc-100">
                                        Code Analysis
                                    </DialogPrimitive.Title>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={saveAnswer.isPending}
                                        className="h-8 gap-1.5 rounded-lg border-zinc-700/60 bg-zinc-900/60 text-xs text-zinc-300 transition-all hover:border-blue-500/40 hover:bg-blue-500/10 hover:text-blue-300"
                                        onClick={() => {
                                            saveAnswer.mutate(
                                                { projectId: project!.id, question, answer, filesReferences },
                                                {
                                                    onSuccess: () => { toast.success('Answer saved!'); refetch() },
                                                    onError: (err) => toast.error(`Save failed: ${err.message}`),
                                                }
                                            )
                                        }}
                                    >
                                        <BookmarkIcon className="size-3.5" />
                                        Save
                                    </Button>
                                    <DialogPrimitive.Close className="flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
                                        <XIcon className="size-4" />
                                        <span className="sr-only">Close</span>
                                    </DialogPrimitive.Close>
                                </div>
                            </div>
                            {question && (
                                <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-zinc-900/60 px-3 py-2 ring-1 ring-zinc-800/60">
                                    <span className="mt-px shrink-0 text-[11px] font-bold uppercase tracking-wider text-blue-400">Q</span>
                                    <p className="line-clamp-2 text-[13px] leading-relaxed text-zinc-400">{question}</p>
                                </div>
                            )}
                        </div>

                        {/* Two-column body */}
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            {/* Left — answer */}
                            <div className="flex w-[45%] flex-shrink-0 flex-col overflow-hidden border-r border-zinc-800/50">
                                <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                                    <div className="size-1.5 rounded-full bg-blue-400"></div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Answer</p>
                                </div>
                                <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5" data-color-mode="dark">
                                    {loading && !answer ? (
                                        <div className="flex items-center gap-2.5 py-8">
                                            <div className="relative flex size-8 items-center justify-center">
                                                <div className="absolute inset-0 animate-ping rounded-full bg-blue-500/20"></div>
                                                <Loader2 className="size-4 animate-spin text-blue-400" />
                                            </div>
                                            <span className="text-sm text-zinc-500">Analyzing your codebase…</span>
                                        </div>
                                    ) : (
                                        <MDEditor.Markdown
                                            source={answer || ''}
                                            className="!bg-transparent prose dark:prose-invert prose-sm max-w-none
                                                prose-headings:text-sm prose-headings:font-semibold prose-headings:text-zinc-200
                                                prose-p:text-[13px] prose-p:leading-relaxed prose-p:text-zinc-300
                                                prose-code:rounded prose-code:bg-zinc-800/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12px] prose-code:text-blue-300
                                                prose-pre:rounded-lg prose-pre:text-[12px] prose-pre:border prose-pre:border-zinc-800/50
                                                prose-li:text-[13px] prose-li:text-zinc-300
                                                prose-strong:text-zinc-200
                                                prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline"
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Right — file references */}
                            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                                <div className="flex items-center gap-2 px-5 pt-4 pb-2">
                                    <div className="size-1.5 rounded-full bg-emerald-400"></div>
                                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                                        File References
                                    </p>
                                    {filesReferences.length > 0 && (
                                        <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                                            {filesReferences.length}
                                        </span>
                                    )}
                                </div>
                                <div className="min-h-0 flex-1 overflow-hidden px-5 pb-5">
                                    <CodeReferences filesReferences={filesReferences} />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div
                            className="flex items-center justify-between border-t border-zinc-800/50 px-6 py-3"
                            style={{ background: 'linear-gradient(to right, rgba(59,130,246,0.03), transparent)' }}
                        >
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 rounded-lg text-xs text-zinc-400 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
                                onClick={() => setOpen(false)}
                            >
                                Close
                                <kbd className="ml-1 rounded bg-zinc-800/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 ring-1 ring-zinc-700/50">Esc</kbd>
                            </Button>
                            {loading && (
                                <div className="flex items-center gap-2 text-xs text-zinc-500">
                                    <Loader2 className="size-3 animate-spin text-blue-400" />
                                    Streaming response…
                                </div>
                            )}
                        </div>
                    </DialogPrimitive.Content>
                </DialogPrimitive.Portal>
            </DialogPrimitive.Root>

            <Card className="group relative col-span-2 overflow-hidden border-zinc-800/60 bg-zinc-950 transition-all duration-300 hover:border-zinc-700/80 hover:shadow-lg hover:shadow-black/20">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/[0.03] to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
                        <SparklesIcon className="size-4 text-blue-400" />
                        Ask a Question
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-3">
                        <Textarea
                            placeholder="Ask anything about your codebase…"
                            value={question}
                            onChange={e => setQuestion(e.target.value)}
                            className="min-h-[80px] resize-none rounded-lg border-zinc-800/60 bg-zinc-900/50 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500/40 focus:ring-blue-500/20"
                        />
                        <Button
                            type="submit"
                            size="sm"
                            disabled={loading}
                            className="gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-5 text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/30 disabled:opacity-50"
                        >
                            {loading && <Loader2 className="size-3.5 animate-spin" />}
                            {loading ? 'Thinking…' : 'Ask'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </>
    )
}

export default AskQuestionCard