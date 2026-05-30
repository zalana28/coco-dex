import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-coco-dark-border bg-coco-dark-surface/70 shadow-coco-2 backdrop-blur-xl transition-all ${className}`}
    >
      {children}
    </div>
  )
}
