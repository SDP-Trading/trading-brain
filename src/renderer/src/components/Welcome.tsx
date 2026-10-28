import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Brain, FolderOpen, Vault as VaultIcon, X } from 'lucide-react'
import type { VaultListItem, VaultState } from '@shared/types'
import { api, errMsg } from '../lib/util'
import { Button } from './ui/button'
import ThemeToggle from './ThemeToggle'

/** Pantalla sin vault abierto: vaults recientes y botón para abrir una carpeta. */
export default function Welcome({ onOpen }: { onOpen(s: VaultState): void }) {
  const [vaults, setVaults] = useState<VaultListItem[]>([])
  useEffect(() => {
    api.vault.list().then(setVaults)
  }, [])

  const run = async (fn: () => Promise<VaultState | null>) => {
    try {
      const s = await fn()
      if (s) onOpen(s)
    } catch (e) {
      toast.error(errMsg(e))
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="drag-region" />
      <div className="absolute top-10 right-4">
        <ThemeToggle />
      </div>
      <div className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Brain className="size-7" />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Trading Brain</h1>
      <p className="max-w-md text-muted-foreground">
        Your second brain for trading. Choose or create a folder for your vault — it is a plain Markdown folder,
        compatible with Obsidian.
      </p>
      <Button size="lg" className="mt-2" onClick={() => run(() => api.vault.select())}>
        <FolderOpen /> Open vault folder
      </Button>

      {vaults.length > 0 && (
        <div className="mt-6 w-full max-w-md text-left">
          <div className="mb-2 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Recent vaults</div>
          <div className="divide-y rounded-lg border">
            {vaults.map((v) => (
              <div key={v.path} className="group flex items-center gap-3 px-3 py-2">
                <VaultIcon className="size-4 shrink-0 text-primary" />
                <button
                  className="min-w-0 flex-1 text-left disabled:opacity-50"
                  disabled={!v.exists}
                  onClick={() => run(() => api.vault.open(v.path))}
                >
                  <div className="truncate text-sm font-medium">
                    {v.name}
                    {!v.exists && <span className="font-normal text-muted-foreground"> · missing</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{v.path}</div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 opacity-0 group-hover:opacity-100"
                  title="Remove from list"
                  onClick={() => api.vault.forget(v.path).then(() => api.vault.list().then(setVaults))}
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
