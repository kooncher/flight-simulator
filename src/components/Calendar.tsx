import { useMemo, useState } from 'react'
import { DEFAULT_SLOTS, TIME_SLOTS, getTakenSlots } from '../store/booking'
import { weeksForMonth, sameDate } from '../lib/date'

type Props = {
  month: Date
  selected?: Date
  availability: Record<string, number>
  onSelect: (d: Date) => void
}

function fmt(d: Date) {
  return d.toISOString().slice(0, 10)
}

const dayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function Calendar({ month, selected, availability, onSelect }: Props) {
  const weeks = useMemo(() => weeksForMonth(month), [month])
  const today = new Date()
  
  // State for tooltip/hover details
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [takenSlots, setTakenSlots] = useState<number[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)

  const handleMouseEnter = async (dateKey: string) => {
    setHoverDate(dateKey)
    setLoadingSlots(true)
    const taken = await getTakenSlots(dateKey)
    setTakenSlots(taken)
    setLoadingSlots(false)
  }

  return (
    <div className="relative">
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map(d => (
          <div key={d} className="text-center text-xs font-bold text-slate-400 uppercase tracking-wider py-2">{d}</div>
        ))}
      </div>
      
      <div className="grid gap-1 sm:gap-2">
        {weeks.map((wk, i) => (
          <div className="grid grid-cols-7 gap-1 sm:gap-2" key={i}>
            {wk.map(d => {
              const key = fmt(d)
              const slots = availability[key] ?? DEFAULT_SLOTS
              const isToday = sameDate(d, today)
              const isPast = d < new Date(today.setHours(0,0,0,0))
              const isDiffMonth = d.getMonth() !== month.getMonth()
              const isSelected = selected && sameDate(d, selected)
              const isFull = slots <= 0

              return (
                <div key={key} className="relative group">
                  <button
                    disabled={isPast && !isToday}
                    onClick={() => onSelect(d)}
                    onMouseEnter={() => handleMouseEnter(key)}
                    onMouseLeave={() => setHoverDate(null)}
                    className={[
                      'w-full aspect-square sm:aspect-video md:aspect-[4/3] rounded-lg sm:rounded-xl p-1 sm:p-2 md:p-3 text-left transition-all border-2 flex flex-col justify-between overflow-hidden',
                      isSelected 
                        ? 'bg-brand-500 border-brand-500 text-white shadow-lg shadow-brand-200 dark:shadow-none z-10 scale-[1.02]' 
                        : isToday
                          ? 'bg-brand-50 border-brand-200 text-brand-700 dark:bg-brand-900/20 dark:border-brand-800'
                          : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-brand-300 dark:hover:border-brand-700',
                      isPast && !isToday ? 'opacity-30 grayscale cursor-not-allowed' : 'cursor-pointer',
                      isDiffMonth ? 'opacity-20' : '',
                      isFull && !isSelected ? 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-900' : ''
                    ].join(' ')}
                  >
                    <div className="flex justify-between items-start">
                      <span className={['text-xs sm:text-sm md:text-base font-bold', isToday && !isSelected ? 'text-brand-600' : ''].join(' ')}>
                        {d.getDate()}
                      </span>
                      {isFull && !isPast && (
                        <span className="size-1.5 rounded-full bg-red-400 sm:hidden" />
                      )}
                    </div>

                    <div className="hidden sm:block mt-auto">
                      {isFull ? (
                        <div className="text-[10px] md:text-xs font-bold text-red-500 dark:text-red-400 uppercase">เต็ม</div>
                      ) : (
                        <div className={['text-[10px] md:text-xs font-medium opacity-80', isSelected ? 'text-white' : 'text-slate-500'].join(' ')}>
                          ว่าง {slots}
                        </div>
                      )}
                    </div>
                  </button>

                  {/* Tooltip / Hover Details */}
                  {hoverDate === key && !isPast && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 sm:w-56 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 p-4 z-50 pointer-events-none animate-in fade-in zoom-in duration-200 origin-bottom">
                      <div className="text-xs font-bold text-slate-400 uppercase mb-3 border-b border-slate-50 dark:border-slate-700/50 pb-2">
                        {d.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' })}
                      </div>
                      
                      <div className="grid gap-2">
                        {TIME_SLOTS.map((slot, idx) => {
                          const isTaken = takenSlots.includes(idx)
                          return (
                            <div key={idx} className="flex items-center justify-between gap-3">
                              <span className="text-[10px] md:text-xs font-medium text-slate-500">{slot}</span>
                              {loadingSlots ? (
                                <div className="size-2 rounded-full bg-slate-200 animate-pulse" />
                              ) : isTaken ? (
                                <span className="px-1.5 py-0.5 rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[8px] md:text-[9px] font-bold uppercase">ไม่ว่าง</span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-[8px] md:text-[9px] font-bold uppercase">ว่าง</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white dark:border-t-slate-800" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
