import { useState } from 'react'
import { Check, ChevronsUpDown, FolderOpen, FolderPlus, Vault as VaultIcon, X } from 'lucide-react'
import type { VaultListItem, VaultState } from '@shared/types'
import { api, errMsg } from '../lib/util'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from './ui/dropdown-menu'

interface Props {
  vault: VaultState
  onSwitch(state: VaultState): void
  notify(msg: string): void
}

export default function VaultSwitcher({ vault, onSwitch, notify }: Props) {
  const [vaults, setVaults] = useState<VaultListItem[]>([])
  const name = vault.path?.split('/').pop()

  const run = async (fn: () => Promise<VaultState | null>) => {
    try {
      const s = await fn()
      if (s) onSwitch(s)
    } catch (e) {
      notify(errMsg(e))
    }
  }

  const forget = (v: VaultListItem) =>
    run(async () => {
      const msg = v.current
        ? `Remove "${v.name}" from the list and close it? The folder is not deleted.`
        : `Remove "${v.name}" from the list? The folder is not deleted.`
      return confirm(msg) ? api.vault.forget(v.path) : null
    })

  return (
    <DropdownMenu onOpenChange={(open) => open && api.vault.list().then(setVaults)}>
      <DropdownMenuTrigger asChild>
        <button
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-semibold hover:bg-sidebar-accent"
          title={vault.path ?? ''}
        >
          <VaultIcon className="size-4 shrink-0 text-primary" />
          <span className="truncate">{name}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Vaults</DropdownMenuLabel>
        {vaults.map((v) => (
          <DropdownMenuItem
            key={v.path}
            disabled={!v.exists}
            onClick={() => !v.current && run(() => api.vault.open(v.path))}
            title={v.exists ? v.path : `${v.path} (folder not found)`}
          >
            <span className={cn('flex-1 truncate', v.current && 'font-medium')}>
              {v.name}
              {!v.exists && <span className="text-xs text-muted-foreground"> · missing</span>}
            </span>
            {v.current && <Check className="text-primary" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => run(() => api.vault.select())}>
          <FolderPlus /> Add vault…
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => api.vault.reveal()}>
          <FolderOpen /> Reveal current in Finder
        </DropdownMenuItem>
        {vaults.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <X /> Remove from list
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {vaults.map((v) => (
                <DropdownMenuItem key={v.path} onClick={() => forget(v)}>
                  {v.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
