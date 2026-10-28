import { useEffect, useState } from 'react'
import { Link2, MessageSquare, PanelRightClose } from 'lucide-react'
import type { NoteIndexEntry, VaultState } from '@shared/types'
import { typeColor } from '@shared/types'
import type { AppActions } from '../App'
import { api } from '../lib/util'
import { cn } from '@/lib/utils'
import { isAttachment } from '@shared/markdown'
import { Button } from './ui/button'
import { ScrollArea } from './ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import ChatPanel from './ChatPanel'

interface Props {
  current: string | null
  vault: VaultState
  names: Map<string, string>
  actions: AppActions
  onClose(): void
}

export default function RightPanel({ current, vault, names, actions, onClose }: Props) {
  return (
    <aside className="flex w-[380px] min-h-0 flex-col border-l border-sidebar-border bg-sidebar pt-8">
      <Tabs defaultValue="chat" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="flex items-center gap-2 border-b px-2 pb-2">
          <TabsList className="h-8">
            <TabsTrigger value="chat" className="text-xs">
              <MessageSquare /> Chat
            </TabsTrigger>
            <TabsTrigger value="links" className="text-xs">
              <Link2 /> Links
            </TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          <Button variant="ghost" size="icon" className="size-7" title="Close panel" onClick={onClose}>
            <PanelRightClose />
          </Button>
        </div>
        {/* forceMount: el chat se mantiene montado para no perder la conversación al cambiar de pestaña. */}
        <TabsContent value="chat" forceMount className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden">
          <ChatPanel current={current} names={names} actions={actions} />
        </TabsContent>
        <TabsContent value="links" className="min-h-0 flex-1">
          <Links current={current} vault={vault} names={names} actions={actions} />
        </TabsContent>
      </Tabs>
    </aside>
  )
}

function Links({ current, vault, names, actions }: Omit<Props, 'onClose'>) {
  const [backlinks, setBacklinks] = useState<NoteIndexEntry[]>([])
  const entry = vault.index.find((e) => e.path === current)
  const outgoing = (entry?.links ?? []).filter((l) => !isAttachment(l))

  useEffect(() => {
    if (current) api.notes.backlinks(current).then(setBacklinks)
    else setBacklinks([])
  }, [current, vault])

  if (!current) return <div className="p-4 text-sm text-muted-foreground">Open a note to see its links.</div>

  const heading = 'mt-3 mb-1.5 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'
  const item = 'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-sidebar-accent'

  return (
    <ScrollArea className="h-full px-2">
      <h4 className={heading}>Backlinks ({backlinks.length})</h4>
      {backlinks.map((b) => (
        <button key={b.path} className={item} onClick={() => actions.openNote(b.path)}>
          <span className="size-1.5 rounded-full" style={{ background: typeColor(b.type) }} />
          {b.title}
        </button>
      ))}
      <h4 className={heading}>Outgoing links ({outgoing.length})</h4>
      {outgoing.map((l) => {
        const exists = names.has(l.toLowerCase())
        return (
          <button key={l} className={cn(item, !exists && 'text-muted-foreground')} onClick={() => actions.openLink(l)}>
            {l}
            {!exists && <span className="text-xs"> (create)</span>}
          </button>
        )
      })}
    </ScrollArea>
  )
}
