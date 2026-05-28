import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export function NotFoundPage() {
  return (
    <div className="pt-28 sm:pt-24 pb-12 px-3 sm:px-4 flex flex-col items-center justify-center min-h-[60vh]">
      <h1 className="text-6xl font-bold text-coco-dark-border">404</h1>
      <p className="mt-4 text-lg text-coco-dark-muted">Page not found</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-green-500 text-white text-sm font-medium hover:bg-coco-green-600 transition-colors"
      >
        <Home className="h-4 w-4" />
        Back to Home
      </Link>
    </div>
  )
}
