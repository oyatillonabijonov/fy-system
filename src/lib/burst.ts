// Things that arrive close together are handed over once: `quiet` ms after the last one, and never
// later than `max` ms after the first. A hundred leads landing at once (an import, a batch from
// Make.com) then make one notice and one sound, not a hundred sounds on top of each other.
export function burst<T>(onFlush: (items: T[]) => void, quiet = 800, max = 5000) {
  let items: T[] = []
  let first = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    const out = items
    items = []
    timer = undefined
    onFlush(out)
  }
  return {
    add(item: T) {
      const now = Date.now()
      if (items.length === 0) first = now
      items.push(item)
      clearTimeout(timer)
      timer = setTimeout(flush, Math.max(0, Math.min(quiet, max - (now - first))))
    },
    /** drop what is waiting (the listener is going away) */
    cancel() {
      clearTimeout(timer)
      items = []
    },
  }
}
