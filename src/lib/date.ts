export type YMD = { y: number; m: number; d: number }

export function toKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function toYMD(d: Date): YMD {
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }
}

export function fromYMD({ y, m, d }: YMD) {
  return new Date(y, m, d)
}

export function addDays(d: Date, days: number) {
  const n = new Date(d)
  n.setDate(n.getDate() + days)
  return n
}

export function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function endOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

export function sameDate(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

export function weeksForMonth(d: Date) {
  const start = startOfMonth(d)
  const end = endOfMonth(d)
  const days: Date[] = []
  const firstDayOfGrid = addDays(start, -((start.getDay() + 6) % 7))
  const lastDayOfGrid = addDays(end, 6 - ((end.getDay() + 6) % 7))
  let cur = firstDayOfGrid
  while (cur <= lastDayOfGrid) {
    days.push(new Date(cur))
    cur = addDays(cur, 1)
  }
  const weeks: Date[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}
