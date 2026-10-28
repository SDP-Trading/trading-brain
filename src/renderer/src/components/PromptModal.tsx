import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

export interface PromptRequest {
  title: string
  initial: string
  resolve(value: string | null): void
}

/** Sustituto de window.prompt(), que Electron no implementa. */
export default function PromptModal({ req, onDone }: { req: PromptRequest | null; onDone(v: string | null): void }) {
  const [value, setValue] = useState('')
  useEffect(() => {
    setValue(req?.initial ?? '')
  }, [req])

  return (
    <Dialog open={!!req} onOpenChange={(o) => !o && onDone(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            onDone(value.trim() || null)
          }}
        >
          <DialogHeader>
            <DialogTitle>{req?.title}</DialogTitle>
          </DialogHeader>
          <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} onFocus={(e) => e.target.select()} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onDone(null)}>
              Cancel
            </Button>
            <Button type="submit">OK</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
