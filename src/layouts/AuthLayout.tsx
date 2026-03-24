import Header from '../components/Header'
import type { ReactNode } from 'react'

type Props = {
  children: ReactNode
}

export default function AuthLayout({ children }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-950">
      <Header />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
      <footer className="py-10 text-center text-slate-500">© Flight Reserve</footer>
    </div>
  )
}
