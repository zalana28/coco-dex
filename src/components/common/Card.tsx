import { type ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
}

export function Card({ children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-2xl bg-coco-dark-surface border border-coco-dark-border shadow-coco-1 ${className}`}
    >
      {children}
    </div>
  )
}
