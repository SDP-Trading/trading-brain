import { Trash2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from './ui/alert-dialog'

export interface DeleteRequest {
  path: string
  name: string
  kind: 'note' | 'canvas' | 'folder'
  /** Notas dentro de la carpeta (solo carpetas). */
  count?: number
}

export default function ConfirmDelete({ req, onCancel, onConfirm }: { req: DeleteRequest | null; onCancel(): void; onConfirm(): void }) {
  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {req?.kind === 'folder' ? 'folder' : req?.kind === 'canvas' ? 'canvas' : 'note'} “{req?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {req?.kind === 'folder'
              ? `The folder and everything inside it${req.count ? ` (${req.count} notes)` : ''} will be moved to the vault trash (.trash).`
              : 'It will be moved to the vault trash (.trash).'}{' '}
            You can undo it right after.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={onConfirm}>
            <Trash2 /> Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
