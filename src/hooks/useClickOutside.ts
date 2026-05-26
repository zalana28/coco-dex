import { useEffect, useRef, type RefObject } from 'react'

/**
 * Hook that detects clicks outside of a referenced element.
 * Used for closing dropdowns, modals, and popovers.
 *
 * @param handler - Callback fired when a click outside is detected
 * @returns ref - Attach this ref to the element you want to detect outside clicks for
 */
export function useClickOutside<T extends HTMLElement = HTMLElement>(
  handler: () => void
): RefObject<T | null> {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        handler()
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handler()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [handler])

  return ref
}
