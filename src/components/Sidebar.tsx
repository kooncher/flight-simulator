import { useMemo } from 'react'
import type { UserRole } from '../store/auth'

type Props = {
  q: string
  setQ: (v: string) => void
  availability: Record<string, number>
  onStartNew: () => void
  userEmail?: string
  view: 'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff' | 'payment'
  onNavigate: (v: 'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff' | 'payment') => void
  bookingsCount: number
  userRole?: UserRole
}

export default function Sidebar({ q, setQ, availability, userEmail, view, onNavigate, bookingsCount, userRole }: Props) {
  const isAdmin = userRole === 'Admin'
  const isTechnician = userRole === 'Technician'
  const isPilot = userRole === 'Pilot'
  const isStaff = isAdmin || isTechnician || isPilot

  const next7 = useMemo(() => {
    const today = new Date()
    let sum = 0
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const key = d.toISOString().slice(0, 10)
      sum += availability[key] || 0
    }
    return sum
  }, [availability])

  return (
    <aside className="grid gap-4 lg:sticky lg:top-24 self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-auto">
      {isStaff && (
        <div className="glass p-4 border-l-4 border-brand-500">
          <div className="text-[10px] text-brand-600 font-black uppercase tracking-widest mb-2 flex items-center justify-between">
            <span>{userRole} Panel</span>
            <span className="size-2 rounded-full bg-brand-500 animate-pulse" />
          </div>
          <button
            onClick={() => onNavigate(isAdmin ? 'admin' : 'staff')}
            className={['btn w-full py-2.5 text-xs font-bold', (isAdmin ? view === 'admin' : view === 'staff') ? 'btn-primary' : 'btn-outline'].join(' ')}
          >
            {isAdmin ? 'Dashboard หลังบ้าน' : isTechnician ? 'ควบคุม Flight Simulator' : 'ตารางบินนักบิน'}
          </button>
        </div>
      )}

      {!isStaff && (
        <div className="glass p-4">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">เมนูหลัก</div>
          <div className="grid gap-2">
            <button
              onClick={() => onNavigate('browse')}
              className={['btn w-full justify-start gap-3 px-4', view === 'browse' ? 'btn-primary' : 'btn-outline border-none bg-slate-50 dark:bg-slate-900/50'].join(' ')}
            >
              <span className="text-lg">🔍</span>
              <span>ค้นหาคอร์ส</span>
            </button>
            <button
              onClick={() => onNavigate('my')}
              className={['btn w-full justify-between px-4', view === 'my' ? 'btn-primary' : 'btn-outline border-none bg-slate-50 dark:bg-slate-900/50'].join(' ')}
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">📅</span>
                <span>การจองของฉัน</span>
              </div>
              <span className={['inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-lg text-[10px] font-black', view === 'my' ? 'bg-white/20 text-white' : 'bg-brand-100 text-brand-600'].join(' ')}>
                {bookingsCount}
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="glass p-4">
        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">บัญชีผู้ใช้</div>
        <div className="px-2 mb-3">
          <div className="font-bold text-sm truncate">{userEmail || 'Guest'}</div>
          <div className="text-[10px] text-brand-500 font-black uppercase">{userRole || 'User'}</div>
        </div>
        <div className="grid gap-2">
          {!isAdmin && (
            <>
              <button
                onClick={() => onNavigate('profile')}
                className={['btn w-full justify-start gap-3 px-4', view === 'profile' ? 'btn-primary' : 'btn-outline border-none bg-slate-50 dark:bg-slate-900/50'].join(' ')}
              >
                <span className="text-lg">👤</span>
                <span>โปรไฟล์</span>
              </button>
              <button
                onClick={() => onNavigate('help')}
                className={['btn w-full justify-start gap-3 px-4', view === 'help' ? 'btn-primary' : 'btn-outline border-none bg-slate-50 dark:bg-slate-900/50'].join(' ')}
              >
                <span className="text-lg">❓</span>
                <span>ช่วยเหลือ</span>
              </button>
            </>
          )}
        </div>
      </div>

      {!isStaff && view === 'browse' && (
        <div className="glass p-4">
          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">ตัวกรองคอร์ส</div>
          <div className="relative">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="ค้นหาชื่อคอร์ส..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
          </div>
          {q && (
            <button onClick={() => setQ('')} className="text-[10px] font-bold text-brand-500 mt-2 w-full text-center hover:underline uppercase">ล้างตัวกรอง</button>
          )}
        </div>
      )}

      {!isStaff && (
        <div className="glass p-4 bg-gradient-to-br from-brand-500 to-brand-600 text-white border-none shadow-lg shadow-brand-200 dark:shadow-none">
          <div className="text-[10px] text-white/70 font-bold uppercase tracking-widest mb-1">ความพร้อมการบิน</div>
          <div className="text-3xl font-black">{next7}</div>
          <div className="text-white/80 text-[10px] font-medium">สล็อตว่างใน 7 วันถัดไป</div>
        </div>
      )}
    </aside>
  )
}
