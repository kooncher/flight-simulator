import { useEffect, useState } from 'react'
import Calendar from './components/Calendar'
import { addDays } from './lib/date'
import { initAvailability, getAvailability, createBooking, ensureMonthAvailability, getTakenSlots, TIME_SLOTS, PRICE_PER_HOUR, DURATION_HOURS_OPTIONS, formatTimeRange, BUSINESS_START_HOUR, BUSINESS_END_HOUR, type SimulatorStatus, getSimPowers, type SimUnitId, getSavedStudents, saveStudent, deleteSavedStudent } from './store/booking'
import { buildICS } from './lib/ics'
import Login from './components/Login'
import { getUser, logout, checkSession, getUsersByRole, type User } from './store/auth'
import AppLayout from './layouts/AppLayout'
import AuthLayout from './layouts/AuthLayout'
import MyBookings from './components/MyBookings'
import { getBookings, getAnnouncements } from './store/booking'
import Profile from './components/Profile'
import Help from './components/Help'
import AdminDashboard from './components/AdminDashboard'
import Toast from './components/Toast'

type Step = 'calendar' | 'time' | 'form' | 'done'

export default function App() {
  function pad2(n: number) {
    return String(n).padStart(2, '0')
  }

  const [user, setUser] = useState(() => getUser())
  const [step, setStep] = useState<Step>('calendar')
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [durationHours, setDurationHours] = useState<number>(1)
  const [sessionKind, setSessionKind] = useState<'pilot' | 'sim'>('pilot')
  const [selectedPilotId, setSelectedPilotId] = useState<string | null>(null)
  const [selectedSimId, setSelectedSimId] = useState<SimUnitId | null>(null)
  const [availability, setAvailability] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ name: '', email: user?.email ?? '', phone: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [lastBooked, setLastBooked] = useState<{ date: string; slot: number; durationHours: number; sessionKind: 'pilot' | 'sim'; selectedPilotId?: string | null; selectedSimId?: SimUnitId | null } | null>(null)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff' | 'payment'>(() => {
    const u = getUser()
    if (u?.role === 'Admin') return 'admin'
    if (u?.role === 'Technician' || u?.role === 'Pilot') return 'staff'
    return 'browse'
  })
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [pilots, setPilots] = useState<User[]>([])
  const [simPower, setSimPower] = useState<Record<SimUnitId, SimulatorStatus | null>>({ sim1: null, sim2: null })
  
  const [tick, setTick] = useState(0)
  const [saveThisStudent, setSaveThisStudent] = useState(false)
  const [savedStudents, setSavedStudents] = useState<any[]>([])
  const [takenSlotsForDate, setTakenSlotsForDate] = useState<number[]>([])
  const [myBookingsCount, setMyBookingsCount] = useState(0)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      setLoading(true)
      const u = await checkSession()
      setUser(u)
      setLoading(false)
    }
    check()
  }, [])

  useEffect(() => {
    const isAdmin = user?.role === 'Admin'
    const isStaff = user?.role === 'Technician' || user?.role === 'Pilot'
    if (isAdmin) {
      if (view !== 'admin') setView('admin')
      return
    }
    if (isStaff) {
      if (view === 'browse' || view === 'admin') setView('staff')
      return
    }
    if (view === 'admin' || view === 'staff') setView('browse')
  }, [user, view])

  useEffect(() => {
    async function loadBrowseData() {
      const [annData, pilotData, sim] = await Promise.all([
        getAnnouncements(),
        getUsersByRole('Pilot'),
        getSimPowers()
      ])
      setAnnouncements(annData)
      setPilots(pilotData)
      setSimPower(sim)
    }
    if (view === 'browse') loadBrowseData()
  }, [view, step, tick])

  useEffect(() => {
    if (step !== 'time') return
    const active = pilots.filter(p => (p.pilotActive ?? true) && !!p.id)
    const sims = (['sim1', 'sim2'] as const).filter(id => simPower[id]?.ready ?? true)
    if (sessionKind === 'pilot') {
      if (!selectedPilotId || !active.some(p => p.id === selectedPilotId)) setSelectedPilotId(active[0]?.id || null)
      setSelectedSimId(null)
    } else {
      if (!selectedSimId || !sims.includes(selectedSimId)) setSelectedSimId(sims[0] || null)
      setSelectedPilotId(null)
    }
  }, [step, sessionKind, pilots, simPower, selectedPilotId, selectedSimId])

  useEffect(() => {
    async function loadSaved() {
      if (user) {
        const data = await getSavedStudents(user.email)
        setSavedStudents(data)
      }
    }
    loadSaved()
  }, [user, step, tick])

  useEffect(() => {
    async function loadCount() {
      if (user) {
        const all = await getBookings()
        setMyBookingsCount(all.filter(b => b.email === user.email).length)
      }
    }
    loadCount()
  }, [user, tick, step])

  useEffect(() => {
    async function init() {
      await initAvailability()
      const data = await getAvailability()
      setAvailability(data)
    }
    init()
  }, [])
  useEffect(() => {
    function onUserUpdated() {
      async function update() {
        setUser(await checkSession())
      }
      update()
    }
    window.addEventListener('user-updated', onUserUpdated as EventListener)
    return () => window.removeEventListener('user-updated', onUserUpdated as EventListener)
  }, [])
  useEffect(() => {
    function onToast(e: Event) {
      const ce = e as CustomEvent
      const msg = (ce.detail as any)?.message
      if (msg) setMessage(String(msg))
    }
    window.addEventListener('app-toast', onToast as EventListener)
    return () => window.removeEventListener('app-toast', onToast as EventListener)
  }, [])
  useEffect(() => {
    async function load() {
      await ensureMonthAvailability(month)
      const data = await getAvailability()
      setAvailability(data)
    }
    load()
  }, [month, tick])
  useEffect(() => {
    setForm(f => ({ ...f, email: user?.email ?? '' }))
  }, [user])
  useEffect(() => {
    if (step === 'form') {
      setForm(f => ({
        ...f,
        name: f.name || user?.name || '',
        phone: f.phone || user?.phone || '',
        email: f.email || user?.email || ''
      }))
    }
  }, [step, user])

  function nextMonth() {
    const d = new Date(month)
    d.setMonth(d.getMonth() + 1)
    setMonth(d)
  }
  function prevMonth() {
    const d = new Date(month)
    d.setMonth(d.getMonth() - 1)
    setMonth(d)
  }

  function resetFlow() {
    setStep('calendar')
    setSelectedDate(null)
    setSelectedSlot(null)
    setDurationHours(1)
    setSessionKind('pilot')
    setSelectedPilotId(null)
    setSelectedSimId(null)
    setForm({ name: '', email: '', phone: '' })
    setTick(t => t + 1)
  }

  async function handleSelectDate(d: Date) {
    setSelectedDate(d)
    const key = d.toISOString().slice(0, 10)
    const takenArr = await getTakenSlots(key)
    setTakenSlotsForDate(takenArr)
    setSelectedSlot(0)
    setSelectedPilotId(null)
    setSelectedSimId(null)
    setStep('time')
  }

  async function submit() {
    if (!selectedDate || selectedSlot === null) {
      setMessage('เลือกวันและช่วงเวลาก่อน')
      return
    }
    // sanitize and validate
    const phoneDigits = (form.phone || '').replace(/\D/g, '').slice(0, 10)
    const emailSan = (form.email || '').replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '')
    const emailOk = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailSan)
    if (!form.name || !emailOk || phoneDigits.length !== 10) {
      setMessage(
        !form.name
          ? 'กรอกชื่อให้ครบถ้วน'
          : !emailOk
          ? 'อีเมลไม่ถูกต้อง'
          : 'เบอร์โทรต้องเป็นตัวเลข 10 หลัก'
      )
      return
    }
    if (!form.name || !form.email || !form.phone) {
      setMessage('กรอกข้อมูลให้ครบถ้วน')
      return
    }
    const res = await createBooking({
      courseId: 'hourly',
        userId: user?.id || '',
        date: selectedDate.toISOString().slice(0, 10),
      name: form.name,
      email: emailSan,
      phone: phoneDigits,
      slot: selectedSlot,
      durationHours,
      sessionKind,
      selectedPilotId: sessionKind === 'pilot' ? selectedPilotId : null,
      selectedSimId: sessionKind === 'sim' ? selectedSimId : null
    })
    if ('ok' in res && res.ok) {
      if (saveThisStudent && user) {
        await saveStudent(user.email, { name: form.name, email: emailSan, phone: phoneDigits })
      }
      const data = await getAvailability()
      setAvailability(data)
      setTick(t => t + 1)
      setStep('done')
      setView('payment') // เปลี่ยนจาก 'my' เป็น 'payment'
      setLastBooked({ date: selectedDate.toISOString().slice(0, 10), slot: selectedSlot, durationHours, sessionKind, selectedPilotId, selectedSimId })
      setSaveThisStudent(false)
    } else {
      const msg = 'error' in res ? res.error : 'ไม่สามารถจองได้'
      setMessage(msg)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 dark:bg-slate-950">
        <div className="text-slate-500">กำลังโหลดข้อมูล...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthLayout>
        <Login onSuccess={async () => setUser(await checkSession())} />
      </AuthLayout>
    )
  }

  const isAdmin = user.role === 'Admin'
  const isTechnician = user.role === 'Technician'
  const isPilot = user.role === 'Pilot'
  const isStaff = isAdmin || isTechnician || isPilot
  const layoutView = view === 'payment' ? 'browse' : view
  const activePilots = pilots.filter(p => (p.pilotActive ?? true) && !!p.id)
  const availableSims = (['sim1', 'sim2'] as const).filter(id => simPower[id]?.ready ?? true)
  const latestStartHour = Math.max(BUSINESS_START_HOUR, BUSINESS_END_HOUR - durationHours)
  const hourOptions = Array.from({ length: Math.max(0, latestStartHour - BUSINESS_START_HOUR + 1) }, (_, i) => BUSINESS_START_HOUR + i)
  const exceeds = selectedSlot === null ? true : (selectedSlot + durationHours > TIME_SLOTS.length)
  const rangeTaken = selectedSlot === null
    ? true
    : Array.from({ length: durationHours }, (_, k) => selectedSlot + k).some(s => takenSlotsForDate.includes(s))
  const chosenPilot = selectedPilotId ? activePilots.find(p => p.id === selectedPilotId) : null
  const pilotOk = sessionKind === 'pilot' ? (!!chosenPilot) : true
  const simOk = sessionKind === 'sim' ? (!!selectedSimId && availableSims.includes(selectedSimId)) : true
  const canProceedTime = selectedSlot !== null && !exceeds && !rangeTaken && pilotOk && simOk

  return (
    <AppLayout
      userEmail={user.email}
      userName={user.name || user.email}
      onLogout={() => { logout(); setUser(null); setView('browse'); resetFlow() }}
      q={q}
      setQ={setQ}
      availability={availability}
      onStartNew={resetFlow}
      view={layoutView as any}
      onNavigate={setView}
      bookingsCount={myBookingsCount}
      userRole={user.role}
    >
      <Toast message={message} onClose={() => setMessage(null)} variant="warning" />
      {!isStaff && (
        <section className="glass p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">จองวันเรียนคอร์สฝึกบิน</h1>
              <p className="text-slate-500 mt-1">เลือกวันและช่วงเวลา แล้วกรอกข้อมูลเพื่อยืนยันการจอง</p>
            </div>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="glass p-6 min-w-0 overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-600 truncate">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1 truncate">จัดการระบบโรงเรียนการบิน</p>
        </section>
      )}

      {view === 'staff' && (isTechnician || isPilot) && (
        <section className="glass p-6 min-w-0 overflow-hidden">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-600 truncate">{isTechnician ? 'Technician Panel' : 'Pilot Panel'}</h1>
          <p className="text-slate-500 mt-1 truncate">ควบคุมการปฏิบัติการและความพร้อมของ Flight Simulator</p>
        </section>
      )}

      {view === 'browse' && !isStaff && announcements.length > 0 && (
        <section className="grid gap-3">
          {announcements.map(a => (
            <div key={a.id} className={['p-4 rounded-2xl border flex gap-3 items-start', a.type === 'danger' ? 'bg-red-50 border-red-100 text-red-800' : a.type === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-800' : 'bg-blue-50 border-blue-100 text-blue-800'].join(' ')}>
              <span className="text-lg">{a.type === 'danger' ? '🚨' : a.type === 'warning' ? '⚠️' : '📢'}</span>
              <div>
                <div className="text-sm font-medium">{a.text}</div>
                <div className="text-[10px] opacity-60 mt-1">{new Date(a.date).toLocaleDateString('th-TH')}</div>
              </div>
            </div>
          ))}
        </section>
      )}

      {view === 'browse' && !isStaff && (
        <div className="grid gap-6">
          {step === 'calendar' && (
            <section className="grid gap-6">
              <div className="glass p-6 overflow-hidden">
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className="flex items-center gap-2">
                    <button className="btn btn-outline" onClick={prevMonth}>ก่อนหน้า</button>
                    <button className="btn btn-outline" onClick={nextMonth}>ถัดไป</button>
                  </div>
                  <div className="font-semibold">{month.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })}</div>
                </div>

                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">สถานะ</span>
                  <span className={['px-2 py-1 rounded-lg text-[10px] font-bold border', (simPower.sim1?.ready ?? true) ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                    SIM 1 {(simPower.sim1?.ready ?? true) ? 'ON' : 'OFF'}
                  </span>
                  <span className={['px-2 py-1 rounded-lg text-[10px] font-bold border', (simPower.sim2?.ready ?? true) ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                    SIM 2 {(simPower.sim2?.ready ?? true) ? 'ON' : 'OFF'}
                  </span>
                  <span className={['px-2 py-1 rounded-lg text-[10px] font-bold border', pilots.some(p => p.pilotActive ?? true) ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'].join(' ')}>
                    PILOT {pilots.some(p => p.pilotActive ?? true) ? 'ON' : 'OFF'}
                  </span>
                </div>

                {((!(simPower.sim1?.ready ?? true) && !(simPower.sim2?.ready ?? true)) && pilots.filter(p => p.pilotActive ?? true).length === 0) && (
                  <div className="p-4 rounded-2xl border mb-4 bg-red-50 border-red-100 text-red-700">
                    <div className="font-bold">ไม่สามารถจองได้ชั่วคราว</div>
                    <div className="text-sm mt-1">
                      เครื่อง Simulator ปิดให้บริการ และไม่มีนักบินว่าง
                    </div>
                  </div>
                )}

                <Calendar
                  month={month}
                  selected={selectedDate ?? undefined}
                  availability={availability}
                  onSelect={async (d) => {
                    if ((!(simPower.sim1?.ready ?? true) && !(simPower.sim2?.ready ?? true)) && pilots.filter(p => p.pilotActive ?? true).length === 0) {
                      setMessage('ขณะนี้ไม่สามารถจองได้ (SIM OFF และนักบิน INACTIVE)')
                      return
                    }
                    await handleSelectDate(d)
                  }}
                />

                <div className="mt-4 text-sm text-slate-500">
                  หมายเหตุ: จำกัดจองล่วงหน้ารวมไม่เกิน 8 ชั่วโมง และสูงสุด 2 วันต่อสัปดาห์ (จันทร์–อาทิตย์)
                </div>

              </div>
            </section>
          )}

          {step === 'time' && selectedDate && (
            <section className="grid gap-6">
              <div className="glass p-6 overflow-hidden">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                  <div className="min-w-0">
                    <div className="font-semibold">เลือกช่วงเวลา</div>
                    <div className="text-sm text-slate-500 truncate">{selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  </div>
                  <button className="btn btn-outline shrink-0" onClick={() => setStep('calendar')}>ย้อนกลับ</button>
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">เรียนกับ</div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className={['px-4 py-2 rounded-xl text-xs font-bold border transition', sessionKind === 'pilot' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'].join(' ')}
                        disabled={activePilots.length === 0}
                        onClick={() => {
                          setSessionKind('pilot')
                          const first = activePilots[0]?.id || null
                          if (!selectedPilotId || !activePilots.some(p => p.id === selectedPilotId)) setSelectedPilotId(first)
                          setSelectedSimId(null)
                        }}
                      >
                        นักบิน
                      </button>
                      <button
                        className={['px-4 py-2 rounded-xl text-xs font-bold border transition', sessionKind === 'sim' ? 'bg-brand-500 text-white border-brand-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'].join(' ')}
                        disabled={availableSims.length === 0}
                        onClick={() => {
                          setSessionKind('sim')
                          const first = availableSims[0] || null
                          if (!selectedSimId || !availableSims.includes(selectedSimId)) setSelectedSimId(first)
                          setSelectedPilotId(null)
                        }}
                      >
                        เครื่อง SIM
                      </button>
                    </div>
                  </div>

                  {sessionKind === 'pilot' && (
                    <div className="grid gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">นักบิน</div>
                      <select
                        value={selectedPilotId ?? ''}
                        disabled={activePilots.length === 0}
                        onChange={e => setSelectedPilotId(e.target.value || null)}
                        className="w-full sm:w-80 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                      >
                        <option value="" disabled>{activePilots.length === 0 ? 'ไม่มีนักบิน ACTIVE' : 'เลือกนักบิน'}</option>
                        {activePilots.map(p => (
                          <option key={p.id} value={p.id!}>{p.name || p.email}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {sessionKind === 'sim' && (
                    <div className="grid gap-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">เครื่อง SIM</div>
                      <select
                        value={selectedSimId ?? ''}
                        disabled={availableSims.length === 0}
                        onChange={e => setSelectedSimId((e.target.value as SimUnitId) || null)}
                        className="w-full sm:w-56 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                      >
                        <option value="" disabled>{availableSims.length === 0 ? 'SIM ปิดให้บริการ' : 'เลือกเครื่อง'}</option>
                        {(['sim1', 'sim2'] as const).map(id => {
                          const isOn = availableSims.includes(id)
                          const label = id === 'sim1' ? 'SIM 1' : 'SIM 2'
                          return (
                            <option key={id} value={id} disabled={!isOn}>
                              {label} {isOn ? 'ON' : 'OFF'}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  )}

                  <div className="grid gap-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ระยะเวลา (ชั่วโมง)</div>
                    <select
                      value={durationHours}
                      onChange={e => { setDurationHours(Number(e.target.value)); setSelectedSlot(0) }}
                      className="w-full sm:w-48 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      {DURATION_HOURS_OPTIONS.map(h => (
                        <option key={h} value={h}>{h} ชม. (฿{(h * PRICE_PER_HOUR).toLocaleString()})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ช่วงเวลา</div>
                    <div className="grid sm:grid-cols-[240px_1fr] gap-3 items-start">
                      <div className="grid gap-2">
                        <select
                          value={selectedSlot ?? 0}
                          onChange={e => setSelectedSlot(Number(e.target.value))}
                          className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                        >
                          {hourOptions.map(h => (
                            <option key={h} value={h - BUSINESS_START_HOUR}>
                              {pad2(h)}.00
                            </option>
                          ))}
                        </select>
                        <div className="text-xs text-slate-500">
                          นาทีล็อคเป็น 00 • เวลาเปิด {pad2(BUSINESS_START_HOUR)}.00-{pad2(BUSINESS_END_HOUR)}.00
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <div className="text-sm font-semibold">
                          {selectedSlot === null ? 'กรุณาเลือกเวลาเริ่ม' : formatTimeRange(selectedSlot, durationHours)}
                        </div>
                        {selectedSlot !== null && exceeds && (
                          <div className="text-sm text-red-600">ช่วงเวลานี้เกินเวลาทำการ</div>
                        )}
                        {selectedSlot !== null && !exceeds && rangeTaken && (
                          <div className="text-sm text-red-600">ช่วงเวลานี้มีคนจองแล้ว</div>
                        )}
                        {sessionKind === 'pilot' && activePilots.length > 0 && !chosenPilot && (
                          <div className="text-sm text-red-600">กรุณาเลือกนักบิน</div>
                        )}
                        {sessionKind === 'sim' && availableSims.length > 0 && !simOk && (
                          <div className="text-sm text-red-600">กรุณาเลือกเครื่อง</div>
                        )}
                        <div className="flex gap-2">
                          <button className="btn btn-outline" onClick={() => { setSelectedSlot(null) }}>ล้าง</button>
                          <button className="btn btn-primary" disabled={!canProceedTime} onClick={() => setStep('form')}>ถัดไป</button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === 'form' && selectedDate && selectedSlot !== null && (
            <section className="grid md:grid-cols-2 gap-6">
              <div className="glass p-6 overflow-hidden">
                <div className="font-semibold mb-4">ข้อมูลผู้เรียน</div>

                <div className="mb-4 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
                  <div className="text-sm font-semibold">สรุปเวลาเรียน</div>
                  <div className="mt-1 text-slate-600 dark:text-slate-300">
                    {selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} • {formatTimeRange(selectedSlot, durationHours)}
                  </div>
                  <div className="mt-1 text-slate-600 dark:text-slate-300">
                    เรียนกับ: {sessionKind === 'sim' ? `เครื่อง ${selectedSimId === 'sim2' ? 'SIM 2' : 'SIM 1'}` : (chosenPilot?.name || chosenPilot?.email || 'นักบิน')} • {durationHours} ชม. • ฿{(durationHours * PRICE_PER_HOUR).toLocaleString()}
                  </div>
                  <div className="mt-3">
                    <button className="btn btn-outline" onClick={() => setStep('time')}>เปลี่ยนช่วงเวลา</button>
                  </div>
                </div>

                <div className="mb-3 flex flex-wrap gap-2">
                  <button
                    className="btn btn-outline"
                    onClick={() => setForm(f => ({
                      ...f,
                      name: user?.name || '',
                      email: (user?.email ? user.email.replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '') : ''),
                      phone: (user?.phone ? user.phone.replace(/\D/g, '').slice(0, 10) : '')
                    }))}
                  >
                    ใช้จากโปรไฟล์
                  </button>
                  
                  {savedStudents.length > 0 && (
                    <div className="relative group">
                      <button className="btn btn-outline">
                        เลือกผู้เรียนที่บันทึกไว้ ({savedStudents.length})
                      </button>
                      <div className="absolute top-full left-0 z-50 hidden group-hover:block w-64 glass p-2 mt-1 shadow-xl">
                        <div className="text-[10px] text-slate-400 mb-2 uppercase font-bold tracking-widest px-2">รายชื่อที่บันทึกไว้</div>
                        <div className="max-h-48 overflow-auto grid gap-1">
                          {savedStudents.map(s => (
                            <div key={s.id} className="flex items-center gap-1 group/item">
                              <button 
                                className="flex-1 text-left px-2 py-1.5 hover:bg-brand-50 dark:hover:bg-brand-900/20 rounded-lg transition"
                                onClick={() => {
                                  setForm({ name: s.name, email: s.email, phone: s.phone })
                                  setSaveThisStudent(false)
                                }}
                              >
                                <div className="text-sm font-semibold truncate">{s.name}</div>
                                <div className="text-[10px] text-slate-500 truncate">{s.email}</div>
                              </button>
                              <button 
                                className="p-1.5 hover:bg-red-50 text-red-400 opacity-0 group-hover/item:opacity-100 transition rounded-lg"
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  if(confirm('ยืนยันการลบรายชื่อนี้?')) {
                                    deleteSavedStudent(user!.email, s.id); 
                                    setTick(t => t+1);
                                  }
                                }}
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4">
                  <div className="grid gap-1">
                    <label className="text-sm text-slate-600 dark:text-slate-300">ชื่อ-นามสกุล</label>
                    <input className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm text-slate-600 dark:text-slate-300">อีเมล</label>
                    <input
                      type="email"
                      inputMode="email"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      value={form.email}
                      onChange={e => {
                        const raw = e.target.value
                        const noThai = raw.replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '')
                        const safe = noThai.replace(/[^A-Za-z0-9.@_%+-]/g, '')
                        setForm({ ...form, email: safe })
                      }}
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm text-slate-600 dark:text-slate-300">โทรศัพท์</label>
                    <input
                      inputMode="tel"
                      className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                      value={form.phone}
                      onChange={e => {
                        const v = e.target.value.replace(/[\u0E00-\u0E7F]/g, '').replace(/\D/g, '').slice(0, 10)
                        setForm({ ...form, phone: v })
                      }}
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={saveThisStudent} 
                      onChange={e => setSaveThisStudent(e.target.checked)}
                      className="size-4 rounded accent-brand-500"
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-300">บันทึกข้อมูลผู้เรียนนี้เพื่อการจอนครั้งถัดไป</span>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setStep('time')} className="btn btn-outline">ย้อนกลับ</button>
                    <button onClick={submit} className="btn btn-primary">ยืนยันการจอง</button>
                  </div>
                </div>
              </div>
              <div className="glass p-6 overflow-hidden">
                <div className="font-semibold">สรุปรายการ</div>
                <div className="mt-2 text-slate-500">เรียนกับ: {sessionKind === 'sim' ? `เครื่อง ${selectedSimId === 'sim2' ? 'SIM 2' : 'SIM 1'}` : (chosenPilot?.name || chosenPilot?.email || 'นักบิน')}</div>
                <div className="mt-2 text-slate-500">ระยะเวลา: {durationHours} ชม.</div>
                <div className="mt-2 text-slate-500">วันที่เรียน: {selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                <div className="mt-1 text-slate-500">เวลา: {formatTimeRange(selectedSlot, durationHours)}</div>
                <div className="mt-4 text-3xl font-bold text-brand-600">฿{(durationHours * PRICE_PER_HOUR).toLocaleString()}</div>
              </div>
            </section>
          )}
        </div>
      )}

      {view === 'payment' && lastBooked && (
        <section className="glass p-8 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="size-20 bg-emerald-100 text-emerald-600 rounded-full grid place-items-center text-4xl mb-6 animate-bounce">
            ✅
          </div>
          <h2 className="text-2xl font-bold mb-2">จองสำเร็จแล้ว!</h2>
          <p className="text-slate-500 mb-8">
            กรุณาชำระเงิน <strong>฿{(lastBooked.durationHours * PRICE_PER_HOUR).toLocaleString()}</strong> เพื่อยืนยันสิทธิ์การเข้าเรียน<br/>
            วันที่ {new Date(lastBooked.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} เวลา {formatTimeRange(lastBooked.slot, lastBooked.durationHours)} • {lastBooked.sessionKind === 'sim' ? `เครื่อง ${lastBooked.selectedSimId === 'sim2' ? 'SIM 2' : 'SIM 1'}` : (pilots.find(p => p.id === lastBooked.selectedPilotId)?.name || pilots.find(p => p.id === lastBooked.selectedPilotId)?.email || 'นักบิน')}
          </p>

          <div className="w-full grid gap-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-100 dark:border-slate-800 mb-8">
            <div>
              <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-3">ช่องทางชำระเงิน</div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-2xl shadow-sm mb-4">
                  {/* แทนที่ด้วย QR Code จริงของคุณ */}
                  <div className="size-48 bg-slate-100 grid place-items-center text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
                    <div className="text-center p-4">
                      <div className="text-2xl mb-1">📱</div>
                      <div className="text-[10px] font-bold">QR PromptPay</div>
                      <div className="text-[8px]">Scan to Pay</div>
                    </div>
                  </div>
                </div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">ธนาคารกสิกรไทย</div>
                <div className="text-2xl font-black text-brand-600 tracking-wider">012-3-45678-9</div>
                <div className="text-sm font-medium text-slate-500">ชื่อบัญชี: บจก. โรงเรียนการบิน FlightReserve</div>
              </div>
            </div>
            
            <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
              <div className="text-xs text-slate-400 uppercase font-bold tracking-widest mb-2">แจ้งชำระเงิน</div>
              <p className="text-sm text-slate-500 mb-4">เมื่อโอนเงินเสร็จแล้ว กรุณาส่งสลิปมาที่ Line Official หรือ Facebook ของโรงเรียน</p>
              <div className="flex gap-3 justify-center">
                <a href="#" className="px-6 py-2 bg-[#06C755] text-white rounded-xl font-bold text-sm hover:opacity-90 transition">LINE Official</a>
                <a href="#" className="px-6 py-2 bg-[#1877F2] text-white rounded-xl font-bold text-sm hover:opacity-90 transition">Facebook</a>
              </div>
            </div>
          </div>

          <button 
            onClick={() => { setView('my'); resetFlow(); }}
            className="btn btn-primary w-full py-4"
          >
            ดูรายการจองของฉัน
          </button>
        </section>
      )}

      {view === 'browse' && step === 'done' && (
        <section className="glass p-8 grid place-items-center text-center">
          <div className="text-5xl">✅</div>
          <div className="mt-4 text-2xl font-semibold">จองสำเร็จ</div>
          <div className="text-slate-600 dark:text-slate-300">ระบบได้บันทึกการจองของคุณแล้ว</div>
          <div className="mt-6 flex gap-2">
            <button onClick={resetFlow} className="btn btn-primary">จองเพิ่ม</button>
            <button onClick={() => { setStep('calendar'); setSelectedDate(addDays(new Date(), 1)) }} className="btn btn-outline">เลือกวันใหม่</button>
            {lastBooked && (
              <button
                className="btn btn-outline"
                onClick={() => {
                  const summary = `Flight Reserve • ${lastBooked.sessionKind === 'sim' ? 'SIM' : 'Pilot'} • ${formatTimeRange(lastBooked.slot, lastBooked.durationHours)}`
                  const blob = buildICS(summary, lastBooked.date, lastBooked.slot, lastBooked.durationHours)
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `booking-${lastBooked.date}.ics`
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                  URL.revokeObjectURL(url)
                }}
              >
                เพิ่มลงปฏิทิน (.ics)
              </button>
            )}
          </div>
        </section>
      )}

      {view === 'my' && <MyBookings userEmail={user.email} />}
      {view === 'profile' && <Profile />}
      {view === 'help' && <Help />}
      {view === 'admin' && <AdminDashboard mode="admin" />}
      {view === 'staff' && <AdminDashboard mode="staff" />}
    </AppLayout>
  )
}
