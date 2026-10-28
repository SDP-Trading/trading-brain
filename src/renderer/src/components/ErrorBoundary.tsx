import { Component, type ReactNode } from 'react'
import { RotateCcw, TriangleAlert } from 'lucide-react'
import { Button } from './ui/button'

/** Evita que un error de render deje la ventana en blanco. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <TriangleAlert className="size-8 text-destructive" />
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <pre className="max-w-xl overflow-auto rounded-lg border bg-muted p-3 text-left text-xs whitespace-pre-wrap">
          {this.state.error.message}
        </pre>
        <Button onClick={() => location.reload()}>
          <RotateCcw /> Reload
        </Button>
      </div>
    )
  }
}
