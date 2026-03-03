'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import useProject from '@/hooks/use-project'
import { api } from '@/trpc/react'
import React from 'react'
import AskQuestionCard from '../dashboard/ask-question-card'
import MDEditor from '@uiw/react-md-editor'
import CodeReferences from '../dashboard/code-references'
import { BotIcon, CalendarIcon, FileTextIcon, MessageSquareIcon } from 'lucide-react'

function QApage() {
  const { projectId } = useProject()
  const { data: questions } = api.project.getQuestions.useQuery({ projectId })
  const [questionIndex, setQuestionIndex] = React.useState(0)
  const question = questions?.[questionIndex]

  return (
    <Sheet>
      <AskQuestionCard />
      <div className="h-6"></div>

      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
          <MessageSquareIcon className="size-3.5 text-blue-400" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-100">Saved Questions</h1>
        {questions && questions.length > 0 && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-400">
            {questions.length}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        {questions?.map((q, index) => (
          <React.Fragment key={q.id}>
            <SheetTrigger onClick={() => setQuestionIndex(index)} className="w-full text-left">
              <div className="group flex items-start gap-4 rounded-xl border bg-white p-4 shadow-sm transition-all duration-200 hover:border-gray-300 hover:shadow-md">
                <img
                  className="mt-0.5 size-8 flex-shrink-0 rounded-full ring-2 ring-gray-200"
                  height={32}
                  width={32}
                  src={q.user.imageUrl ?? ''}
                  alt=""
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="line-clamp-1 text-sm font-medium text-gray-800 transition-colors group-hover:text-gray-950">
                      {q.question}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-gray-500">
                    {q.answer}
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <span className="flex items-center gap-1 text-[11px] text-gray-400">
                      <CalendarIcon className="size-3" />
                      {q.createdAt.toLocaleDateString()}
                    </span>
                    {(q.context as any)?.length > 0 && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <FileTextIcon className="size-3" />
                        {(q.context as any).length} files
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </SheetTrigger>
          </React.Fragment>
        ))}

        {questions?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800/60 py-12">
            <MessageSquareIcon className="size-8 text-zinc-700" />
            <p className="mt-3 text-sm text-zinc-600">No saved questions yet.</p>
            <p className="mt-1 text-xs text-zinc-700">Ask a question above and save the answer to see it here.</p>
          </div>
        )}
      </div>

      {question && (
        <SheetContent className="flex flex-col overflow-hidden border-zinc-800/60 bg-zinc-950 sm:max-w-[80vw]">
          {/* Sheet header */}
          <SheetHeader className="flex-shrink-0 border-b border-zinc-800/50 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 ring-1 ring-blue-500/20">
                <BotIcon className="size-4 text-blue-400" />
              </div>
              <SheetTitle className="text-base font-semibold leading-snug text-zinc-100">
                {question.question}
              </SheetTitle>
            </div>
          </SheetHeader>

          {/* Sheet body — two sections stacked */}
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {/* Answer section */}
            <div className="border-b border-zinc-800/40 px-6 py-5" data-color-mode="dark">
              <div className="mb-3 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-blue-400"></div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Answer</p>
              </div>
              <MDEditor.Markdown
                source={question.answer ?? 'Error generating answer'}
                className="!bg-transparent prose dark:prose-invert prose-sm max-w-none
                  prose-headings:text-sm prose-headings:font-semibold prose-headings:text-zinc-200
                  prose-p:text-[13px] prose-p:leading-relaxed prose-p:text-zinc-300
                  prose-code:rounded prose-code:bg-zinc-800/80 prose-code:px-1.5 prose-code:py-0.5 prose-code:text-[12px] prose-code:text-blue-300
                  prose-pre:rounded-lg prose-pre:text-[12px] prose-pre:border prose-pre:border-zinc-800/50
                  prose-li:text-[13px] prose-li:text-zinc-300
                  prose-strong:text-zinc-200
                  prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline"
              />
            </div>

            {/* File references section */}
            <div className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="size-1.5 rounded-full bg-emerald-400"></div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">File References</p>
                {(question.context as any)?.length > 0 && (
                  <span className="ml-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 ring-1 ring-emerald-500/20">
                    {(question.context as any).length}
                  </span>
                )}
              </div>
              <CodeReferences filesReferences={(question.context ?? []) as any} />
            </div>
          </div>
        </SheetContent>
      )}
    </Sheet>
  )
}

export default QApage