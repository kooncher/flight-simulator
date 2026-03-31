import { supabase } from '../lib/supabase'
import { getUser as getAuthUser } from './auth'

export type Course = {
  id: string
  name: string
  description: string
  hours: number
  price: number
  image: string
  badge?: 'NEW' | 'RECOMMENDED' | 'POPULAR'
  tags?: string[]
}

export type Booking = {
  id: string
  courseId: string
  userId: string
  date: string
  name: string
  email: string
  phone: string
  slot: number
  durationHours: number
  sessionKind: 'sim' | 'pilot'
  selectedPilotId?: string | null
  selectedSimId?: 'sim1' | 'sim2' | null
  status: 'pending' | 'completed' | 'cancelled' | 'paid'
  note?: string
  instructorId?: string | null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function fmtHourDot(h: number) {
  return `${pad2(h)}.00`
}

function mapDbError(error: any) {
  const code = error?.code
  const message = String(error?.message || '')
  if (code === '23505' || message.includes('duplicate key value violates unique constraint')) {
    return 'ช่วงเวลานี้มีคนจองแล้ว กรุณาเลือกเวลาอื่น'
  }
  if (code === '23503' || message.includes('violates foreign key constraint')) {
    return 'ข้อมูลอ้างอิงไม่ถูกต้อง (กรุณารีเฟรชแล้วลองใหม่)'
  }
  return message || 'เกิดข้อผิดพลาด'
}

export const PRICE_PER_HOUR = 500
export const BUSINESS_START_HOUR = 8
export const BUSINESS_END_HOUR = 19
export const SLOT_HOURS = 1

export const SLOT_START_HOURS = Array.from(
  { length: Math.max(0, BUSINESS_END_HOUR - BUSINESS_START_HOUR) },
  (_, i) => BUSINESS_START_HOUR + i * SLOT_HOURS
)

export const TIME_SLOTS = SLOT_START_HOURS.map(h => `${fmtHourDot(h)} - ${fmtHourDot(h + SLOT_HOURS)}`)
export const DEFAULT_SLOTS = TIME_SLOTS.length

export const DURATION_HOURS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8] as const

export function formatTimeRange(slot: number, durationHours: number) {
  const startH = SLOT_START_HOURS[slot] ?? BUSINESS_START_HOUR
  const endH = startH + Math.max(1, durationHours || 1)
  return `${fmtHourDot(startH)} - ${fmtHourDot(endH)}`
}

export function slotStartDate(date: string, slot: number) {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, (m - 1), d, SLOT_START_HOURS[slot] || 8, 0, 0, 0)
  return dt
}

export function lessThan24h(date: string, slot: number) {
  const start = slotStartDate(date, slot)
  const now = new Date()
  const diff = start.getTime() - now.getTime()
  return diff < 24 * 60 * 60 * 1000
}

export async function getCourses(): Promise<Course[]> {
  const { data, error } = await supabase.from('courses').select('*').order('created_at', { ascending: true })
  if (error) {
    console.error('Error fetching courses:', error)
    return []
  }
  return data as Course[]
}

export async function updateCourse(c: Course) {
  const { error } = await supabase.from('courses').update(c).eq('id', c.id)
  if (error) console.error('Error updating course:', error)
}

export async function addCourse(c: Course) {
  const { error } = await supabase.from('courses').insert(c)
  if (error) console.error('Error adding course:', error)
}

