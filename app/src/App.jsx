import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Desabasto from "./components/Desabasto";
import Visitas from "./components/Visitas";
import Ventas from "./components/Ventas";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/desabasto" element={<Desabasto />} />
        <Route path="/visitas" element={<Visitas />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/" element={<Desabasto />} /> {/* opcional: ruta por defecto */}
      </Routes>
    </Router>
  );
}
