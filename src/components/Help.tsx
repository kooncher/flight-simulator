import { useState } from 'react'

type Message = { id: string; email: string; text: string; createdAt: string }

export default function Help() {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  function submit() {
    if (!text.trim()) return
    const all: Message[] = JSON.parse(localStorage.getItem('messages') || '[]')
    all.push({ id: Math.random().toString(36).slice(2), email: 'me', text: text.trim(), createdAt: new Date().toISOString() })
    localStorage.setItem('messages', JSON.stringify(all))
    setText('')
    setSent(true)
    setTimeout(() => setSent(false), 1200)
  }
  return (
    <section className="glass p-6 grid gap-4">
      <div className="text-xl font-semibold">ช่วยเหลือ / ติดต่อ</div>
      <textarea className="min-h-32 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700" value={text} onChange={e => setText(e.target.value)} placeholder="ส่งคำถามหรือขอความช่วยเหลือ" />
      <div className="flex gap-2">
        <button onClick={submit} className="btn btn-primary">ส่งข้อความ</button>
        {sent && <div className="text-emerald-600 text-sm">ส่งแล้ว</div>}
      </div>
    </section>
  )
}
