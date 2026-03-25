import { useEffect, useState } from 'react'

type Props = {
  loggedIn?: boolean
  onLogout?: () => void
  userName?: string
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 12h11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 8l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BulbOnIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M9 21h6M10 17h4m.9-3.2c.7-.9 1.1-2 1.1-3.3a4 4 0 1 0-8 0c0 1.3.4 2.4 1.1 3.3.6.7.9 1.4.9 2.2V17h4v-1.3c0-.8.3-1.5.9-2.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BulbOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4">
      <path
        d="M9 21h6M10 17h4m.9-3.2c.7-.9 1.1-2 1.1-3.3a4 4 0 0 0-7.7-1.6M9.1 13.8c.6.7.9 1.4.9 2.2V17h4v-1.3c0-.8.3-1.5.9-2.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M4 4l16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
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
    <header className="sticky top-0 z-40 backdrop-blur bg-white/80 dark:bg-slate-900/70 supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-slate-900/50 border-b border-white/20 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 sm:size-9 rounded-xl bg-gradient-to-tr from-brand-500 to-cyan-400 grid place-items-center text-white font-bold">✈</div>
          <div className="text-lg sm:text-xl font-semibold truncate">Flight Reserve</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loggedIn && userName && <div className="hidden sm:block px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">{userName}</div>}
          {loggedIn && (
            <button onClick={onLogout} className="btn btn-outline px-3" aria-label="ออกจากระบบ" title="ออกจากระบบ">
              <LogoutIcon />
            </button>
          )}
          <button
            onClick={toggle}
            className="btn btn-outline px-3"
            aria-label={dark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={dark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          >
            {dark ? <BulbOnIcon /> : <BulbOffIcon />}
          </button>
        </div>
      </div>
    </header>
  )
}
