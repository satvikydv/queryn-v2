'use client'

import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import React from 'react'

type Props = {
    filesReferences: { fileName: string; sourceCode: string; summary: string }[];
}

const CodeReferences = ({filesReferences}: Props) => {
  const [tab, setTab] = React.useState(filesReferences[0]?.fileName)
  if(filesReferences.length === 0) return <div>No code references found</div>

  return (
    <div className='w-full'>
        <Tabs value={tab} onValueChange={setTab}>
            {/* Enhanced tab header with dark theme */}
            <div className='overflow-x-auto flex gap-2 bg-slate-900 p-1 rounded-lg mb-3 border border-slate-700'>
                <div className='flex gap-2 min-w-max'>
                    {filesReferences.map(file => (
                        <button 
                            key={file.fileName} 
                            onClick={() => setTab(file.fileName)}
                            className={cn(
                                'px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 whitespace-nowrap flex-shrink-0',
                                {
                                    'bg-blue-600 text-white shadow-md': tab === file.fileName,
                                    'text-slate-300 hover:bg-slate-800 hover:text-white': tab !== file.fileName
                                }
                            )}
                        >
                            {file.fileName}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Enhanced code display with dark theme */}
            {filesReferences.map(file => (
                <TabsContent 
                    key={file.fileName} 
                    value={file.fileName}
                    className='mt-0 w-full'
                >
                    <div className='max-h-[30vh] overflow-auto rounded-lg border border-slate-700 bg-slate-900 shadow-lg'>
                        <SyntaxHighlighter 
                            language='typescript' 
                            style={dark}
                            customStyle={{
                                margin: 0,
                                fontSize: '13px',
                                lineHeight: '1.5',
                                backgroundColor: '#0f172a', // slate-900
                                borderRadius: '0.5rem',
                                padding: '1rem'
                            }}
                            wrapLongLines={true}
                        >
                            {file.sourceCode}
                        </SyntaxHighlighter>
                    </div>
                </TabsContent>
            ))}
        </Tabs>
    </div>
  )
}

export default CodeReferences