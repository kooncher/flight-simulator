import { getBookings, getCourses, cancelBookingWithPolicy, rescheduleBooking, TIME_SLOTS, formatTimeRange, lessThan24h, type Booking, getTakenSlots } from '../store/booking'
import { useEffect, useState } from 'react'

type Props = {
  userEmail: string
}

export default function MyBookings({ userEmail }: Props) {
  const [tick, setTick] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const [newDate, setNewDate] = useState<string>('')
  const [newSlot, setNewSlot] = useState<number | null>(null)
  const [newNote, setNewNote] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  
  const [courses, setCourses] = useState<Record<string, { name: string }>>({})
  const [items, setItems] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  const [takenSlotsForNewDate, setTakenSlotsForNewDate] = useState<number[]>([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [allCourses, allBookings] = await Promise.all([
        getCourses(),
        getBookings()
      ])
      
      const courseMap = allCourses.reduce<Record<string, { name: string }>>((acc, c) => {
        acc[c.id] = { name: c.name }
        return acc
      }, {})
      
      const myBookings = allBookings
        .filter(b => b.email === userEmail)
        .sort((a, b) => a.date.localeCompare(b.date))
        
      setCourses(courseMap)
      setItems(myBookings)
      setLoading(false)
    }
    load()
  }, [userEmail, tick])

  // Fetch taken slots when newDate changes
  useEffect(() => {
    if (newDate) {
      getTakenSlots(newDate).then(setTakenSlotsForNewDate)
    } else {
      setTakenSlotsForNewDate([])
    }
  }, [newDate])

  async function cancel(id: string) {
    const res = await cancelBookingWithPolicy(id, userEmail)
    if ('ok' in res && res.ok) {
      setError(null)
      setTick(t => t + 1)
    } else {
      setError('error' in res ? res.error : 'ยกเลิกไม่ได้')
    }
  }

  if (loading && tick === 0) {
    return <div className="glass p-6 text-slate-500">กำลังโหลดรายการจอง...</div>
  }

  if (items.length === 0) {
    return <div className="glass p-6">ยังไม่มีการจองของคุณ</div>
  }

  return (
    <section className="grid gap-4">
      {items.map(b => (
        <div key={b.id} className="glass p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="font-semibold">{courses[b.courseId]?.name || b.courseId}</div>
            <div className="text-slate-500 text-sm">วันที่: {new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} • เวลา: {formatTimeRange(b.slot, b.durationHours)}</div>
            <div className="text-slate-500 text-xs mt-1">เรียนกับ: {b.sessionKind === 'sim' ? `เครื่อง ${b.selectedSimId === 'sim2' ? 'SIM 2' : 'SIM 1'}` : 'นักบิน'}</div>
            {b.note && (
              <div className="mt-1 text-xs text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded-lg w-fit">
                หมายเหตุ: {b.note}
              </div>
            )}
            <div className="mt-1 flex gap-2 items-center">
              {b.status === 'completed' && <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">เรียนจบแล้ว</span>}
              {b.status === 'paid' && <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-100 text-blue-700">จ่ายเงินแล้ว</span>} 
              {b.status === 'pending' && (
                <>
                  {lessThan24h(b.date, b.slot)
                    ? <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">ใกล้ถึงเวลาเรียน</span>
                    : <span className="px-2 py-0.5 rounded-lg bg-blue-100 text-blue-700 text-[10px] font-bold">รอเรียน (หรือรอจ่ายเงิน)</span>}
                </>
              )}
              {b.status === 'cancelled' && <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold">ยกเลิกแล้ว</span>}
            </div>
          </div>
          <div className="flex gap-2 items-start shrink-0">
            {b.status === 'pending' && (
              editing === b.id ? (
                <div className="flex flex-col gap-3 w-full md:w-64 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                  <div className="grid gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">เลือกวันที่ใหม่</label>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm w-full" />
                  </div>

                  {newDate && (
                    <div className="grid gap-1">
                      <label className="text-[10px] font-bold text-slate-400 uppercase">เลือกเวลาใหม่</label>
                      <div className="grid grid-cols-1 gap-1">
                        {TIME_SLOTS.map((_, idx) => {
                          const dur = Math.max(1, Number(b.durationHours || 1))
                          const exceeds = idx + dur > TIME_SLOTS.length
                          const ownRange = new Set(Array.from({ length: dur }, (_, k) => b.slot + k))
                          const rangeTaken = Array.from({ length: dur }, (_, k) => idx + k).some(s => {
                            if (!takenSlotsForNewDate.includes(s)) return false
                            if (newDate === b.date && ownRange.has(s)) return false
                            return true
                          })
                          const isTaken = exceeds || rangeTaken
                          const isSelected = newSlot === idx
                          return (
                            <button
                              key={idx}
                              disabled={isTaken}
                              onClick={() => setNewSlot(idx)}
                              className={[
                                'px-3 py-1.5 rounded-lg border text-[10px] font-medium transition-all text-left flex justify-between items-center',
                                isSelected ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                                isTaken ? 'opacity-30 grayscale cursor-not-allowed' : 'hover:border-brand-300'
                              ].join(' ')}
                            >
                              <span>{formatTimeRange(idx, dur)}</span>
                              {isTaken && <span className="text-[8px] opacity-60">ไม่ว่าง</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase">หมายเหตุ</label>
                    <textarea 
                      placeholder="เหตุผลที่เลื่อนวัน" 
                      value={newNote} 
                      onChange={e => setNewNote(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs h-16 w-full"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      disabled={!newDate || newSlot === null}
                      className="btn btn-primary flex-1 py-2 text-xs"
                      onClick={async () => {
                        if (!newDate || newSlot === null) return
                        const res = await rescheduleBooking(b.id, newDate, userEmail, newSlot, newNote)
                        if ('ok' in res && res.ok) {
                          setEditing(null)
                          setNewDate('')
                          setNewSlot(null)
                          setNewNote('')
                          setError(null)
                          setTick(t => t + 1)
                        } else {
                          setError('error' in res ? res.error : 'ไม่สามารถเลื่อนวันได้')
                        }
                      }}
                    >
                      บันทึก
                    </button>
                    <button className="btn btn-outline flex-1 py-2 text-xs" onClick={() => { setEditing(null); setNewDate(''); setNewSlot(null); setNewNote(''); setError(null) }}>ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <>
                  <button onClick={() => { setEditing(b.id); setNewDate(b.date); setNewSlot(b.slot); setNewNote(b.note || ''); setError(null) }} className="btn btn-outline">เลื่อนวัน/เวลา</button>
                  <button onClick={() => cancel(b.id)} className="btn btn-outline">ยกเลิก</button>
                </>
              )
            )}
          </div>
        </div>
      ))}
      {error && <div className="text-red-600 text-sm p-4 glass">{error}</div>}
    </section>
  )
}
