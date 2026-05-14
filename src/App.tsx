import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

const Home = lazy(() => import("./pages/Home").then((m) => ({ default: m.Home })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const RankzapPage = lazy(() => import("./pages/RankzapPage").then((m) => ({ default: m.RankzapPage })));

export function App() {
  return (
    <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><span className="text-sm text-muted">Loading…</span></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/:roomId/admin" element={<AdminPage />} />
        <Route path="/:roomId" element={<RankzapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
