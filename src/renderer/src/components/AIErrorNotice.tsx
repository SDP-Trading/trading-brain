import { Settings } from 'lucide-react'
import { Button } from './ui/button'

/** Errores de IA. Los de configuración ("[config] …") ofrecen abrir Settings. */
export default function AIErrorNotice({ msg, onOpenSettings }: { msg: string; onOpenSettings(): void }) {
  const config = msg.startsWith('[config] ')
  const text = config ? msg.slice('[config] '.length) : msg
  return (
    <div className="my-3 grid gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <span className="whitespace-pre-wrap">{config ? 'AI is not set up. ' + text : text}</span>
      {config && (
        <Button variant="outline" size="sm" className="justify-self-start" onClick={onOpenSettings}>
          <Settings /> Open Settings
        </Button>
      )}
    </div>
  )
}
