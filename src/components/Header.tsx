import { useEffect, useState } from 'react'

type Props = {
  loggedIn?: boolean
  onLogout?: () => void
  userName?: string
}

export default function Header({ loggedIn, onLogout, userName }: Props) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const saved = localStorage.getItem('theme') === 'dark'
    setDark(saved)
    document.documentElement.classList.toggle('dark', saved)
  }, [])
  function toggle() {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    localStorage.setItem('theme', next ? 'dark' : 'light')
  }
  return (
    <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/50 border-b border-white/20 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-gradient-to-tr from-brand-500 to-cyan-400 grid place-items-center text-white font-bold">✈</div>
          <div className="text-xl font-semibold">Flight Reserve</div>
        </div>
        <div className="flex items-center gap-2">
          {loggedIn && userName && <div className="hidden sm:block px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{userName}</div>}
          {loggedIn && <button onClick={onLogout} className="btn btn-outline">ออกจากระบบ</button>}
          <button onClick={toggle} className="btn btn-outline" aria-label="Toggle theme">
            {dark ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    </header>
  )
}
