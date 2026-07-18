import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'

export function Layout() {
  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden bg-coco-dark-bg text-coco-dark-text">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/2 top-[-14rem] h-[30rem] w-[30rem] -translate-x-1/2 rounded-full bg-coco-green-500/20 blur-[140px]" />
        <div className="absolute right-[-10rem] top-[24rem] h-[28rem] w-[28rem] rounded-full bg-coco-teal-400/10 blur-[120px]" />
        <div className="absolute bottom-[-18rem] left-[-10rem] h-[34rem] w-[34rem] rounded-full bg-coco-violet-500/10 blur-[150px]" />
      </div>
      <Header />
      <main className="relative flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
