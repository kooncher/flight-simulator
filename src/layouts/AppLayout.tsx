import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import type { UserRole } from '../store/auth'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
  userEmail: string
  userName?: string
  onLogout: () => void
  q: string
  setQ: (v: string) => void
  availability: Record<string, number>
  onStartNew: () => void
  view: 'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff'
  onNavigate: (v: 'browse' | 'my' | 'profile' | 'help' | 'admin' | 'staff' | 'payment') => void
  bookingsCount: number
  userRole?: UserRole
}

export default function AppLayout({ children, userEmail, userName, onLogout, q, setQ, availability, onStartNew, view, onNavigate, bookingsCount, userRole }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
      <Header loggedIn onLogout={onLogout} userName={userName} />
      <main className="max-w-7xl mx-auto px-4 py-8 grid gap-6">
        <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
          <Sidebar
            q={q}
            setQ={setQ}
            availability={availability}
            onStartNew={onStartNew}
            userEmail={userEmail}
            view={view}
            onNavigate={onNavigate}
            bookingsCount={bookingsCount}
            userRole={userRole}
          />
          <div className="grid gap-6">
            {children}
          </div>
        </div>
      </main>
      <footer className="py-10 text-center text-slate-500">© Flight Reserve</footer>
    </div>
  )
}
