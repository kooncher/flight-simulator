import { useEffect, useMemo, useState } from 'react'
import Calendar from './components/Calendar'
import { addDays } from './lib/date'
import { getCourses, initAvailability, getAvailability, createBooking, ensureMonthAvailability, getTakenSlots, TIME_SLOTS, type Course, getSavedStudents, saveStudent, deleteSavedStudent } from './store/booking'
import { buildICS } from './lib/ics'
import Login from './components/Login'
import { getUser, logout, checkSession } from './store/auth'
import AppLayout from './layouts/AppLayout'
import AuthLayout from './layouts/AuthLayout'
import MyBookings from './components/MyBookings'
import { getBookings, getAnnouncements } from './store/booking'
import Profile from './components/Profile'
import Help from './components/Help'
import AdminDashboard from './components/AdminDashboard'

type Step = 'select' | 'calendar' | 'form' | 'done'

export default function App() {
  const [user, setUser] = useState(() => getUser())
  const [step, setStep] = useState<Step>('select')
  const [courses, setCourses] = useState<Course[]>([])
  const [course, setCourse] = useState<Course | null>(null)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null)
  const [availability, setAvailability] = useState<Record<string, number>>({})
  const [form, setForm] = useState({ name: '', email: user?.email ?? '', phone: '' })
  const [message, setMessage] = useState<string | null>(null)
  const [lastBooked, setLastBooked] = useState<{ courseName: string; date: string; slot: number } | null>(null)
  const [q, setQ] = useState('')
  const [view, setView] = useState<'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff' | 'payment'>(() => {
    const u = getUser()
    if (u?.role === 'Admin') return 'admin'
    if (u?.role === 'Technician' || u?.role === 'Pilot') return 'staff'
    return 'browse'
  })
  const [calExpanded, setCalExpanded] = useState(false)
  const [announcements, setAnnouncements] = useState<any[]>([])
  
  const [tick, setTick] = useState(0)
  const [saveThisStudent, setSaveThisStudent] = useState(false)
  const [savedStudents, setSavedStudents] = useState<any[]>([])
  const [takenSlotsForDate, setTakenSlotsForDate] = useState<number[]>([])

  const filteredCourses = useMemo(
    () => courses.filter(c => (c.name + ' ' + c.description).toLowerCase().includes(q.toLowerCase())),
    [courses, q]
  )
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
    if (isAdmin && view !== 'admin') setView('admin')
    if (isStaff && (view === 'browse' || view === 'admin')) setView('staff')
  }, [user, view])

  useEffect(() => {
    async function loadBrowseData() {
      const [annData, coursesData] = await Promise.all([
        getAnnouncements(),
        getCourses()
      ])
      setAnnouncements(annData)
      setCourses(coursesData)
    }
    if (view === 'browse') loadBrowseData()
  }, [view, step, tick])

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
    setStep('select')
    setCourse(null)
    setSelectedDate(null)
    setSelectedSlot(null)
    setForm({ name: '', email: '', phone: '' })
    setTick(t => t + 1)
  }

  function handleSelectCourse(c: Course) {
    setCourse(c)
    setStep('calendar')
  }

  async function handleSelectDate(d: Date) {
    setSelectedDate(d)
    // pick first available time slot for that date by default
    const key = d.toISOString().slice(0, 10)
    const takenArr = await getTakenSlots(key)
    setTakenSlotsForDate(takenArr)
    const taken = new Set(takenArr)
    const first = [0,1,2,3].find(i => !taken.has(i)) ?? null
    setSelectedSlot(first)
    setStep('form')
  }

  async function submit() {
    if (!course || !selectedDate || selectedSlot === null) {
      setMessage('เลือกช่วงเวลาด้วย')
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
      courseId: course.id,
      date: selectedDate.toISOString().slice(0, 10),
      name: form.name,
      email: emailSan,
      phone: phoneDigits,
      slot: selectedSlot
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
      setLastBooked({ courseName: course.name, date: selectedDate.toISOString().slice(0, 10), slot: selectedSlot })
      setSaveThisStudent(false)
    } else {
      const msg = 'error' in res ? res.error : 'ไม่สามารถจองได้'
      setMessage(msg)
      alert(msg)
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

  return (
    <AppLayout
      userEmail={user.email}
      userName={user.name || user.email}
      onLogout={() => { logout(); setUser(null) }}
      q={q}
      setQ={setQ}
      availability={availability}
      onStartNew={resetFlow}
      view={layoutView as any}
      onNavigate={setView}
      bookingsCount={myBookingsCount}
      userRole={user.role}
    >
      {!isStaff && (
        <section className="glass p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">จองวันเรียนคอร์สฝึกบิน</h1>
              <p className="text-slate-500 mt-1">เลือกคอร์ส เลือกวัน แล้วยืนยันการจอง</p>
            </div>
          </div>
        </section>
      )}

      {isAdmin && (
        <section className="glass p-6">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-600">Admin Dashboard</h1>
          <p className="text-slate-500 mt-1">จัดการระบบโรงเรียนการบิน</p>
        </section>
      )}

      {view === 'staff' && (isTechnician || isPilot) && (
        <section className="glass p-6">
          <h1 className="text-2xl md:text-3xl font-bold text-brand-600">{isTechnician ? 'Technician Panel' : 'Pilot Panel'}</h1>
          <p className="text-slate-500 mt-1">ควบคุมการปฏิบัติการและความพร้อมของ Flight Simulator</p>
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
        <div className="grid xl:grid-cols-[1fr_320px] gap-6 items-start">
          <div className="grid gap-6">
            {step === 'select' && (
              <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
                {filteredCourses.map(c => (
                  <div key={c.id} className="glass p-6 flex flex-col justify-between">
                    <div>
                      <div className="-mx-6 -mt-6 mb-5">
                        <div className="relative overflow-hidden rounded-t-2xl aspect-[16/9] bg-slate-100 dark:bg-slate-800">
                          <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                          {c.badge && (
                            <span
                              className={[
                                'absolute top-3 left-3 px-2 py-1 rounded-lg text-xs font-medium text-white shadow-md',
                                c.badge === 'NEW'
                                  ? 'bg-emerald-500'
                                  : c.badge === 'RECOMMENDED'
                                  ? 'bg-brand-500'
                                  : 'bg-fuchsia-500'
                              ].join(' ')}
                            >
                              {c.badge}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-lg font-semibold">{c.name}</div>
                      <div className="text-slate-500 mt-1">{c.description}</div>
                      {c.tags && c.tags.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {c.tags.map(t => (
                            <span key={t} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300">
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="text-2xl font-bold text-brand-600">฿{c.price.toLocaleString()}</div>
                        <div className="text-sm text-slate-500">หลักสูตร {c.hours} ชม.</div>
                      </div>
                    </div>
                    <button onClick={() => handleSelectCourse(c)} className="btn btn-primary mt-6">เลือกคอร์สนี้</button>
                  </div>
                ))}
                {filteredCourses.length === 0 && (
                  <div className="glass p-6">ไม่พบคอร์สที่ตรงกับคำค้น</div>
                )}
              </section>
            )}

            {step === 'calendar' && course && (
              <section className={['grid gap-6', calExpanded ? 'md:grid-cols-1' : 'md:grid-cols-[1.5fr_1fr]'].join(' ')}>
                <div className="glass p-6">
                  <div className="flex items-center justify-between mb-4 gap-2">
                    <div className="flex items-center gap-2">
                      <button className="btn btn-outline" onClick={prevMonth}>ก่อนหน้า</button>
                      <button className="btn btn-outline" onClick={nextMonth}>ถัดไป</button>
                    </div>
                    <div className="font-semibold">{month.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })}</div>
                    <button className="btn btn-outline" onClick={() => setCalExpanded(v => !v)}>{calExpanded ? 'ย่อปฏิทิน' : 'ขยายปฏิทิน'}</button>
                  </div>
                  <Calendar
                    month={month}
                    selected={selectedDate ?? undefined}
                    availability={availability}
                    onSelect={handleSelectDate}
                  />
                  <div className="mt-4 text-sm text-slate-500">
                    หมายเหตุ: จำกัดจองล่วงหน้ารวมไม่เกิน 8 ชั่วโมง และสูงสุด 2 วันต่อสัปดาห์ (จันทร์–อาทิตย์)
                  </div>
                </div>
                <div className="glass p-6">
                  <div className="font-semibold">คอร์สที่เลือก</div>
                  <div className="mt-2 text-2xl">{course.name}</div>
                  <div className="text-slate-500">{course.description}</div>
                  <div className="mt-4 text-3xl font-bold text-brand-600">฿{course.price.toLocaleString()}</div>
                  <button onClick={() => setStep('select')} className="btn btn-outline mt-6">เปลี่ยนคอร์ส</button>
                </div>
              </section>
            )}

            {step === 'form' && course && selectedDate && (
              <section className="grid md:grid-cols-2 gap-6">
                <div className="glass p-6">
                  <div className="font-semibold mb-4">ข้อมูลผู้เรียน</div>
                  <div className="mb-4">
                    <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">
                      ช่วงเวลา (รอบละ 2 ชั่วโมง)
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {TIME_SLOTS.map((t, i) => {
                        const disabled = takenSlotsForDate.includes(i)
                        const active = selectedSlot === i
                        return (
                          <button
                            key={t}
                            disabled={disabled}
                            onClick={() => setSelectedSlot(i)}
                            className={[
                              'px-3 py-2 rounded-xl border transition',
                              active ? 'bg-brand-500 text-white border-brand-500' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700',
                              disabled ? 'opacity-40 cursor-not-allowed' : 'hover:shadow'
                            ].join(' ')}
                          >
                            {t}
                          </button>
                        )
                      })}
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
                                    setSaveThisStudent(false) // already saved
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
                    {message && <div className="text-red-600 text-sm">{message}</div>}
                    <div className="flex gap-2">
                      <button onClick={() => setStep('calendar')} className="btn btn-outline">ย้อนกลับ</button>
                      <button onClick={submit} className="btn btn-primary">ยืนยันการจอง</button>
                    </div>
                  </div>
                </div>
                <div className="glass p-6">
                  <div className="font-semibold">สรุปรายการ</div>
                  <div className="mt-2">{course.name}</div>
                  <div className="text-slate-500">{course.description}</div>
                  <div className="mt-4">วันที่เรียน: {selectedDate.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
                  <div className="mt-4 text-3xl font-bold text-brand-600">฿{course.price.toLocaleString()}</div>
                </div>
              </section>
            )}
          </div>
          <div className="hidden xl:grid gap-6">
            <div className="glass p-6 bg-brand-500 text-white border-none shadow-lg shadow-brand-200 dark:shadow-none">
              <div className="text-xs text-white/70 font-bold uppercase tracking-widest mb-1">ความพร้อม</div>
              <div className="text-3xl font-black">24</div>
              <div className="text-white/80 text-[10px] font-medium">สล็อตว่างใน 7 วันถัดไป</div>
            </div>
          </div>
        </div>
      )}

      {view === 'payment' && lastBooked && (
        <section className="glass p-8 flex flex-col items-center text-center max-w-2xl mx-auto">
          <div className="size-20 bg-emerald-100 text-emerald-600 rounded-full grid place-items-center text-4xl mb-6 animate-bounce">
            ✅
          </div>
          <h2 className="text-2xl font-bold mb-2">จองสำเร็จแล้ว!</h2>
          <p className="text-slate-500 mb-8">
            กรุณาชำระเงินเพื่อยืนยันสิทธิ์การเข้าเรียนในคอร์ส <strong>{lastBooked.courseName}</strong><br/>
            วันที่ {new Date(lastBooked.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' })} รอบ {TIME_SLOTS[lastBooked.slot]}
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
                  const blob = buildICS(lastBooked.courseName, lastBooked.date, lastBooked.slot)
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
