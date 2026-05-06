import { Navigate, Route, Routes } from "react-router-dom";
import { Home } from "./pages/Home";
import { AdminPage } from "./pages/AdminPage";
import { RankzapPage } from "./pages/RankzapPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/admin/:roomId" element={<AdminPage />} />
      <Route path="/vote/:roomId" element={<RankzapPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
