import Header from '../components/Header'
import Sidebar from '../components/Sidebar'
import type { UserRole } from '../store/auth'
import { useEffect, useState } from 'react'
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
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isAdminView = view === 'admin' || userRole === 'Admin'

  useEffect(() => {
    if (isAdminView) setSidebarOpen(false)
  }, [isAdminView])
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950 overflow-x-hidden">
      <Header loggedIn onLogout={onLogout} userName={userName} />
      <main className="w-full max-w-7xl mx-auto px-4 py-8 grid gap-6">
        {!isAdminView && userRole !== 'Pilot' && userRole !== 'Technician' && (
          <div className="flex items-center justify-between gap-3 lg:hidden">
            <button onClick={() => setSidebarOpen(true)} className="btn btn-outline">เมนู</button>
          </div>
        )}

        {!isAdminView && sidebarOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/40"
              aria-label="Close menu"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 w-[min(92vw,380px)] p-4">
              <div className="h-full grid gap-4 overflow-auto rounded-3xl">
                <div className="glass p-4 flex items-center justify-between">
                  <div className="font-bold">เมนู</div>
                  <button onClick={() => setSidebarOpen(false)} className="btn btn-outline">ปิด</button>
                </div>
                <Sidebar
                  q={q}
                  setQ={setQ}
                  availability={availability}
                  onStartNew={onStartNew}
                  userEmail={userEmail}
                  view={view}
                  onNavigate={(v) => {
                    setSidebarOpen(false)
                    onNavigate(v)
                  }}
                  bookingsCount={bookingsCount}
                  userRole={userRole}
                />
              </div>
            </div>
          </div>
        )}
        <div className={isAdminView ? 'grid gap-6 min-w-0' : 'grid lg:grid-cols-[280px_1fr] gap-6 items-start min-w-0'}>
          {!isAdminView && (
            <div className="hidden lg:block">
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
            </div>
          )}
          <div className="grid gap-6 min-w-0">
            {children}
          </div>
        </div>
      </main>
      <footer className="py-10 text-center text-slate-500">© Flight Reserve</footer>
    </div>
  )
}
