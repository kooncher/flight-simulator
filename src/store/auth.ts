import { supabase } from '../lib/supabase'

export type UserRole = 'Admin' | 'Technician' | 'Pilot' | 'User'

export type User = {
  id?: string
  email: string
  name?: string
  phone?: string
  address?: string
  role?: UserRole
}

const KEY = 'auth_user'

function normalizeRole(v: any): UserRole {
  if (v === 'Admin' || v === 'Technician' || v === 'Pilot' || v === 'User') return v
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase()
    if (s === 'admin') return 'Admin'
    if (s === 'technician') return 'Technician'
    if (s === 'pilot') return 'Pilot'
    if (s === 'user') return 'User'
  }
  return 'User'
}

async function ensureProfileRow(input: { id: string; email: string; name?: string; phone?: string; address?: string; role?: any }) {
  const role = normalizeRole(input.role)
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: input.id,
        email: input.email,
        name: input.name ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        role
      },
      { onConflict: 'id' }
    )
  if (error) console.error('ensureProfileRow error:', error.message)
}

export function getUser(): User | null {
  const raw = localStorage.getItem(KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

export function isLoggedIn() {
  return !!getUser()
}

export async function getAllUsers(): Promise<User[]> {
  const { data, error } = await supabase.from('profiles').select('*')
  if (error) return []
  return (data as any[]).map(p => ({
    id: p.id as string,
    email: p.email as string,
    name: p.name as string | undefined,
    phone: p.phone as string | undefined,
    address: p.address as string | undefined,
    role: p.role as UserRole
  }))
}

export async function getUsersByRole(role: UserRole): Promise<User[]> {
  const { data, error } = await supabase.from('profiles').select('*').eq('role', role)
  if (error) return []
  return (data as any[]).map(p => ({
    id: p.id as string,
    email: p.email as string,
    name: p.name as string | undefined,
    phone: p.phone as string | undefined,
    address: p.address as string | undefined,
    role: p.role as UserRole
  }))
}

export async function login(email: string, password: string): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false, error: 'อีเมลไม่ถูกต้อง' }
  if (!password || password.length < 6) return { ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' }
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data.user) {
    const metaRole = normalizeRole((data.user as any).user_metadata?.role)
    const metaName = (data.user as any).user_metadata?.name as string | undefined
    const metaPhone = (data.user as any).user_metadata?.phone as string | undefined
    const metaAddress = (data.user as any).user_metadata?.address as string | undefined

    const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()
    if (profileErr || !profile) {
      await ensureProfileRow({
        id: data.user.id,
        email: data.user.email!,
        name: metaName,
        phone: metaPhone,
        address: metaAddress,
        role: metaRole
      })
    }

    const { data: profile2 } = await supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle()

    const user: User = { 
      id: data.user.id,
      email: data.user.email!, 
      role: normalizeRole((profile2 as any)?.role ?? metaRole),
      name: ((profile2 as any)?.name as string | undefined) || metaName,
      phone: ((profile2 as any)?.phone as string | undefined) || metaPhone,
      address: ((profile2 as any)?.address as string | undefined) || metaAddress
    }
    localStorage.setItem(KEY, JSON.stringify(user))
    return { ok: true, user }
  }

  return { ok: false, error: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' }
}

export async function signup(
  email: string,
  password: string,
  profile?: { firstName: string; lastName: string; phone: string; address: string }
): Promise<{ ok: true; user: User } | { ok: false; error: string }> {
  if (!email || !/.+@.+\..+/.test(email)) return { ok: false, error: 'อีเมลไม่ถูกต้อง' }
  if (!password || password.length < 6) return { ok: false, error: 'รหัสผ่านอย่างน้อย 6 ตัวอักษร' }

  const fullName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : undefined
  const phoneDigits = profile ? profile.phone.replace(/\D/g, '').slice(0, 10) : undefined
  const addressText = profile ? profile.address.trim() : undefined
  
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: 'User',
        name: fullName,
        phone: phoneDigits,
        address: addressText
      }
    }
  })

  if (error) {
    return { ok: false, error: error.message }
  }

  if (data.user) {
    if (profile) {
      await ensureProfileRow({
        id: data.user.id,
        email: data.user.email!,
        name: fullName,
        phone: phoneDigits,
        address: addressText,
        role: 'User'
      })
    }
    const user: User = { 
      id: data.user.id,
      email: data.user.email!, 
      role: 'User',
      name: fullName,
      phone: phoneDigits,
      address: addressText
    }
    localStorage.setItem(KEY, JSON.stringify(user))
    return { ok: true, user }
  }

  return { ok: false, error: 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ' }
}

export async function logout() {
  await supabase.auth.signOut()
  localStorage.removeItem(KEY)
}

export async function updateUser(partial: Partial<User>) {
  const u = getUser()
  if (!u || !u.id) return null

  // Update in Profiles table
  const { error: pError } = await supabase.from('profiles').update({
    name: partial.name,
    phone: partial.phone,
    address: partial.address,
    role: partial.role
  }).eq('id', u.id)

  if (pError) console.error('Error updating profile:', pError)

  // Also update Auth metadata for some fields
  await supabase.auth.updateUser({
    data: {
      name: partial.name || u.name,
      phone: partial.phone || u.phone,
      address: partial.address || u.address
    }
  })

  const next = { ...u, ...partial }
  localStorage.setItem(KEY, JSON.stringify(next))
  return next as User
}

export async function updateUserRole(userId: string, role: UserRole) {
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
  return !error
}

// Keep this for backward compatibility during migration
export async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.user) {
    const metaRole = normalizeRole((session.user as any).user_metadata?.role)
    const metaName = (session.user as any).user_metadata?.name as string | undefined
    const metaPhone = (session.user as any).user_metadata?.phone as string | undefined
    const metaAddress = (session.user as any).user_metadata?.address as string | undefined

    const { data: profile, error: profileErr } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    if (profileErr || !profile) {
      await ensureProfileRow({
        id: session.user.id,
        email: session.user.email!,
        name: metaName,
        phone: metaPhone,
        address: metaAddress,
        role: metaRole
      })
    }

    const { data: profile2 } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()

    const user: User = { 
      id: session.user.id,
      email: session.user.email!, 
      role: normalizeRole((profile2 as any)?.role ?? metaRole),
      name: ((profile2 as any)?.name as string | undefined) || metaName,
      phone: ((profile2 as any)?.phone as string | undefined) || metaPhone,
      address: ((profile2 as any)?.address as string | undefined) || metaAddress
    }
    localStorage.setItem(KEY, JSON.stringify(user))
    return user
  }
  localStorage.removeItem(KEY)
  return null
}
