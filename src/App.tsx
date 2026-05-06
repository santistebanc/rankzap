import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { AdminPage } from "./pages/AdminPage";
import { RankzapPage } from "./pages/RankzapPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/:roomId/admin" element={<AdminPage />} />
      <Route path="/:roomId" element={<RankzapPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
