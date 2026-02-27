"use client"

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DialogHeader, Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import useProject from '@/hooks/use-project'
import { GithubIcon } from 'lucide-react'
import React from 'react'
import { askQuestion } from './actions'
import { readStreamableValue } from 'ai/rsc'
import MDEditor from '@uiw/react-md-editor'
import CodeReferences from './code-references'
import { api } from '@/trpc/react'
import { on } from 'events'
import { toast } from 'sonner'
import useRefetch from '@/hooks/use-refetch'

function AskQuestionCard() {
    const {project} = useProject()
    const [question, setQuestion] = React.useState('')
    const [open, setOpen] = React.useState(false)
    const [ loading, setLoading ] = React.useState(false)
    const [filesReferences, setFilesReferences] = React.useState<{fileName: string; sourceCode: string; summary: string}[]>([])
    const [answer, setAnswer] = React.useState('')
    const saveAnswer = api.project.saveAnswer.useMutation()


    const onSubmit = async (e : React.FormEvent<HTMLFormElement>) => {
      setAnswer('')
      setFilesReferences([])
        if(!project?.id) return
        e.preventDefault()
        // window.alert(question)
        setLoading(true)

        const {output, filesReferences} = await askQuestion(question, project.id)
        setFilesReferences(filesReferences)
        setOpen(true)

        for await (const delta of readStreamableValue(output)){
          if(delta){
            setAnswer(ans => ans + delta)
          }
        }
        setLoading(false)
    }

    const refetch = useRefetch()

  
return (
  <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className='sm:max-w-[80vw] max-h-[90vh] flex flex-col'>
        <DialogHeader>
          <div className='flex items-center gap-2'>
            <DialogTitle>
              <GithubIcon className='size-5 mr-2 inline-block' />
              Code Analysis Results
            </DialogTitle>

            <Button disabled={saveAnswer.isPending} variant={"outline"} onClick={() => {
              saveAnswer.mutate({
                projectId: project!.id,
                question,
                answer,
                filesReferences
              }, {
                onSuccess: () => {
                  // Handle successful save
                  toast.success('Answer saved successfully!')
                  refetch()
                },
                onError: (error) => {
                  // Handle error
                  toast.error(`Failed to save answer: ${error.message}`)
                }
              })
            }}> Save Answer </Button>
          </div>
        </DialogHeader>

        {/* Scrollable content area */}
        <div className='flex-1 overflow-hidden flex flex-col min-h-0'>
          {/* Answer section */}
          <div className='mb-4'>
            <MDEditor.Markdown
              source={answer}
              className="
                max-h-[25vh]
                overflow-auto
                rounded-md
                p-4
                bg-muted
                border
                border-border
                shadow-sm
                prose
                dark:prose-invert
                prose-code:bg-muted/50
                prose-code:px-1
                prose-code:py-0.5
                prose-code:rounded
                prose-code:text-sm
                text-sm
              "
            />
          </div>
          
          {/* Code references section */}
          <div className='flex-1 min-h-0'>
            <h3 className='text-lg font-semibold mb-2'>File References</h3>
            <CodeReferences filesReferences={filesReferences} />
          </div>
        </div>

        {/* Fixed footer */}
        <div className='pt-4 border-t'>
          <Button type='button' onClick={()=>{setOpen(false)}}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    
    <Card className='relative col-span-2'>
      <CardHeader>
        <CardTitle>
          Ask a Question
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit}>
          <Textarea placeholder="Ask a question about your project..." value={question} onChange={e => setQuestion(e.target.value)} />
          <div className="h-4"></div>
          <Button type='submit' disabled={loading} >
            Ask
          </Button>
        </form>
      </CardContent>
    </Card>
  </>
)
}

export default AskQuestionCard