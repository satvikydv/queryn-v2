'use client'

import { cn } from '@/lib/utils'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import React from 'react'

type Props = {
    filesReferences: { fileName: string; sourceCode: string; summary: string }[]
}

function shortName(path: string) {
    const parts = path.split('/')
    return parts[parts.length - 1] ?? path
}

const CodeReferences = ({ filesReferences }: Props) => {
    const [tab, setTab] = React.useState(filesReferences[0]?.fileName)

    if (filesReferences.length === 0)
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-zinc-600">No file references found.</p>
            </div>
        )

    return (
        <div className="flex h-full flex-col gap-2.5">
            {/* Sleek tab bar */}
            <div className="flex gap-1 overflow-x-auto rounded-lg bg-zinc-900/80 p-1 ring-1 ring-zinc-800/50" style={{ backdropFilter: 'blur(8px)' }}>
                {filesReferences.map(file => (
                    <button
                        key={file.fileName}
                        onClick={() => setTab(file.fileName)}
                        title={file.fileName}
                        className={cn(
                            'relative flex-shrink-0 rounded-md px-3 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all duration-200',
                            tab === file.fileName
                                ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-500/25'
                                : 'text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-300'
                        )}
                    >
                        {shortName(file.fileName)}
                    </button>
                ))}
            </div>

            {/* Code panel */}
            <div className="min-h-0 flex-1 overflow-auto rounded-lg ring-1 ring-zinc-800/50">
                {filesReferences.map(file => (
                    <div key={file.fileName} style={{ display: tab === file.fileName ? 'block' : 'none' }}>
                        <SyntaxHighlighter
                            language="python"
                            style={vscDarkPlus}
                            customStyle={{
                                margin: 0,
                                fontSize: '12px',
                                lineHeight: '1.6',
                                background: '#0d1117',
                                borderRadius: '0.5rem',
                                padding: '1rem',
                                minHeight: '100%',
                            }}
                            wrapLongLines={false}
                        >
                            {file.sourceCode}
                        </SyntaxHighlighter>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default CodeReferences