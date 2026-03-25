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
  userId?: string
  date: string
  name: string
  email: string
  phone: string
  slot: number
  status: 'pending' | 'completed' | 'cancelled'
  note?: string
}

export const DEFAULT_SLOTS = 5
export const TIME_SLOTS = ['08:00–10:00', '10:00–12:00', '13:00–15:00', '15:00–17:00', '17:00–19:00']
export const SLOT_START_HOURS = [8, 10, 13, 15, 17]

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
    status: b.status,
    note: b.note
  })) as Booking[]
}

export async function updateBookingStatus(id: string, status: 'pending' | 'completed' | 'cancelled') {
  const { error } = await supabase.from('bookings').update({ status }).eq('id', id)
  if (error) console.error('Error updating booking status:', error)
}

export async function getAvailability(): Promise<Record<string, number>> {
  const bookings = await getBookings()
  const blocked = await getBlockedSlots()
  
  const map: Record<string, number> = {}
  
  // Count taken slots (bookings + blocked)
  bookings.forEach(b => {
    if (b.status === 'cancelled') return
    map[b.date] = (map[b.date] || 0) + 1
  })
  
  Object.entries(blocked).forEach(([date, slots]) => {
    // Only count slots that aren't already counted by a booking
    const dayBookings = bookings.filter(b => b.date === date && b.status !== 'cancelled').map(b => b.slot)
    const uniqueBlocked = slots.filter(s => !dayBookings.includes(s))
    map[date] = (map[date] || 0) + uniqueBlocked.length
  })

  // Convert to available count
  const result: Record<string, number> = {}
  Object.entries(map).forEach(([date, taken]) => {
    result[date] = Math.max(0, DEFAULT_SLOTS - taken)
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
    const hours = 2 
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

  const availability = await getAvailability()
  const slots = availability[b.date] ?? DEFAULT_SLOTS
  if (slots <= 0) {
    return { ok: false, error: 'วันที่นี้เต็มแล้ว' }
  }

  const allBookings = await getBookings()
  
  if (allBookings.some(x => x.email === b.email && x.date === b.date && x.status !== 'cancelled')) {
    return { ok: false, error: 'จำกัดจอง 1 ครั้งต่อวัน' }
  }

  const activeBookings = allBookings.filter(x => x.email === b.email && x.status === 'pending')
  if (activeBookings.length * 2 + 2 > 8) {
    return { ok: false, error: `คุณจองเวลาเรียนรวมกันเกิน 8 ชม. แล้ว (${activeBookings.length * 2 + 2} ชม.) กรุณาเรียนให้จบก่อนจองเพิ่ม` }
  }

  const taken = new Set(await getTakenSlots(b.date))
  if (taken.has(b.slot)) {
    return { ok: false, error: 'ช่วงเวลานี้ไม่ว่าง' }
  }

  // Week limit check
  const target = new Date(b.date)
  const weekday = (target.getDay() + 6) % 7
  const weekStart = new Date(target)
  weekStart.setDate(target.getDate() - weekday)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  
  const countInWeek = allBookings.filter(x => {
    if (x.email !== b.email || x.status === 'cancelled') return false
    const d = new Date(x.date)
    return d >= weekStart && d <= weekEnd
  }).length
  
  if (countInWeek >= 2) {
    return { ok: false, error: 'จำกัดไม่เกิน 2 วันต่อสัปดาห์' }
  }

  const id = Math.random().toString(36).slice(2)
  const { data, error } = await supabase.from('bookings').insert({
    id,
    course_id: b.courseId,
    user_id: user.id,
    date: b.date,
    slot: b.slot,
    name: b.name,
    email: b.email,
    phone: b.phone,
    status: 'pending',
    note: b.note
  }).select().single()

  if (error) return { ok: false, error: error.message }
  
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
      status: data.status,
      note: data.note
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
  const taken = await getTakenSlots(newDate)
  // If moving to a new slot on the SAME day, we can ignore the current booking's slot
  const isSameDay = booking.date === newDate
  const isSlotTaken = taken.includes(newSlot) && (!isSameDay || newSlot !== booking.slot)

  if (isSlotTaken) {
    return { ok: false, error: 'ช่วงเวลานี้มีคนจองแล้ว กรุณาเลือกเวลาอื่น' }
  }

  const { error } = await supabase.from('bookings').update({ 
    date: newDate,
    slot: newSlot,
    note: note || booking.note 
  }).eq('id', id)
  
  if (error) return { ok: false, error: error.message }
  
  return { ok: true }
}

export async function getTakenSlots(date: string): Promise<number[]> {
  const bookings = (await getBookings()).filter(b => b.date === date && b.status !== 'cancelled').map(b => b.slot)
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

export async function getSimulatorStatus(): Promise<SimulatorStatus | null> {
  const { data, error } = await supabase.from('simulator_status').select('*').eq('id', 'main').maybeSingle()
  if (!error && data) return data as SimulatorStatus
  const { data: inserted } = await supabase
    .from('simulator_status')
    .insert({ id: 'main', ready: true, note: null })
    .select()
    .single()
  return (inserted || null) as SimulatorStatus | null
}

export async function setSimulatorStatus(ready: boolean, note?: string) {
  const user = getAuthUser()
  if (!user?.id) return { ok: false as const, error: 'กรุณาเข้าสู่ระบบ' }
  const { error } = await supabase
    .from('simulator_status')
    .upsert({
      id: 'main',
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
