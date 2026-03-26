import { useEffect } from 'react'

type Props = {
  message: string | null
  onClose: () => void
  variant?: 'info' | 'warning' | 'error' | 'success'
  durationMs?: number
}

export default function Toast({ message, onClose, variant = 'warning', durationMs = 3500 }: Props) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onClose, durationMs)
    return () => clearTimeout(t)
  }, [message, onClose, durationMs])

  if (!message) return null

  const styles =
    variant === 'error'
      ? 'bg-red-600 text-white'
      : variant === 'success'
      ? 'bg-emerald-600 text-white'
      : variant === 'info'
      ? 'bg-sky-600 text-white'
      : 'bg-amber-500 text-black'

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 rounded-xl shadow-xl">
      <div className={['px-4 py-2 rounded-xl font-medium text-sm', styles].join(' ')}>
        {message}
      </div>
    </div>
  )
}

