import { getBookings, getCourses, TIME_SLOTS, getFlightLog, getBlockedSlots, toggleBlockSlot, type Course, updateCourse, addCourse, deleteCourse, updateBookingStatus, getAnnouncements, addAnnouncement, deleteAnnouncement, type Announcement, type Booking, uploadCourseImage, getSimulatorStatus, setSimulatorStatus, getReplacementRequests, createReplacementRequest, updateReplacementRequestStatus, acknowledgeReplacementRequest, type SimulatorStatus, type ReplacementRequest, claimBooking, unclaimBooking } from '../store/booking'
import { getAllUsers, getUsersByRole, getUser as getAuthUser, updateUserRole, type User, type UserRole } from '../store/auth'
import { useEffect, useMemo, useState, useRef } from 'react'

type Props = {
  mode?: 'admin' | 'staff'
}

export default function AdminDashboard({ mode = 'admin' }: Props) {
  const me = getAuthUser()
  const isAdmin = me?.role === 'Admin'
  const isTechnician = me?.role === 'Technician'

  const [tab, setTab] = useState<'ops' | 'overview' | 'bookings' | 'users' | 'calendar' | 'courses' | 'announcements' | 'my-tasks'>(() => {
    if (mode === 'admin') return 'overview'
    if (isTechnician) return 'ops'
    return 'bookings'
  })
  const [tick, setTick] = useState(0)
  
  const [bookings, setBookings] = useState<Booking[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [courses, setCourses] = useState<Course[]>([])
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [blockedMap, setBlockedMap] = useState<Record<string, number[]>>({})
  const [simStatuses, setSimStatuses] = useState<Record<string, SimulatorStatus>>({})
  const [loading, setLoading] = useState(true)

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [requests, setRequests] = useState<ReplacementRequest[]>([])
  const [reqDate, setReqDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [reqSlot, setReqSlot] = useState(0)
  const [reqReplacementName, setReqReplacementName] = useState('')
  const [reqReplacementPhone, setReqReplacementPhone] = useState('')
  const [reqNote, setReqNote] = useState('')
  const [reqSubmitting, setReqSubmitting] = useState(false)
  const [staffList, setStaffList] = useState<User[]>([])

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      const bP = getBookings()
      const blP = getBlockedSlots()
      const reqP = getReplacementRequests()
      const isAdminMode = mode === 'admin'
      const adminP: Promise<[User[], Course[], Announcement[]]> = isAdminMode
        ? Promise.all([getAllUsers(), getCourses(), getAnnouncements()])
        : Promise.resolve([[] as User[], [] as Course[], [] as Announcement[]])

      const [b, bl, req, [u, c, a]] = await Promise.all([bP, blP, reqP, adminP])
      setBookings(b.sort((a, b) => b.date.localeCompare(a.date)))
      setBlockedMap(bl)
      setRequests(req)

      if (isAdminMode) {
        setUsers(u)
        setCourses(c)
        setAnnouncements(a)
      } else {
        setUsers([])
        setCourses([])
        setAnnouncements([])
      }

      // Load simulator statuses for claimed bookings
      const claimedBookings = b.filter(x => x.instructorId)
      const statuses: Record<string, SimulatorStatus> = {}
      for (const cb of claimedBookings) {
        const s = await getSimulatorStatus(cb.id)
        if (s) statuses[cb.id] = s
      }
      setSimStatuses(statuses)

      const me = getAuthUser()
      const roleForReplacement: UserRole | null = me?.role === 'Pilot' ? 'Pilot' : (me?.role === 'Technician' ? 'Technician' : null)
      if (roleForReplacement) {
        const list = await getUsersByRole(roleForReplacement)
        setStaffList(list.filter(x => x.id !== me?.id))
      } else {
        setStaffList([])
      }
      setLoading(false)
    }
    loadData()
  }, [tick, mode])

  const courseMap = useMemo(() => courses.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {} as any), [courses])
  const userById = useMemo(() => users.reduce((acc, u) => {
    if (u.id) acc[u.id] = u
    return acc
  }, {} as Record<string, User>), [users])
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending_admin'), [requests])
  const pendingCount = pendingRequests.length
  const acknowledgedRequests = useMemo(() => {
    return requests
      .filter(r => r.status === 'acknowledged')
      .slice()
      .sort((a, b) => String(b.acknowledged_at || b.updated_at || '').localeCompare(String(a.acknowledged_at || a.updated_at || '')))
  }, [requests])
  
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [selectedUserFlightLog, setSelectedUserFlightLog] = useState<any[]>([])

  useEffect(() => {
    if (selectedUser) {
      getFlightLog(selectedUser.email).then(setSelectedUserFlightLog)
    }
  }, [selectedUser, tick])

  const roles: UserRole[] = ['Admin', 'Technician', 'Pilot', 'User']

  async function handleRoleChange(userId: string, role: UserRole) {
    if (!confirm(`ยืนยันการเปลี่ยน Role เป็น ${role}?`)) return
    const ok = await updateUserRole(userId, role)
    if (ok) {
      setTick(t => t + 1)
      if (selectedUser?.id === userId) {
        setSelectedUser({ ...selectedUser, role })
      }
    }
  }

  // Course management state
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [isAddingCourse, setIsAddingCourse] = useState(false)

  // Announcement State
  const [newAnn, setNewAnn] = useState({ text: '', type: 'info' as Announcement['type'] })

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingCourse) return

    setUploading(true)
    const url = await uploadCourseImage(file)
    if (url) {
      setEditingCourse({ ...editingCourse, image: url })
    } else {
      alert('อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่')
    }
    setUploading(false)
  }

  // Overview Stats
  const stats = useMemo(() => {
    const now = new Date()
    const todayStr = now.toISOString().slice(0, 10)
    
    const todayBookings = bookings.filter(b => b.date === todayStr && b.status !== 'cancelled')
    const totalRevenue = bookings.reduce((sum, b) => {
      if (b.status !== 'completed') return sum
      const c = courses.find(x => x.id === b.courseId)
      return sum + (c ? (c.price / (c.hours || 1)) * 2 : 0) // Estimating per 2h slot
    }, 0)

    const courseStats = courses.map(c => ({
      name: c.name,
      count: bookings.filter(b => b.courseId === c.id && b.status !== 'cancelled').length
    })).sort((a, b) => b.count - a.count)

    return {
      todayCount: todayBookings.length,
      totalCount: bookings.filter(b => b.status !== 'cancelled').length,
      userCount: users.length,
      estRevenue: totalRevenue,
      popularCourses: courseStats.slice(0, 3)
    }
  }, [bookings, users, courses])

  // Calendar blocking state
  const [blockDate, setBlockDate] = useState(new Date().toISOString().slice(0, 10))

  if (loading && tick === 0) return <div className="p-20 text-center text-slate-500">กำลังโหลดข้อมูล...</div>

  return (
    <div className="grid gap-6">
      <div className="grid gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 overflow-hidden">
          <div className="flex gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-x-auto whitespace-nowrap scrollbar-hide w-full sm:w-auto">
            {mode === 'staff' && me?.role === 'Technician' && (
              <button
                onClick={() => setTab('ops')}
                className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'ops' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
              >
                <span className="inline-flex items-center gap-2">
                  <span>Flight Simulator</span>
                </span>
              </button>
            )}
            <button 
              onClick={() => setTab('bookings')} 
              className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'bookings' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
            >
              รายการจอง (ทั้งหมด)
            </button>
            {me?.role === 'Pilot' && (
              <button 
                onClick={() => setTab('my-tasks')} 
                className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'my-tasks' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
              >
                งานสอนของฉัน
              </button>
            )}
            {mode === 'admin' && (
              <>
            <button 
              onClick={() => setTab('overview')} 
              className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'overview' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
            >
              <span className="inline-flex items-center gap-2">
                <span>ภาพรวม</span>
                {pendingCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-lg text-[10px] font-black bg-red-100 text-red-700">
                    {pendingCount}
                  </span>
                )}
              </span>
            </button>
            <button 
              onClick={() => setTab('users')} 
              className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'users' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
            >
              นักเรียน
            </button>
              </>
            )}
            {mode === 'admin' && (
              <button 
                onClick={() => setTab('calendar')} 
                className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
              >
                ตารางบิน
              </button>
            )}
            {mode === 'admin' && (
              <>
            <button 
               onClick={() => setTab('courses')} 
               className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'courses' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
             >
               จัดการคอร์ส
             </button>
             <button 
               onClick={() => setTab('announcements')} 
               className={['shrink-0 px-4 py-2 rounded-lg text-sm transition', tab === 'announcements' ? 'bg-white dark:bg-slate-700 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'].join(' ')}
             >
               ประกาศ
             </button>
              </>
            )}
          </div>
          <div className="flex items-center sm:justify-end shrink-0">
            <button 
              onClick={() => setTick(t => t+1)}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:text-brand-500 transition-colors bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700"
            >
              {loading ? '⏳ กำลังโหลด...' : '🔄 รีเฟรชข้อมูล'}
            </button>
          </div>
        </div>
      </div>
      {tab === 'ops' && (
        <div className="grid gap-6">
          <div className="glass p-4 sm:p-6 overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-bold">สถานะอุปกรณ์ (ตามรายการสอน)</h2>
                <div className="text-sm text-slate-500 mt-1">ช่างเทคนิคต้องระบุความพร้อมของอุปกรณ์สำหรับคิวที่มีนักบินรับงานแล้ว</div>

                <div className="mt-6 grid gap-4">
                  {bookings.filter(b => b.instructorId && b.status === 'pending').map(b => {
                    const instructor = users.find(u => u.id === b.instructorId)
                    const status = simStatuses[b.id]
                    const isReady = status ? status.ready : true
                    const note = status?.note || ''

                    return (
                      <div key={b.id} className={['p-3 sm:p-4 rounded-xl border transition-all', !isReady ? 'border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10' : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50'].join(' ')}>
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 mb-3">
                          <div className="min-w-0">
                            <div className="font-bold text-sm sm:text-base">{new Date(b.date).toLocaleDateString('th-TH')} • {TIME_SLOTS[b.slot]}</div>
                            <div className="text-xs sm:text-sm text-slate-500 truncate">นักเรียน: {b.name} | ผู้สอน: {instructor?.name || 'ไม่ระบุ'}</div>
                          </div>
                          <span className={['self-start px-2 py-1 rounded-lg text-[10px] font-bold uppercase shrink-0', isReady ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'].join(' ')}>
                            {isReady ? 'พร้อมใช้งาน' : 'ไม่พร้อม'}
                          </span>
                        </div>

                        <div className="grid gap-2">
                          <div className="flex gap-2">
                            <button
                              onClick={async () => {
                                await setSimulatorStatus(b.id, true, '')
                                setTick(t => t+1)
                              }}
                              className={['btn py-1.5 text-xs flex-1', isReady ? 'btn-primary' : 'btn-outline bg-white dark:bg-slate-800'].join(' ')}
                            >
                              พร้อม
                            </button>
                            <button
                              onClick={async () => {
                                const reason = prompt('ระบุเหตุผลที่ไม่พร้อม (ระบบจะแสดงให้นักบินเห็น):')
                                if (reason === null) return
                                if (!reason.trim()) { alert('ต้องระบุเหตุผล'); return }
                                await setSimulatorStatus(b.id, false, reason)
                                setTick(t => t+1)
                              }}
                              className={['btn py-1.5 text-xs flex-1', !isReady ? 'btn-primary bg-red-600 hover:bg-red-700 border-red-600 text-white' : 'btn-outline bg-white dark:bg-slate-800 hover:text-red-600 hover:border-red-200'].join(' ')}
                            >
                              ไม่พร้อม
                            </button>
                          </div>
                          {!isReady && note && (
                            <div className="text-xs text-red-700 bg-white/60 dark:bg-black/20 p-2.5 rounded-lg mt-1 font-medium border border-red-100 dark:border-red-900/30">
                              <span className="font-bold">หมายเหตุจากช่าง:</span> {note}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {bookings.filter(b => b.instructorId && b.status === 'pending').length === 0 && (
                    <div className="text-center py-8 text-slate-400">ยังไม่มีคิวที่นักบินรับงานสอน</div>
                  )}
                </div>
              </div>

              <div className="w-full lg:w-[420px] rounded-3xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-4 sm:p-5">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-3">แจ้งแอดมิน / หาแทน</div>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <label className="text-sm font-semibold">วันที่</label>
                    <input
                      type="date"
                      value={reqDate}
                      min={new Date().toISOString().slice(0, 10)}
                      onChange={e => setReqDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm font-semibold">ช่วงเวลา</label>
                    <select
                      value={reqSlot}
                      onChange={e => setReqSlot(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    >
                      {TIME_SLOTS.map((t, i) => (
                        <option key={t} value={i}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm font-semibold">คนแทน (ถ้ามี)</label>
                    {staffList.length > 0 && (
                      <select
                        defaultValue=""
                        onChange={e => {
                          const u = staffList.find(x => x.id === e.target.value)
                          setReqReplacementName(u?.name || u?.email || '')
                          setReqReplacementPhone((u?.phone || '').replace(/\D/g, '').slice(0, 10))
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 mb-2"
                      >
                        <option value="" disabled>กรุณาเลือกคนแทน</option>
                        {staffList.map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name || 'ไม่ระบุชื่อ'}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      value={reqReplacementName}
                      onChange={e => setReqReplacementName(e.target.value)}
                      placeholder="ชื่อคนแทน"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                    <input
                      value={reqReplacementPhone}
                      onChange={e => setReqReplacementPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="เบอร์ติดต่อคนแทน"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                    />
                  </div>
                  <div className="grid gap-1">
                    <label className="text-sm font-semibold">รายละเอียดแจ้งแอดมิน</label>
                    <textarea
                      value={reqNote}
                      onChange={e => setReqNote(e.target.value)}
                      placeholder="อธิบายเหตุผล/สถานการณ์ และสิ่งที่ต้องการให้แอดมินรับทราบ"
                      className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 h-24 focus:ring-2 focus:ring-brand-500 transition-all outline-none"
                    />
                  </div>
                  <button
                    disabled={reqSubmitting}
                    onClick={async () => {
                      if (!reqNote.trim()) {
                        alert('กรุณากรอกรายละเอียดก่อนส่งแจ้งแอดมิน')
                        return
                      }
                      setReqSubmitting(true)
                      const res = await createReplacementRequest({
                        date: reqDate,
                        slot: reqSlot,
                        replacement_name: reqReplacementName.trim() || undefined,
                        replacement_phone: reqReplacementPhone.trim() || undefined,
                        note: reqNote.trim()
                      })
                      setReqSubmitting(false)
                      if (!res.ok) {
                        alert(res.error)
                        return
                      }
                      setReqNote('')
                      setReqReplacementName('')
                      setReqReplacementPhone('')
                      setTick(t => t + 1)
                    }}
                    className="btn btn-primary w-full py-3"
                  >
                    {reqSubmitting ? 'กำลังส่ง...' : 'ส่งแจ้งแอดมิน'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="glass p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <h3 className="font-bold">รายการแจ้งแอดมินล่าสุด</h3>
              <button onClick={() => setTick(t => t + 1)} className="btn btn-outline">รีเฟรช</button>
            </div>
            <div className="grid gap-3">
              {requests.slice(0, 10).map(r => (
                <div key={r.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {new Date(r.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} • {TIME_SLOTS[r.slot]}
                      </div>
                      <div className="text-sm text-slate-500 mt-1">{r.note}</div>
                      {(r.replacement_name || r.replacement_phone) && (
                        <div className="text-xs text-slate-500 mt-2">
                          คนแทน: {r.replacement_name || '-'} {r.replacement_phone ? `(${r.replacement_phone})` : ''}
                        </div>
                      )}
                      {r.admin_note && (
                        <div className="mt-2 text-[10px] text-brand-700 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded-xl">
                          หมายเหตุแอดมิน: {r.admin_note}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={[
                        'px-2 py-1 rounded-lg text-[10px] font-black uppercase',
                        r.status === 'pending_admin' ? 'bg-amber-100 text-amber-700' :
                        r.status === 'acknowledged' ? 'bg-blue-100 text-blue-700' :
                        r.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                        'bg-slate-200 text-slate-700'
                      ].join(' ')}>
                        {r.status === 'pending_admin' ? 'รอแอดมิน' : r.status === 'acknowledged' ? 'รับทราบแล้ว' : r.status === 'approved' ? 'อนุมัติ' : r.status === 'rejected' ? 'ไม่อนุมัติ' : 'ยกเลิก'}
                      </span>

                      {isAdmin && r.status === 'pending_admin' && (
                        <>
                          <button
                            onClick={async () => {
                              const note = prompt('หมายเหตุแอดมิน (ถ้ามี)') || undefined
                              const res = await updateReplacementRequestStatus(r.id, 'approved', note)
                              if (!res.ok) alert(res.error)
                              setTick(t => t + 1)
                            }}
                            className="btn btn-primary py-1.5 text-xs"
                          >
                            อนุมัติ
                          </button>
                          <button
                            onClick={async () => {
                              const note = prompt('เหตุผล/หมายเหตุแอดมิน (ถ้ามี)') || undefined
                              const res = await updateReplacementRequestStatus(r.id, 'rejected', note)
                              if (!res.ok) alert(res.error)
                              setTick(t => t + 1)
                            }}
                            className="btn btn-outline border-red-200 text-red-500 hover:bg-red-50 py-1.5 text-xs"
                          >
                            ปฏิเสธ
                          </button>
                        </>
                      )}

                      {!isAdmin && r.status === 'pending_admin' && (
                        <button
                          onClick={async () => {
                            if (!confirm('ยืนยันการยกเลิกการแจ้งนี้?')) return
                            const res = await updateReplacementRequestStatus(r.id, 'cancelled')
                            if (!res.ok) alert(res.error)
                            setTick(t => t + 1)
                          }}
                          className="btn btn-outline border-red-200 text-red-500 hover:bg-red-50 py-1.5 text-xs"
                        >
                          ยกเลิก
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {requests.length === 0 && (
                <div className="text-center py-10 text-slate-400 italic">ยังไม่มีรายการแจ้งแอดมิน</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid gap-4 sm:gap-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="glass p-4 sm:p-6 overflow-hidden flex flex-col justify-between h-full">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2 truncate">จองวันนี้ (Active)</div>
              <div className="text-2xl sm:text-3xl font-bold text-brand-600">{stats.todayCount}</div>
            </div>
            <div className="glass p-4 sm:p-6 overflow-hidden flex flex-col justify-between h-full">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2 truncate">จองสะสม</div>
              <div className="text-2xl sm:text-3xl font-bold">{stats.totalCount}</div>
            </div>
            <div className="glass p-4 sm:p-6 overflow-hidden flex flex-col justify-between h-full">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2 truncate">นักเรียนทั้งหมด</div>
              <div className="text-2xl sm:text-3xl font-bold">{stats.userCount}</div>
            </div>
            <div className="glass p-4 sm:p-6 overflow-hidden flex flex-col justify-between h-full">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-2 truncate">รายได้จริง</div>
              <div className="text-xl sm:text-3xl font-bold text-emerald-600 truncate">฿{stats.estRevenue.toLocaleString()}</div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass p-4 sm:p-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-bold">แจ้งจากทีมงาน</h3>
                <div className="text-[10px] font-bold text-slate-400 uppercase shrink-0">รอรับทราบ {pendingCount}</div>
              </div>
              <div className="grid gap-3">
                {pendingCount > 0 ? (
                  pendingRequests.slice(0, 3).map(r => {
                    const who = userById[r.created_by]
                    const whoLabel = who?.name || who?.email || 'ไม่ทราบผู้ส่ง'
                    return (
                      <div key={r.id} className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-semibold truncate">{whoLabel}</div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {new Date(r.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })} • {TIME_SLOTS[r.slot]}
                            </div>
                            <div className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">{r.note}</div>
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-2">
                            <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase bg-red-100 text-red-700">ใหม่</span>
                            <button
                              onClick={async () => {
                                const res = await acknowledgeReplacementRequest(r.id)
                                if (!res.ok) {
                                  alert(res.error)
                                  return
                                }
                                setTick(t => t + 1)
                              }}
                              className="btn btn-outline py-1.5 text-xs"
                            >
                              รับทราบ
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div className="text-sm text-slate-500">ยังไม่มีรายการรออนุมัติ</div>
                )}
              </div>
              {acknowledgedRequests.length > 0 && (
                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">รับทราบล่าสุด</div>
                  <div className="grid gap-2">
                    {acknowledgedRequests.slice(0, 5).map(r => {
                      const who = userById[r.created_by]
                      const whoLabel = who?.name || who?.email || 'ไม่ทราบผู้ส่ง'
                      const ackBy = r.acknowledged_by ? userById[r.acknowledged_by] : undefined
                      const ackLabel = ackBy?.name || ackBy?.email || 'แอดมิน'
                      const when = r.acknowledged_at || r.updated_at
                      return (
                        <div key={r.id} className="flex items-center justify-between gap-3 text-xs text-slate-500">
                          <div className="min-w-0 truncate">
                            {whoLabel} • {TIME_SLOTS[r.slot]} • {new Date(r.date).toLocaleDateString('th-TH')}
                          </div>
                          <div className="shrink-0 text-[10px] text-slate-400">
                            {ackLabel}{when ? ` • ${new Date(when).toLocaleString('th-TH')}` : ''}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="glass p-4 sm:p-6 flex flex-col justify-center items-center text-center overflow-hidden">
              <div className="text-4xl mb-3">👨‍✈️</div>
              <h3 className="font-bold">โรงเรียนการบินพร้อมให้บริการ</h3>
              <p className="text-sm text-slate-500 mt-1">ระบบทำงานปกติ ตรวจสอบตารางบินล่าสุดได้เสมอ</p>
            </div>
          </div>
          
          <div className="glass p-4 sm:p-6 overflow-hidden">
            <h3 className="font-bold mb-4">คอร์สยอดนิยม (จอง Active)</h3>
            <div className="grid gap-3">
              {stats.popularCourses.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex items-center gap-3">
                    <span className="size-6 rounded-full bg-brand-100 dark:bg-brand-900/30 text-brand-600 grid place-items-center text-xs font-bold">{i+1}</span>
                    <span className="font-medium">{c.name}</span>
                  </div>
                  <div className="font-bold">{c.count} จอง</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div className="grid gap-4">
          {/* Desktop View (Table) */}
          <div className="hidden lg:block glass overflow-x-auto">
            <table className="min-w-[920px] w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4 whitespace-nowrap">วันที่ / เวลา</th>
                  <th className="px-6 py-4">นักเรียน</th>
                  <th className="px-6 py-4">คอร์ส / สถานะ</th>
                  <th className="px-6 py-4 whitespace-nowrap">ติดต่อ</th>
                  <th className="px-6 py-4 whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bookings.map(b => {
                  const isClaimedByMe = b.instructorId === me?.id
                  const isClaimed = !!b.instructorId
                  const instructorUser = b.instructorId ? users.find(u => u.id === b.instructorId) : null
                  
                  return (
                  <tr key={b.id} className={['hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors', b.status === 'cancelled' ? 'opacity-50 grayscale' : ''].join(' ')}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold">{new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="text-xs text-slate-500">{TIME_SLOTS[b.slot]}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[320px]">{b.email}</div>
                      {b.note && (
                        <div className="mt-1 text-[10px] text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded italic">
                          Note: {b.note}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-2">
                        <span className="px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-xs font-medium">
                          {courseMap[b.courseId] || b.courseId}
                        </span>
                      </div>
                      {b.status === 'completed' && <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">เรียนจบแล้ว</span>}
                      {b.status === 'pending' && <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">รอดำเนินการ</span>}
                      {b.status === 'cancelled' && <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold">ยกเลิกแล้ว</span>}
                      
                      {b.status === 'pending' && (
                        <div className="mt-2">
                          {!isClaimed ? (
                            me?.role === 'Technician' ? (
                              <div className="text-[10px] text-amber-600 font-medium italic">รอนักบินรับงานสอน...</div>
                            ) : (
                              <button 
                                onClick={async () => {
                                  if (!me?.id) return
                                  const res = await claimBooking(b.id, me.id)
                                  if (res.ok) setTick(t => t+1)
                                }}
                                className="px-2 py-1 bg-brand-500 hover:bg-brand-600 text-white text-[10px] font-bold rounded-lg transition"
                              >
                                รับงานสอนนี้
                              </button>
                            )
                          ) : (
                            <div className="grid gap-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={['px-2 py-1 rounded-lg text-[10px] font-bold', isClaimedByMe ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'].join(' ')}>
                                  ผู้สอน: {instructorUser?.name || 'รับงานแล้ว'} {isClaimedByMe ? '(คุณ)' : ''}
                                </span>
                                {(isClaimedByMe || isAdmin) && (
                                  <button 
                                    onClick={async () => {
                                      const res = await unclaimBooking(b.id)
                                      if (res.ok) setTick(t => t+1)
                                    }}
                                    className="text-[10px] text-red-500 hover:underline"
                                  >
                                    ยกเลิกรับงาน
                                  </button>
                                )}
                              </div>
                              {/* แสดงสถานะเครื่องที่ช่างอัปเดตให้นักบินเห็น */}
                              {simStatuses[b.id] && (
                                <div className={['px-2 py-1.5 rounded-lg text-[10px] border flex flex-wrap items-center gap-2', simStatuses[b.id].ready ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                                  <span className="font-bold whitespace-nowrap">สถานะอุปกรณ์:</span>
                                  <span className="break-all">{simStatuses[b.id].ready ? 'พร้อมใช้งาน' : `ไม่พร้อม (${simStatuses[b.id].note})`}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {b.phone}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {b.status === 'pending' && (
                          <>
                            <button 
                              disabled={!isClaimedByMe && !isAdmin}
                              onClick={async () => { if(confirm('ยืนยันว่านักเรียนเรียนจบรอบนี้แล้ว?')) { await updateBookingStatus(b.id, 'completed'); setTick(t => t+1) } }}
                              className={['text-xs font-bold text-left', (!isClaimedByMe && !isAdmin) ? 'text-slate-300 cursor-not-allowed' : 'text-emerald-500 hover:text-emerald-600'].join(' ')}
                              title={(!isClaimedByMe && !isAdmin) ? 'ต้องกดรับงานก่อนถึงจะอัปเดตสถานะได้' : ''}
                            >
                              Mark Completed
                            </button>
                            <button 
                              disabled={!isClaimedByMe && !isAdmin}
                              onClick={async () => { if(confirm('ยืนยันการยกเลิกการจองนี้?')) { await updateBookingStatus(b.id, 'cancelled'); setTick(t => t+1) } }}
                              className={['text-xs font-bold text-left', (!isClaimedByMe && !isAdmin) ? 'text-slate-300 cursor-not-allowed' : 'text-red-500 hover:text-red-600'].join(' ')}
                              title={(!isClaimedByMe && !isAdmin) ? 'ต้องกดรับงานก่อนถึงจะอัปเดตสถานะได้' : ''}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {b.status !== 'pending' && (isAdmin || isClaimedByMe) && (
                          <button 
                            onClick={async () => { await updateBookingStatus(b.id, 'pending'); setTick(t => t+1) }}
                            className="text-slate-400 hover:text-slate-600 text-xs font-medium text-left"
                          >
                            Revert to Pending
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
                {bookings.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">ยังไม่มีข้อมูลการจอง</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Cards) */}
          <div className="grid lg:hidden gap-4 overflow-hidden">
            {bookings.length === 0 ? (
              <div className="glass p-8 text-center text-slate-400">ยังไม่มีข้อมูลการจอง</div>
            ) : (
              bookings.map(b => {
                const isClaimedByMe = b.instructorId === me?.id
                const isClaimed = !!b.instructorId
                const instructorUser = b.instructorId ? users.find(u => u.id === b.instructorId) : null
                
                return (
                  <div key={b.id} className={['glass p-4 sm:p-5 flex flex-col gap-4 overflow-hidden', b.status === 'cancelled' ? 'opacity-50 grayscale' : ''].join(' ')}>
                    {/* Header: Date & Status */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">{new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div className="text-sm font-medium text-brand-500">{TIME_SLOTS[b.slot]}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {b.status === 'completed' && <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">เรียนจบแล้ว</span>}
                        {b.status === 'pending' && <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold">รอดำเนินการ</span>}
                        {b.status === 'cancelled' && <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold">ยกเลิกแล้ว</span>}
                        <span className="px-2 py-0.5 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-[10px] font-medium mt-1">
                          {courseMap[b.courseId] || b.courseId}
                        </span>
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-slate-500 flex justify-between items-center mt-1">
                        <span className="truncate">{b.email}</span>
                        <a href={`tel:${b.phone}`} className="text-brand-500 font-medium ml-2 shrink-0">{b.phone}</a>
                      </div>
                      {b.note && (
                        <div className="mt-2 text-xs text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded italic">
                          Note: {b.note}
                        </div>
                      )}
                    </div>

                    {/* Instructor & Sim Status (if pending) */}
                    {b.status === 'pending' && (
                      <div className="flex flex-col gap-2">
                        {!isClaimed ? (
                          me?.role === 'Technician' ? (
                            <div className="text-xs text-amber-600 font-medium italic text-center py-2 bg-amber-50 dark:bg-amber-900/10 rounded-xl">รอนักบินรับงานสอน...</div>
                          ) : (
                            <button 
                              onClick={async () => {
                                if (!me?.id) return
                                const res = await claimBooking(b.id, me.id)
                                if (res.ok) setTick(t => t+1)
                              }}
                              className="w-full py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-bold rounded-xl transition"
                            >
                              รับงานสอนนี้
                            </button>
                          )
                        ) : (
                          <div className="grid gap-2">
                            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                              <span className={['text-xs font-bold', isClaimedByMe ? 'text-brand-600' : 'text-slate-600'].join(' ')}>
                                ผู้สอน: {instructorUser?.name || 'รับงานแล้ว'} {isClaimedByMe ? '(คุณ)' : ''}
                              </span>
                              {(isClaimedByMe || isAdmin) && (
                                <button 
                                  onClick={async () => {
                                    const res = await unclaimBooking(b.id)
                                    if (res.ok) setTick(t => t+1)
                                  }}
                                  className="text-[10px] text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg"
                                >
                                  ยกเลิกรับงาน
                                </button>
                              )}
                            </div>
                            
                            {/* แสดงสถานะเครื่อง */}
                            {simStatuses[b.id] && (
                              <div className={['p-2.5 rounded-xl text-xs border flex flex-col gap-1', simStatuses[b.id].ready ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                                <div className="font-bold flex items-center gap-1">
                                  <span className="size-2 rounded-full bg-current"></span>
                                  สถานะอุปกรณ์: {simStatuses[b.id].ready ? 'พร้อมใช้งาน' : 'ไม่พร้อม'}
                                </div>
                                {!simStatuses[b.id].ready && simStatuses[b.id].note && (
                                  <div className="pl-3 opacity-80 break-all">{simStatuses[b.id].note}</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-1 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {b.status === 'pending' && (
                        <>
                          <button 
                            disabled={!isClaimedByMe && !isAdmin}
                            onClick={async () => { if(confirm('ยืนยันว่านักเรียนเรียนจบรอบนี้แล้ว?')) { await updateBookingStatus(b.id, 'completed'); setTick(t => t+1) } }}
                            className={['flex-1 py-2 rounded-xl text-xs font-bold transition-colors', (!isClaimedByMe && !isAdmin) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'].join(' ')}
                          >
                            Mark Completed
                          </button>
                          <button 
                            disabled={!isClaimedByMe && !isAdmin}
                            onClick={async () => { if(confirm('ยืนยันการยกเลิกการจองนี้?')) { await updateBookingStatus(b.id, 'cancelled'); setTick(t => t+1) } }}
                            className="px-4 py-2 rounded-xl text-xs font-bold transition-colors bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {b.status !== 'pending' && (
                        <button 
                          onClick={async () => { await updateBookingStatus(b.id, 'pending'); setTick(t => t+1) }}
                          className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors"
                        >
                          Revert to Pending
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {tab === 'my-tasks' && (
        <div className="grid gap-4">
          {/* Desktop View (Table) */}
          <div className="hidden lg:block glass overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                  <th className="px-6 py-4 whitespace-nowrap">วันที่ / เวลา</th>
                  <th className="px-6 py-4">นักเรียน</th>
                  <th className="px-6 py-4">คอร์ส / สถานะ</th>
                  <th className="px-6 py-4 whitespace-nowrap">ติดต่อ</th>
                  <th className="px-6 py-4 whitespace-nowrap">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {bookings.filter(b => b.instructorId === me?.id).map(b => {
                  const instructorUser = users.find(u => u.id === b.instructorId)
                  
                  return (
                  <tr key={b.id} className={['hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors', b.status === 'cancelled' ? 'opacity-50 grayscale' : ''].join(' ')}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold">{new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="text-xs text-slate-500">{TIME_SLOTS[b.slot]}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[320px]">{b.email}</div>
                      {b.note && (
                        <div className="mt-1 text-[10px] text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded italic">
                          Note: {b.note}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="mb-2">
                        <span className="px-2 py-1 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-xs font-medium">
                          {courseMap[b.courseId] || b.courseId}
                        </span>
                      </div>
                      {b.status === 'completed' && <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-bold">เรียนจบแล้ว</span>}
                      {b.status === 'pending' && <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-[10px] font-bold">รอดำเนินการ</span>}
                      {b.status === 'cancelled' && <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold">ยกเลิกแล้ว</span>}
                      
                      {b.status === 'pending' && (
                        <div className="mt-2">
                          <div className="grid gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-brand-100 text-brand-700">
                                ผู้สอน: {instructorUser?.name || 'คุณ'} (คุณ)
                              </span>
                              <button 
                                onClick={async () => {
                                  const res = await unclaimBooking(b.id)
                                  if (res.ok) setTick(t => t+1)
                                }}
                                className="text-[10px] text-red-500 hover:underline"
                              >
                                ยกเลิกรับงาน
                              </button>
                            </div>
                            {simStatuses[b.id] && (
                              <div className={['px-2 py-1.5 rounded-lg text-[10px] border flex flex-wrap items-center gap-2', simStatuses[b.id].ready ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                                <span className="font-bold whitespace-nowrap">สถานะอุปกรณ์:</span>
                                <span className="break-all">{simStatuses[b.id].ready ? 'พร้อมใช้งาน' : `ไม่พร้อม (${simStatuses[b.id].note})`}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-xs whitespace-nowrap">
                      {b.phone}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        {b.status === 'pending' && (
                          <>
                            <button 
                              onClick={async () => { if(confirm('ยืนยันว่านักเรียนเรียนจบรอบนี้แล้ว?')) { await updateBookingStatus(b.id, 'completed'); setTick(t => t+1) } }}
                              className="text-xs font-bold text-left text-emerald-500 hover:text-emerald-600"
                            >
                              Mark Completed
                            </button>
                            <button 
                              onClick={async () => { if(confirm('ยืนยันการยกเลิกการจองนี้?')) { await updateBookingStatus(b.id, 'cancelled'); setTick(t => t+1) } }}
                              className="text-xs font-bold text-left text-red-500 hover:text-red-600"
                            >
                              Cancel
                            </button>
                          </>
                        )}
                        {b.status !== 'pending' && (
                          <button 
                            onClick={async () => { await updateBookingStatus(b.id, 'pending'); setTick(t => t+1) }}
                            className="text-slate-400 hover:text-slate-600 text-xs font-medium text-left"
                          >
                            Revert to Pending
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )})}
                {bookings.filter(b => b.instructorId === me?.id).length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400">คุณยังไม่ได้รับงานสอนใดๆ</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile View (Cards) */}
          <div className="grid lg:hidden gap-4 overflow-hidden">
            {bookings.filter(b => b.instructorId === me?.id).length === 0 ? (
              <div className="glass p-8 text-center text-slate-400">คุณยังไม่ได้รับงานสอนใดๆ</div>
            ) : (
              bookings.filter(b => b.instructorId === me?.id).map(b => {
                const instructorUser = users.find(u => u.id === b.instructorId)
                
                return (
                  <div key={b.id} className={['glass p-4 sm:p-5 flex flex-col gap-4 overflow-hidden', b.status === 'cancelled' ? 'opacity-50 grayscale' : ''].join(' ')}>
                    {/* Header: Date & Status */}
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-lg">{new Date(b.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                        <div className="text-sm font-medium text-brand-500">{TIME_SLOTS[b.slot]}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {b.status === 'completed' && <span className="px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-bold">เรียนจบแล้ว</span>}
                        {b.status === 'pending' && <span className="px-2 py-0.5 rounded-lg bg-amber-100 text-amber-700 text-xs font-bold">รอดำเนินการ</span>}
                        {b.status === 'cancelled' && <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold">ยกเลิกแล้ว</span>}
                        <span className="px-2 py-0.5 rounded-lg bg-brand-50 dark:bg-brand-900/20 text-brand-600 text-[10px] font-medium mt-1">
                          {courseMap[b.courseId] || b.courseId}
                        </span>
                      </div>
                    </div>

                    {/* Student Info */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="font-semibold">{b.name}</div>
                      <div className="text-xs text-slate-500 flex justify-between items-center mt-1">
                        <span className="truncate">{b.email}</span>
                        <a href={`tel:${b.phone}`} className="text-brand-500 font-medium ml-2 shrink-0">{b.phone}</a>
                      </div>
                      {b.note && (
                        <div className="mt-2 text-xs text-brand-600 bg-brand-50 dark:bg-brand-900/20 px-2 py-1 rounded italic">
                          Note: {b.note}
                        </div>
                      )}
                    </div>

                    {/* Instructor & Sim Status (if pending) */}
                    {b.status === 'pending' && (
                      <div className="flex flex-col gap-2">
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-brand-600">
                              ผู้สอน: {instructorUser?.name || 'คุณ'} (คุณ)
                            </span>
                            <button 
                              onClick={async () => {
                                const res = await unclaimBooking(b.id)
                                if (res.ok) setTick(t => t+1)
                              }}
                              className="text-[10px] text-red-500 hover:bg-red-50 px-2 py-1 rounded-lg"
                            >
                              ยกเลิกรับงาน
                            </button>
                          </div>
                          
                          {/* แสดงสถานะเครื่อง */}
                          {simStatuses[b.id] && (
                            <div className={['p-2.5 rounded-xl text-xs border flex flex-col gap-1', simStatuses[b.id].ready ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'].join(' ')}>
                              <div className="font-bold flex items-center gap-1">
                                <span className="size-2 rounded-full bg-current"></span>
                                สถานะอุปกรณ์: {simStatuses[b.id].ready ? 'พร้อมใช้งาน' : 'ไม่พร้อม'}
                              </div>
                              {!simStatuses[b.id].ready && simStatuses[b.id].note && (
                                <div className="pl-3 opacity-80 break-all">{simStatuses[b.id].note}</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 mt-1 pt-4 border-t border-slate-100 dark:border-slate-800">
                      {b.status === 'pending' && (
                        <>
                          <button 
                            onClick={async () => { if(confirm('ยืนยันว่านักเรียนเรียนจบรอบนี้แล้ว?')) { await updateBookingStatus(b.id, 'completed'); setTick(t => t+1) } }}
                            className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                          >
                            Mark Completed
                          </button>
                          <button 
                            onClick={async () => { if(confirm('ยืนยันการยกเลิกการจองนี้?')) { await updateBookingStatus(b.id, 'cancelled'); setTick(t => t+1) } }}
                            className="px-4 py-2 rounded-xl text-xs font-bold transition-colors bg-red-50 text-red-600 hover:bg-red-100"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {b.status !== 'pending' && (
                        <button 
                          onClick={async () => { await updateBookingStatus(b.id, 'pending'); setTick(t => t+1) }}
                          className="w-full py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold transition-colors"
                        >
                          Revert to Pending
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="grid lg:grid-cols-[1fr_1.5fr] gap-4 sm:gap-6 min-w-0">
          <div className="glass overflow-hidden h-fit flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 font-semibold bg-slate-50/50 dark:bg-slate-900/50">นักเรียนทั้งหมด</div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[300px] lg:max-h-[600px] overflow-y-auto">
              {users.map(u => (
                <button 
                  key={u.email} 
                  onClick={() => setSelectedUser(u)}
                  className={['w-full text-left px-4 sm:px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors relative', selectedUser?.email === u.email ? 'bg-brand-50 dark:bg-brand-900/10 border-r-4 border-brand-500' : ''].join(' ')}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{u.name || 'ไม่ระบุชื่อ'}</div>
                      <div className="text-xs text-slate-400 truncate">{u.email}</div>
                    </div>
                    <span className={[
                      'text-[8px] font-black uppercase px-1.5 py-0.5 rounded shrink-0 mt-1',
                      u.role === 'Admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'Technician' ? 'bg-blue-100 text-blue-700' :
                      u.role === 'Pilot' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-slate-100 text-slate-600'
                    ].join(' ')}>
                      {u.role}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="glass p-4 sm:p-6 overflow-hidden">
            {selectedUser ? (
              <div>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-8">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold truncate">{selectedUser.name || 'ไม่ระบุชื่อ'}</h2>
                    <p className="text-slate-500 truncate">{selectedUser.email}</p>
                    <p className="text-slate-500 truncate">{selectedUser.phone || 'ไม่มีเบอร์โทร'}</p>
                  </div>
                  
                  <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                    <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">กำหนดสิทธิ์การใช้งาน (Role)</label>
                    <div className="flex flex-wrap gap-2">
                      {roles.map(r => (
                        <button
                          key={r}
                          onClick={() => selectedUser.id && handleRoleChange(selectedUser.id, r)}
                          className={[
                            'px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-2',
                            selectedUser.role === r 
                              ? 'border-brand-500 bg-brand-50 text-brand-600' 
                              : 'border-transparent bg-white dark:bg-slate-800 text-slate-500 hover:border-slate-200'
                          ].join(' ')}
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-brand-500 rounded-full" />
                  ประวัติการเรียน (Flight Log)
                </h3>
                
                <div className="grid gap-4">
                  {selectedUserFlightLog.map(log => {
                    const percent = Math.min(100, Math.round((log.learned / log.hours) * 100))
                    return (
                      <div key={log.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                        <div className="flex justify-between items-center mb-2">
                          <div className="font-semibold">{log.name}</div>
                          <div className="text-sm font-bold text-brand-600">{log.learned} / {log.hours} ชม.</div>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    )
                  })}
                  {selectedUserFlightLog.length === 0 && (
                    <div className="text-center py-8 text-slate-400 italic">ยังไม่มีประวัติการจองคอร์ส</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 py-20">
                <div className="text-4xl mb-4">👤</div>
                <p>เลือกนักเรียนจากรายการเพื่อดูรายละเอียด</p>
              </div>
            )}
          </div>
        </div>
       )}

       {tab === 'courses' && (
         <div className="grid gap-6">
           <div className="flex justify-between items-center">
             <h2 className="text-xl font-bold">จัดการคอร์สเรียน</h2>
             <button 
               onClick={() => {
                 setEditingCourse({ id: Math.random().toString(36).slice(2), name: '', description: '', hours: 0, price: 0, image: '', tags: [] })
                 setIsAddingCourse(true)
               }} 
               className="btn btn-primary"
             >
               + เพิ่มคอร์สใหม่
             </button>
           </div>

           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
             {courses.map(c => (
               <div key={c.id} className="glass overflow-hidden flex flex-col">
                 <div className="aspect-[16/9] relative bg-slate-100 dark:bg-slate-800">
                   <img src={c.image} alt={c.name} className="w-full h-full object-cover" />
                 </div>
                 <div className="p-4 flex-1 flex flex-col">
                   <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold">{c.name}</h3>
                     <span className="text-brand-600 font-bold">฿{c.price.toLocaleString()}</span>
                   </div>
                   <p className="text-sm text-slate-500 mb-4 line-clamp-2">{c.description}</p>
                   <div className="mt-auto flex gap-2">
                     <button 
                       onClick={() => { setEditingCourse(c); setIsAddingCourse(false) }}
                       className="btn btn-outline flex-1 py-1 text-xs"
                     >
                       แก้ไข
                     </button>
                     <button 
                       onClick={async () => { 
                         if(confirm('ยืนยันการลบคอร์สนี้?')) { 
                           const res = await deleteCourse(c.id); 
                           if (res.ok) {
                             setTick(t => t+1) 
                           } else {
                             alert('ลบไม่สำเร็จ: ' + res.error)
                           }
                         } 
                       }}
                       className="btn btn-outline border-red-200 text-red-500 hover:bg-red-50 flex-1 py-1 text-xs"
                     >
                       ลบ
                     </button>
                   </div>
                 </div>
               </div>
             ))}
           </div>

           {editingCourse && (
             <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
               <div className="glass p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                 <h3 className="text-xl font-bold mb-6">{isAddingCourse ? 'เพิ่มคอร์สใหม่' : 'แก้ไขคอร์ส'}</h3>
                 <div className="grid gap-4">
                   <div className="grid gap-1">
                     <label className="text-xs font-bold text-slate-400 uppercase">รูปภาพคอร์ส</label>
                     <div className="flex gap-4 items-start">
                       {editingCourse.image && (
                         <div className="size-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100">
                           <img src={editingCourse.image} alt="Preview" className="w-full h-full object-cover" />
                         </div>
                       )}
                       <div className="flex-1">
                         <input 
                           type="file" 
                           ref={fileInputRef}
                           onChange={handleImageUpload}
                           accept="image/*"
                           className="hidden"
                         />
                         <button 
                           type="button"
                           onClick={() => fileInputRef.current?.click()}
                           disabled={uploading}
                           className="btn btn-outline w-full py-4 border-dashed border-2 flex flex-col items-center justify-center gap-2"
                         >
                           {uploading ? (
                             <>
                               <span className="size-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                               <span className="text-[10px]">กำลังอัปโหลด...</span>
                             </>
                           ) : (
                             <>
                               <span className="text-xl">🖼️</span>
                               <span className="text-[10px]">คลิกเพื่อเลือกรูปภาพ</span>
                             </>
                           )}
                         </button>
                         <div className="text-[10px] text-slate-400 mt-2">
                           หรือระบุ URL รูปภาพโดยตรง:
                           <input 
                             className="mt-1 w-full px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs" 
                             value={editingCourse.image} 
                             onChange={e => setEditingCourse({ ...editingCourse, image: e.target.value })} 
                             placeholder="https://..."
                           />
                         </div>
                       </div>
                     </div>
                   </div>
                   <div className="grid gap-1">
                     <label className="text-sm font-semibold">ชื่อคอร์ส</label>
                     <input 
                       className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                       value={editingCourse.name}
                       onChange={e => setEditingCourse({ ...editingCourse, name: e.target.value })}
                     />
                   </div>
                   <div className="grid gap-1">
                     <label className="text-sm font-semibold">รายละเอียด</label>
                     <textarea 
                       className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 h-24"
                       value={editingCourse.description}
                       onChange={e => setEditingCourse({ ...editingCourse, description: e.target.value })}
                     />
                   </div>
                   <div className="grid grid-cols-2 gap-4">
                     <div className="grid gap-1">
                       <label className="text-sm font-semibold">ราคา (บาท)</label>
                       <input 
                         type="number"
                         className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                         value={editingCourse.price}
                         onChange={e => setEditingCourse({ ...editingCourse, price: Number(e.target.value) })}
                       />
                     </div>
                     <div className="grid gap-1">
                       <label className="text-sm font-semibold">ชั่วโมงทั้งหมด</label>
                       <input 
                         type="number"
                         className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                         value={editingCourse.hours}
                         onChange={e => setEditingCourse({ ...editingCourse, hours: Number(e.target.value) })}
                       />
                     </div>
                   </div>

                 </div>
                 <div className="mt-8 flex gap-3">
                   <button 
                     onClick={async () => {
                       if (isAddingCourse) await addCourse(editingCourse)
                       else await updateCourse(editingCourse)
                       setEditingCourse(null)
                       setTick(t => t+1)
                     }}
                     className="btn btn-primary flex-1"
                   >
                     บันทึก
                   </button>
                   <button onClick={() => setEditingCourse(null)} className="btn btn-outline flex-1">ยกเลิก</button>
                 </div>
               </div>
             </div>
           )}
         </div>
       )}

       {tab === 'calendar' && (
        <div className="glass p-4 sm:p-6 overflow-hidden">
          <h2 className="text-xl font-bold mb-4">ตารางบิน (Calendar)</h2>
          {isAdmin && (
            <p className="text-sm text-slate-500 mb-6 truncate">เลือกวันที่และคลิกที่ช่วงเวลาเพื่อ "เปิด/ปิด" การจอง (เช่น กรณีเครื่องบินซ่อมบำรุง หรือวันหยุดครู)</p>
          )}
          {!isAdmin && (
            <p className="text-sm text-slate-500 mb-6 truncate">เลือกวันที่เพื่อดูว่าช่วงเวลาไหนมีคนจองแล้วบ้าง หรือถูกปิดการจองโดยแอดมิน</p>
          )}
          
          <div className="grid lg:grid-cols-[300px_1fr] gap-6 sm:gap-8">
            <div>
              <label className="text-sm font-semibold mb-2 block">เลือกวันที่</label>
              <input 
                type="date" 
                value={blockDate} 
                onChange={e => setBlockDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              {TIME_SLOTS.map((slot, i) => {
                const isBlocked = (blockedMap[blockDate] || []).includes(i)
                const isTaken = bookings.some(b => b.date === blockDate && b.slot === i)
                const disabled = isTaken || !isAdmin
                
                return (
                  <button
                    key={slot}
                    disabled={disabled}
                    onClick={async () => { 
                      if (!isAdmin) return;
                      await toggleBlockSlot(blockDate, i); 
                      setTick(t => t+1) 
                    }}
                    className={[
                      'p-6 rounded-2xl border-2 transition-all text-left flex flex-col justify-between h-32',
                      isBlocked 
                        ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/30 dark:bg-red-900/10' 
                        : 'border-slate-100 bg-white hover:border-brand-300 dark:border-slate-800 dark:bg-slate-900',
                      isTaken ? 'opacity-50 cursor-not-allowed grayscale' : '',
                      !isAdmin && !isTaken ? 'cursor-default hover:border-slate-100 dark:hover:border-slate-800' : ''
                    ].join(' ')}
                  >
                    <div>
                      <div className="font-bold">{slot}</div>
                      <div className="text-xs opacity-70">สล็อตที่ {i + 1}</div>
                    </div>
                    <div className="flex items-center justify-between mt-auto">
                      <span className={['text-xs px-2 py-0.5 rounded-full font-bold uppercase', isBlocked ? 'bg-red-200 text-red-800' : 'bg-emerald-100 text-emerald-800'].join(' ')}>
                        {isBlocked ? 'ปิดการจอง' : 'เปิดว่าง'}
                      </span>
                      {isTaken && <span className="text-[10px] text-slate-500 font-medium">มีคนจองแล้ว</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
         </div>
       )}

       {tab === 'announcements' && (
          <div className="grid gap-6">
            <div className="glass p-6">
              <h2 className="text-xl font-bold mb-6">สร้างประกาศใหม่</h2>
             <div className="grid gap-4">
               <textarea 
                 placeholder="พิมพ์ข้อความประกาศที่นี่..."
                 className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 h-32 focus:ring-2 focus:ring-brand-500 transition-all outline-none"
                 value={newAnn.text}
                 onChange={e => setNewAnn({ ...newAnn, text: e.target.value })}
               />
               <div className="flex flex-wrap items-center gap-4">
                 <div className="flex gap-2">
                   {(['info', 'warning', 'danger'] as const).map(t => (
                     <button 
                       key={t}
                       onClick={() => setNewAnn({ ...newAnn, type: t })}
                       className={['px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition-all border-2', newAnn.type === t ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-transparent bg-slate-100 dark:bg-slate-800 text-slate-500'].join(' ')}
                     >
                       {t}
                     </button>
                   ))}
                 </div>
                 <button 
                   onClick={async () => {
                     if(!newAnn.text.trim()) return
                     await addAnnouncement(newAnn)
                     setNewAnn({ text: '', type: 'info' })
                     setTick(t => t+1)
                   }}
                   className="btn btn-primary ml-auto"
                 >
                   ลงประกาศ
                 </button>
               </div>
             </div>
           </div>

           <div className="grid gap-4">
             <h3 className="font-bold">รายการประกาศปัจจุบัน</h3>
             {announcements.map(a => (
               <div key={a.id} className="glass p-4 flex items-start justify-between gap-4">
                 <div className="flex gap-3">
                   <div className={['size-2 mt-2 rounded-full shrink-0', a.type === 'danger' ? 'bg-red-500' : a.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'].join(' ')} />
                   <div>
                     <p className="text-sm">{a.text}</p>
                     <div className="text-[10px] text-slate-400 mt-1">{new Date(a.date).toLocaleString('th-TH')}</div>
                   </div>
                 </div>
                 <button 
                   onClick={async () => { await deleteAnnouncement(a.id); setTick(t => t+1) }}
                   className="text-red-500 hover:text-red-600 p-1"
                 >
                   🗑️
                 </button>
               </div>
             ))}
             {announcements.length === 0 && (
               <div className="text-center py-12 text-slate-400 italic glass">ยังไม่มีประกาศ</div>
             )}
           </div>
         </div>
       )}
     </div>
   )
}
