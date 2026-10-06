'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

function filenameFrom(res: Response, fallback: string) {
  const match = res.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)
  return match?.[1] ?? fallback
}

export function ExportButton({ workspaceId, includeArchived }: { workspaceId: string; includeArchived: boolean }) {
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const url = `/api/w/${workspaceId}/export${includeArchived ? '?archived=1' : ''}`

  async function handleExport() {
    setFailed(false)
    // Embedded previews (e.g. sandboxed iframes) block downloads, so hand off to a top-level tab.
    if (window.self !== window.top) {
      window.open(url, '_blank', 'noopener')
      return
    }
    setBusy(true)
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Export failed with ${res.status}`)
      const blob = await res.blob()
      const href = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = href
      link.download = filenameFrom(res, 'opportunity-tree.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(href), 1000)
    } catch (error) {
      console.error('[export] download failed', error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {failed && (
        <span role="alert" className="text-xs text-destructive">
          Export failed — try again
        </span>
      )}
      <Button variant="outline" size="sm" onClick={handleExport} disabled={busy} aria-busy={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
        Export CSV
      </Button>
    </div>
  )
}
