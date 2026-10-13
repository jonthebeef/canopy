import { TreeLogo } from '@/components/tree-logo'
import { cn } from '@/lib/utils'

export function Brand({ href = '/', className }: { href?: string; className?: string }) {
  return (
    <a href={href} className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <TreeLogo className="size-8 text-logo" />
      <span>Canopy</span>
    </a>
  )
}
