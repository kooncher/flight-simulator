import { getUser, updateUser } from '../store/auth'
import { migrateBookingsEmail, getFlightLog } from '../store/booking'
import { useState, useEffect } from 'react'

export default function Profile() {
  const u = getUser()
  const [name, setName] = useState(u?.name || '')
  const [phone, setPhone] = useState(u?.phone || '')
  const [email, setEmail] = useState(u?.email || '')
  const [saved, setSaved] = useState(false)
  const [flightLog, setFlightLog] = useState<any[]>([])

  useEffect(() => {
    if (u?.email) {
      getFlightLog(u.email).then(setFlightLog)
    }
  }, [u?.email])

  function save() {
    const oldEmail = u?.email || ''
    const cleanEmail = email.replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '').replace(/[^A-Za-z0-9.@_%+-]/g, '')
    const cleanPhone = phone.replace(/\D/g, '').slice(0, 10)
    updateUser({ name: name.trim(), phone: cleanPhone, email: cleanEmail })
    if (oldEmail && cleanEmail && oldEmail !== cleanEmail) {
      migrateBookingsEmail(oldEmail, cleanEmail)
      window.dispatchEvent(new CustomEvent('user-updated'))
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <section className="glass p-6">
      <div className="text-xl font-semibold mb-4">โปรไฟล์ของฉัน</div>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="grid gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300">อีเมล</label>
          <input
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            value={email}
            onChange={e => {
              const raw = e.target.value
              const noThai = raw.replace(/[\u0E00-\u0E7F]/g, '').replace(/\s+/g, '')
              const safe = noThai.replace(/[^A-Za-z0-9.@_%+-]/g, '')
              setEmail(safe)
            }}
          />
        </div>
        <div className="grid gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300">ชื่อที่แสดง</label>
          <input className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="grid gap-3">
          <label className="text-sm text-slate-600 dark:text-slate-300">โทรศัพท์</label>
          <input
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            value={phone}
            onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          />
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <button onClick={save} className="btn btn-primary">บันทึก</button>
        {saved && <div className="text-sm text-emerald-600">บันทึกแล้ว</div>}
      </div>

      {flightLog.length > 0 && (
        <div className="mt-12">
          <div className="text-xl font-semibold mb-6">สรุปชั่วโมงบิน (Flight Log)</div>
          <div className="grid gap-6 md:grid-cols-2">
            {flightLog.map(c => {
              const total = c.hours
              const learned = c.learned
              const remaining = Math.max(0, total - learned)
              const percent = Math.min(100, Math.round((learned / total) * 100))
              
              return (
                <div key={c.id} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="font-bold text-lg">{c.name}</div>
                      <div className="text-sm text-slate-500">หลักสูตร {total} ชม.</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-brand-600">{percent}%</div>
                      <div className="text-xs text-slate-400">Progress</div>
                    </div>
                  </div>
                  
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div 
                      className="h-full bg-brand-500 transition-all duration-500" 
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
                      <div className="text-xs text-slate-500 mb-1">เรียนแล้ว</div>
                      <div className="font-bold text-emerald-600">{learned} ชม.</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
                      <div className="text-xs text-slate-500 mb-1">จองเพิ่ม</div>
                      <div className="font-bold text-brand-600">{c.upcoming} ชม.</div>
                    </div>
                    <div className="p-2 rounded-xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800">
                      <div className="text-xs text-slate-500 mb-1">เหลืออีก</div>
                      <div className="font-bold text-slate-600">{remaining} ชม.</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
