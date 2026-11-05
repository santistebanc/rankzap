import { createRoot } from "react-dom/client";
import { MemoryRouter, Routes, Route, useLocation, Link } from "react-router-dom";
import "./harness.css";
import { Home } from "../../src/pages/Home";
const q = new URLSearchParams(location.search);
localStorage.setItem('rankzap:admin:recentPolls', JSON.stringify(q.has('empty') ? [] : ['A3ZK','Q7PL','M2XD'].map((roomId,i)=>({roomId,savedAt:Date.now()-i*3600000}))));
function Destination() { const {pathname}=useLocation(); return <main><h1 data-testid="destination">{pathname}</h1><Link to="/">Back home</Link></main>; }
createRoot(document.getElementById('root')!).render(<MemoryRouter><Routes><Route path="/" element={<Home/>}/><Route path="*" element={<Destination/>}/></Routes></MemoryRouter>);
