import { useState } from 'react'
import { login, signup } from '../store/auth'

type Props = {
  onSuccess: () => void
}

export default function Login({ onSuccess }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSignup, setIsSignup] = useState(false)

  async function submit() {
    setLoading(true)
    setError(null)
    
    const res = isSignup 
      ? await signup(email.trim(), password)
      : await login(email.trim(), password)
      
    if ('ok' in res && res.ok) {
      onSuccess()
    } else {
      setError('error' in res ? res.error : 'อีเมลหรือรหัสผ่านไม่ถูกต้อง')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[70vh] grid place-items-center">
      <div className="glass p-8 w-full max-w-md">
        <div className="text-2xl font-semibold text-center">{isSignup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</div>
        <div className="mt-6 grid gap-4">
          <div className="grid gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-300">อีเมล</label>
            <input
              value={email}
              onChange={e => {
                const raw = e.target.value
                const noThai = raw.replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '')
                const safe = noThai.replace(/[^A-Za-z0-9.@_%+-]/g, '')
                setEmail(safe)
              }}
              type="email"
              inputMode="email"
              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
              placeholder="you@example.com"
            />
          </div>
          <div className="grid gap-1">
            <label className="text-sm text-slate-600 dark:text-slate-300">รหัสผ่าน</label>
            <div className="flex gap-2">
              <input value={password} onChange={e => setPassword(e.target.value)} type={show ? 'text' : 'password'} className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" placeholder="อย่างน้อย 6 ตัวอักษร" />
              <button onClick={() => setShow(s => !s)} className="btn btn-outline min-w-[88px]">{show ? 'ซ่อน' : 'แสดง'}</button>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <button onClick={submit} disabled={loading} className="btn btn-primary w-full">
            {loading ? 'กำลังดำเนินการ...' : (isSignup ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ')}
          </button>
          
          <div className="text-center mt-2">
            <button 
              onClick={() => { setIsSignup(!isSignup); setError(null) }} 
              className="text-sm text-brand-600 hover:underline"
            >
              {isSignup ? 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครสมาชิก'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
