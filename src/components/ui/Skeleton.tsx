export function Skeleton({
  className,
  style,
}: {
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={`animate-pulse bg-[#F0F0F0] rounded-[6px] ${className ?? ""}`}
      style={style}
    />
  )
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="p-4">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  )
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[8px] p-5 flex flex-col gap-4">
      <Skeleton className="h-10 w-10 rounded-[8px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-7 w-32" />
      </div>
    </div>
  )
}

export function EventCardSkeleton() {
  return (
    <div className="bg-white border border-[#F0F0F0] rounded-[12px] overflow-hidden">
      <Skeleton className="h-[100px] w-full rounded-none" />
      <div className="p-4 flex flex-col gap-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}
