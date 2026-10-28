import { Check, Monitor, Moon, Sun } from 'lucide-react'
import type { ThemeMode } from '@shared/types'
import { useTheme } from '@/lib/theme'
import { Button } from './ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'

const OPTIONS: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'System', icon: Monitor }
]

export default function ThemeToggle() {
  const { theme, isDark, setTheme } = useTheme()
  const Icon = theme === 'system' ? Monitor : isDark ? Moon : Sun
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Theme">
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => setTheme(o.id)}>
            <o.icon /> {o.label}
            {theme === o.id && <Check className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
