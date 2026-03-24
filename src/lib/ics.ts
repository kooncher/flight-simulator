import { TIME_SLOTS, SLOT_START_HOURS } from '../store/booking'

function pad(n: number) {
  return n.toString().padStart(2, '0')
}

export function buildICS(summary: string, date: string, slot: number, location = 'Flight Reserve') {
  const [y, m, d] = date.split('-').map(Number)
  const startH = SLOT_START_HOURS[slot] || 9
  const endH = startH + 2
  const dtstamp = new Date()
  const uid = Math.random().toString(36).slice(2) + '@flightreserve.local'
  const start = new Date(y, m - 1, d, startH, 0, 0)
  const end = new Date(y, m - 1, d, endH, 0, 0)
  const fmt = (t: Date) =>
    `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}T${pad(t.getHours())}${pad(t.getMinutes())}00`
  const content = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Flight Reserve//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${fmt(dtstamp)}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${summary} • ${TIME_SLOTS[slot] || ''}`,
    `LOCATION:${location}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
  return new Blob([content], { type: 'text/calendar;charset=utf-8' })
}
