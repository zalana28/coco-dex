import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'

const LandingPage = lazy(() => import('@/pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const SwapPage = lazy(() => import('@/pages/SwapPage').then((module) => ({ default: module.SwapPage })))
const BridgePage = lazy(() => import('@/pages/BridgePage').then((module) => ({ default: module.BridgePage })))
const PoolsPage = lazy(() => import('@/pages/PoolsPage').then((module) => ({ default: module.PoolsPage })))
const AddLiquidityPage = lazy(() => import('@/pages/AddLiquidityPage').then((module) => ({ default: module.AddLiquidityPage })))
const RemoveLiquidityPage = lazy(() => import('@/pages/RemoveLiquidityPage').then((module) => ({ default: module.RemoveLiquidityPage })))
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const DocsPage = lazy(() => import('@/pages/DocsPage').then((module) => ({ default: module.DocsPage })))
const TermsPage = lazy(() => import('@/pages/TermsPage').then((module) => ({ default: module.TermsPage })))
const PrivacyPage = lazy(() => import('@/pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))
const NotFoundPage = lazy(() => import('@/pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })))

function PageFallback() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center justify-center px-4 pt-24 text-sm text-coco-dark-secondary">
      Loading...
    </div>
  )
}

function lazyRoute(element: ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={lazyRoute(<LandingPage />)} />
        <Route path="/swap" element={lazyRoute(<SwapPage />)} />
        <Route path="/bridge" element={lazyRoute(<BridgePage />)} />
        <Route path="/pools" element={lazyRoute(<PoolsPage />)} />
        <Route path="/pools/add" element={lazyRoute(<AddLiquidityPage />)} />
        <Route path="/pools/remove" element={lazyRoute(<RemoveLiquidityPage />)} />
        <Route path="/analytics" element={lazyRoute(<AnalyticsPage />)} />
        <Route path="/docs" element={lazyRoute(<DocsPage />)} />
        <Route path="/terms" element={lazyRoute(<TermsPage />)} />
        <Route path="/privacy" element={lazyRoute(<PrivacyPage />)} />
        <Route path="*" element={lazyRoute(<NotFoundPage />)} />
      </Route>
    </Routes>
  )
}