export async function deleteCourse(id: string) {
  const { error } = await supabase.from('courses').delete().eq('id', id)
  if (error) {
    console.error('Error deleting course:', error)
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

export async function uploadCourseImage(file: File): Promise<string | null> {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`
  const filePath = `${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('course-images')
    .upload(filePath, file)

  if (uploadError) {
    console.error('Error uploading image:', uploadError)
    return null
  }

  const { data } = supabase.storage
    .from('course-images')
    .getPublicUrl(filePath)

  return data.publicUrl
}

export async function getBookings(): Promise<Booking[]> {
  const { data, error } = await supabase.from('bookings').select('*')
  if (error) {
    console.error('Error fetching bookings:', error)
    return []
  }
  return (data as any[] | null || []).map((b: any) => ({
    id: b.id,
    courseId: b.course_id,
    userId: b.user_id,
    date: b.date,
    name: b.name,
    email: b.email,
    phone: b.phone,
    slot: b.slot,
    durationHours: Number(b.duration_hours ?? 2),
    sessionKind: (b.session_kind === 'sim' ? 'sim' : 'pilot'),
    selectedPilotId: b.selected_pilot_id ?? null,
    selectedSimId: (b.selected_sim_id === 'sim1' || b.selected_sim_id === 'sim2') ? b.selected_sim_id : null,
    status: b.status,
    note: b.note,
    instructorId: b.instructor_id
  })) as Booking[]
}

export async function updateBookingStatus(id: string, status: 'pending' | 'completed' | 'cancelled' | 'paid') {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) console.error('Error updating booking status:', error)
}

export async function claimBooking(id: string, instructorId: string) {
  const me = getAuthUser()
  if (!me?.id) return { ok: false, error: 'กรุณาเข้าสู่ระบบ' }
  if (me.role !== 'Pilot') return { ok: false, error: 'เฉพาะนักบินเท่านั้นที่รับงานสอนได้' }
  if (me.id !== instructorId) return { ok: false, error: 'ไม่สามารถรับงานแทนผู้อื่นได้' }

  const { data, error } = await supabase
    .from('bookings')
    .update({ instructor_id: instructorId })
    .eq('id', id)
    .eq('status', 'pending')
    .is('instructor_id', null)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'รับงานไม่สำเร็จ (อาจมีคนรับงานไปแล้ว หรือรายการไม่อยู่ในสถานะรอดำเนินการ)' }
  return { ok: true }
}

export async function unclaimBooking(id: string) {
  const { error } = await supabase.from('bookings').update({ instructor_id: null }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function getAvailability(): Promise<Record<string, number>> {
  const bookings = await getBookings()
  const blocked = await getBlockedSlots()
  
  const occupiedByDate: Record<string, Set<number>> = {}

  bookings.forEach(b => {
    if (b.status === 'cancelled') return
    const dur = Math.max(1, Number(b.durationHours || 1))
    if (!occupiedByDate[b.date]) occupiedByDate[b.date] = new Set()
    for (let i = 0; i < dur; i++) occupiedByDate[b.date].add(b.slot + i)
  })

  Object.entries(blocked).forEach(([date, slots]) => {
    if (!occupiedByDate[date]) occupiedByDate[date] = new Set()
    slots.forEach(s => occupiedByDate[date].add(s))
  })

  const result: Record<string, number> = {}
  Object.entries(occupiedByDate).forEach(([date, set]) => {
    const taken = Array.from(set).filter(s => s >= 0 && s < TIME_SLOTS.length).length
    result[date] = Math.max(0, TIME_SLOTS.length - taken)
  })
  
  return result
}

export async function getBlockedSlots(): Promise<Record<string, number[]>> {
  const { data, error } = await supabase.from('blocked_slots').select('*')
  if (error) {
    console.error('Error fetching blocked slots:', error)
    return {}
  }
  const map: Record<string, number[]> = {}
  ;(data as any[]).forEach((row: any) => {
    if (!map[row.date]) map[row.date] = []
    map[row.date].push(row.slot)
  })
  return map
}

export async function toggleBlockSlot(date: string, slot: number) {
  const blocked = await getBlockedSlots()
  const isBlocked = (blocked[date] || []).includes(slot)
  
  if (isBlocked) {
    await supabase.from('blocked_slots').delete().eq('date', date).eq('slot', slot)
  } else {
    await supabase.from('blocked_slots').insert({ date, slot })
  }
}

export async function getFlightLog(email: string) {
  const all = (await getBookings()).filter(b => b.email === email)
  const courses = await getCourses()

  const courseMap: Record<string, { learned: number; upcoming: number }> = {}
  
  all.forEach(b => {
    if (b.status === 'cancelled') return
    const hours = Math.max(1, Number(b.durationHours || 1))
    if (!courseMap[b.courseId]) {
      courseMap[b.courseId] = { learned: 0, upcoming: 0 }
    }
    if (b.status === 'completed') {
      courseMap[b.courseId].learned += hours
    } else {
      courseMap[b.courseId].upcoming += hours
    }
  })

  return courses.filter(c => courseMap[c.id]).map(c => ({
    ...c,
    ...courseMap[c.id]
  }))
}

export async function createBooking(b: Omit<Booking, 'id' | 'status'>): Promise<{ ok: true; booking: Booking } | { ok: false; error: string }> {
  const user = getAuthUser()
  if (!user?.id) return { ok: false, error: 'กรุณาเข้าสู่ระบบก่อนจอง' }

  let courseId = b.courseId
  {
    const { data: course, error: courseErr } = await supabase.from('courses').select('id').eq('id', courseId).maybeSingle()
    if (courseErr || !course) {
      const { data: first } = await supabase.from('courses').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
      if (first?.id) courseId = first.id as string
    }
  }

  const sessionKind = b.sessionKind === 'sim' ? 'sim' : 'pilot'
  const durationHours = Math.max(1, Math.floor(Number(b.durationHours || 1)))
  if (durationHours > 8) return { ok: false, error: 'จำกัดความยาวคาบเรียนไม่เกิน 8 ชั่วโมง' }
  if (b.slot < 0 || b.slot >= TIME_SLOTS.length) return { ok: false, error: 'ช่วงเวลาไม่ถูกต้อง' }
  if (b.slot + durationHours > TIME_SLOTS.length) return { ok: false, error: 'ช่วงเวลานี้เกินเวลาทำการ' }

  let selectedPilotId: string | null = b.selectedPilotId ?? null
  let selectedSimId: 'sim1' | 'sim2' | null = b.selectedSimId ?? null

  if (sessionKind === 'sim') {
    const simPowers = await getSimPowers()
    const sim1On = simPowers.sim1?.ready ?? true
    const sim2On = simPowers.sim2?.ready ?? true
    if (!sim1On && !sim2On) return { ok: false, error: 'ขณะนี้เครื่อง Simulator ปิดให้บริการ' }
    const available: ('sim1' | 'sim2')[] = []
    if (sim1On) available.push('sim1')
    if (sim2On) available.push('sim2')
    if (selectedSimId && !available.includes(selectedSimId)) return { ok: false, error: 'เครื่อง Simulator ที่เลือกปิดให้บริการ' }
    if (!selectedSimId) selectedSimId = available[0] ?? null
  }
  if (sessionKind === 'pilot') {
    const { data: activePilots, error: pilotErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'Pilot')
      .eq('pilot_active', true)
    if (!pilotErr && (!activePilots || activePilots.length === 0)) {
      return { ok: false, error: 'ขณะนี้ยังไม่มีนักบินว่าง' }
    }
    const activeIds = (activePilots || []).map((p: any) => p.id as string)
    if (selectedPilotId && !activeIds.includes(selectedPilotId)) return { ok: false, error: 'นักบินที่เลือกไม่ว่าง' }
    if (!selectedPilotId) selectedPilotId = activeIds[0] ?? null
  }

  const allBookings = await getBookings()
  
  if (allBookings.some(x => x.email === b.email && x.date === b.date && x.status !== 'cancelled')) {
    return { ok: false, error: 'จำกัดจอง 1 ครั้งต่อวัน' }
  }

  const activeHours = allBookings
    .filter(x => x.email === b.email && (x.status === 'pending' || x.status === 'paid'))
    .reduce((sum, x) => sum + Math.max(1, Number(x.durationHours || 1)), 0)
  if (activeHours + durationHours > 8) {
    return { ok: false, error: `คุณจองเวลาเรียนรวมกันเกิน 8 ชม. แล้ว (${activeHours + durationHours} ชม.) กรุณาเรียนให้จบก่อนจองเพิ่ม` }
  }

  const taken = new Set(await getTakenSlots(b.date))
  const rangeTaken = Array.from({ length: durationHours }, (_, i) => b.slot + i).some(s => taken.has(s))
  if (rangeTaken) {
    return { ok: false, error: 'ช่วงเวลานี้ไม่ว่าง' }
  }

  // Week limit check
  const target = new Date(b.date)
  const weekday = (target.getDay() + 6) % 7
  const weekStart = new Date(target)
  weekStart.setDate(target.getDate() - weekday)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  
  const daysInWeek = new Set(allBookings.filter(x => {
    if (x.email !== b.email || x.status === 'cancelled') return false
    const d = new Date(x.date)
    return d >= weekStart && d <= weekEnd
  }).map(x => x.date)).size
  
  if (daysInWeek >= 2) {
    return { ok: false, error: 'จำกัดไม่เกิน 2 วันต่อสัปดาห์' }
  }

  const id = Math.random().toString(36).slice(2)
  const { data, error } = await supabase.from('bookings').insert({
    id,
    course_id: courseId,
    user_id: user.id,
    date: b.date,
    slot: b.slot,
    duration_hours: durationHours,
    session_kind: sessionKind,
    selected_pilot_id: sessionKind === 'pilot' ? selectedPilotId : null,
    selected_sim_id: sessionKind === 'sim' ? selectedSimId : null,
    name: b.name,
    email: b.email,
    phone: b.phone,
    status: 'pending',
    note: b.note
  }).select().single()

  if (error) return { ok: false, error: mapDbError(error) }
  
  return { 
    ok: true, 
    booking: {
      id: data.id,
      courseId: data.course_id,
      userId: data.user_id,
      date: data.date,
      name: data.name,
      email: data.email,
      phone: data.phone,
      slot: data.slot,
      durationHours: Number(data.duration_hours ?? durationHours),
      sessionKind: (data.session_kind === 'sim' ? 'sim' : sessionKind),
      selectedPilotId: data.selected_pilot_id ?? selectedPilotId,
      selectedSimId: data.selected_sim_id ?? selectedSimId,
      status: data.status,
      note: data.note,
      instructorId: data.instructor_id
    }
  }
}

export async function cancelBooking(id: string) {
  await updateBookingStatus(id, 'cancelled')
}

export async function cancelBookingWithPolicy(id: string, _email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // No more 24h restriction as per user request
  await updateBookingStatus(id, 'cancelled')
  return { ok: true }
}

export async function rescheduleBooking(id: string, newDate: string, email: string, newSlot: number, note?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await getBookings()
  const booking = all.find(x => x.id === id && x.email === email)
  if (!booking) return { ok: false, error: 'ไม่พบรายการจอง' }
  
  if (booking.date === newDate && booking.slot === newSlot) {
    return { ok: false, error: 'เลือกวันที่หรือเวลาใหม่ให้ต่างจากเดิม' }
  }

  // Check availability for the new date and slot
  if (newSlot < 0 || newSlot >= TIME_SLOTS.length) return { ok: false, error: 'ช่วงเวลาไม่ถูกต้อง' }
  if (newSlot + booking.durationHours > TIME_SLOTS.length) return { ok: false, error: 'ช่วงเวลานี้เกินเวลาทำการ' }

  const taken = new Set(await getTakenSlots(newDate))
  if (booking.date === newDate) {
    for (let i = 0; i < booking.durationHours; i++) taken.delete(booking.slot + i)
  }
  const rangeTaken = Array.from({ length: booking.durationHours }, (_, i) => newSlot + i).some(s => taken.has(s))
  if (rangeTaken) {
    return { ok: false, error: 'ช่วงเวลานี้มีคนจองแล้ว กรุณาเลือกเวลาอื่น' }
  }

  const { error } = await supabase.from('bookings').update({ 
    date: newDate,
    slot: newSlot,
    note: note || booking.note 
  }).eq('id', id)
  
  if (error) return { ok: false, error: mapDbError(error) }
  
  return { ok: true }
}

export async function getTakenSlots(date: string): Promise<number[]> {
  const bookings = (await getBookings())
    .filter(b => b.date === date && b.status !== 'cancelled')
    .flatMap(b => Array.from({ length: Math.max(1, b.durationHours || 1) }, (_, i) => b.slot + i))
  const blockedMap = await getBlockedSlots()
  const blocked = blockedMap[date] || []
  return [...new Set([...bookings, ...blocked])]
}

// These are now handled by getAvailability directly fetching from Supabase
export async function initAvailability() {}
export async function ensureMonthAvailability(_month: Date) {}
export async function setAvailability(_date: string, _slots: number) {}

export type Announcement = {
  id: string
  text: string
  date: string
  type: 'info' | 'warning' | 'danger'
}

export async function getAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.from('announcements').select('*').order('date', { ascending: false })
  if (error) return []
  return data as Announcement[]
}

export async function addAnnouncement(a: Omit<Announcement, 'id' | 'date'>) {
  const id = Math.random().toString(36).slice(2)
  await supabase.from('announcements').insert({ ...a, id, date: new Date().toISOString() })
}

export async function deleteAnnouncement(id: string) {
  await supabase.from('announcements').delete().eq('id', id)
}

export type StudentProfile = {
  id: string
  name: string
  email: string
  phone: string
}

export async function getSavedStudents(_userEmail: string): Promise<StudentProfile[]> {
  const user = getAuthUser()
  if (!user?.id) return []
  const { data, error } = await supabase.from('saved_students').select('*').eq('user_id', user.id)
  if (error) return []
  return data as StudentProfile[]
}

export async function saveStudent(_userEmail: string, student: Omit<StudentProfile, 'id'>) {
  const user = getAuthUser()
  if (!user?.id) return
  const id = Math.random().toString(36).slice(2)
  await supabase.from('saved_students').upsert({
    ...student,
    id,
    user_id: user.id
  }, { onConflict: 'user_id,email' })
}

export async function deleteSavedStudent(_userEmail: string, studentId: string) {
  await supabase.from('saved_students').delete().eq('id', studentId)
}

export async function migrateBookingsEmail(oldEmail: string, newEmail: string) {
  await supabase.from('bookings').update({ email: newEmail }).eq('email', oldEmail)
  await supabase.from('saved_students').update({ email: newEmail }).eq('email', oldEmail)
}

export type SimulatorStatus = {
  id: string
  booking_id?: string | null
  ready: boolean
  note?: string | null
  updated_at?: string
  updated_by?: string | null
}

export type ReplacementRequestStatus = 'pending_admin' | 'acknowledged' | 'approved' | 'rejected' | 'cancelled'

export type ReplacementRequest = {
  id: string
  created_by: string
  date: string
  slot: number
  replacement_name?: string | null
  replacement_phone?: string | null
  note?: string | null
  status: ReplacementRequestStatus
  admin_note?: string | null
  acknowledged_by?: string | null
  acknowledged_at?: string | null
  created_at?: string
  updated_at?: string
}

export async function getSimulatorStatus(bookingId: string): Promise<SimulatorStatus | null> {
  const { data, error } = await supabase.from('simulator_status').select('*').eq('booking_id', bookingId).single()
  if (error || !data) return null
  return data as SimulatorStatus
}

export async function setSimulatorStatus(bookingId: string, ready: boolean, note?: string) {
  const user = getAuthUser()
  if (!user?.id) return { ok: false as const, error: 'กรุณาเข้าสู่ระบบ' }
  const { error } = await supabase
    .from('simulator_status')
    .upsert({
      id: bookingId,
      booking_id: bookingId,
      ready,
      note: note ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export const SIM_UNIT_IDS = ['sim1', 'sim2'] as const
export type SimUnitId = (typeof SIM_UNIT_IDS)[number]

export async function getSimPower(simId: SimUnitId): Promise<SimulatorStatus | null> {
  const { data, error } = await supabase.from('simulator_status').select('*').eq('id', simId).maybeSingle()
  if (!error && data) return data as SimulatorStatus
  if (simId === 'sim1') {
    const { data: legacy } = await supabase.from('simulator_status').select('*').eq('id', 'main').maybeSingle()
    if (legacy) return legacy as SimulatorStatus
  }
  return null
}

export async function getSimPowers(): Promise<Record<SimUnitId, SimulatorStatus | null>> {
  const [sim1, sim2] = await Promise.all([getSimPower('sim1'), getSimPower('sim2')])
  return { sim1, sim2 }
}

export async function setSimPower(simId: SimUnitId, ready: boolean, note?: string) {
  const user = getAuthUser()
  if (!user?.id) return { ok: false as const, error: 'กรุณาเข้าสู่ระบบ' }
  const { error } = await supabase
    .from('simulator_status')
    .upsert({
      id: simId,
      booking_id: null,
      ready,
      note: note ?? null,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function getReplacementRequests(): Promise<ReplacementRequest[]> {
  const user = getAuthUser()
  if (!user?.id) return []
  const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  const isAdmin = (me?.role || 'User') === 'Admin'

  const query = supabase
    .from('replacement_requests')
    .select('*')
    .order('created_at', { ascending: false })

  const { data, error } = isAdmin ? await query : await query.eq('created_by', user.id)
  if (error) return []
  return (data || []) as ReplacementRequest[]
}

export async function createReplacementRequest(input: {
  date: string
  slot: number
  replacement_name?: string
  replacement_phone?: string
  note: string
}) {
  const user = getAuthUser()
  if (!user?.id) return { ok: false as const, error: 'กรุณาเข้าสู่ระบบ' }
  const id = Math.random().toString(36).slice(2)
  const { error } = await supabase.from('replacement_requests').insert({
    id,
    created_by: user.id,
    date: input.date,
    slot: input.slot,
    replacement_name: input.replacement_name || null,
    replacement_phone: input.replacement_phone || null,
    note: input.note,
    status: 'pending_admin',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, id }
}

export async function updateReplacementRequestStatus(id: string, status: ReplacementRequestStatus, adminNote?: string) {
  const { error } = await supabase
    .from('replacement_requests')
    .update({
      status,
      admin_note: adminNote ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

export async function acknowledgeReplacementRequest(id: string) {
  const user = getAuthUser()
  if (!user?.id) return { ok: false as const, error: 'กรุณาเข้าสู่ระบบ' }
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('replacement_requests')
    .update({
      status: 'acknowledged',
      acknowledged_by: user.id,
      acknowledged_at: now,
      updated_at: now
    })
    .eq('id', id)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}
