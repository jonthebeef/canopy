import { Network } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <a href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Network className="size-4" aria-hidden="true" />
      </span>
      <span>Canopy</span>
    </a>
  )
}
