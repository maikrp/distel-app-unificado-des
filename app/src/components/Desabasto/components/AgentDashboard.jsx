/* eslint-disable no-unused-vars */
/* ============================================================================
   AgentDashboard Ver 1.1.3.jsx App Unificada Funcional
   ============================================================================ */

import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";

export default function AgentDashboard({ usuario }) {
  const [registros, setRegistros] = useState([]);
  const [atendidos, setAtendidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [resumen, setResumen] = useState({});
  const [motivoSeleccionado, setMotivoSeleccionado] = useState(null);
  const [pdvSeleccionado, setPdvSeleccionado] = useState(null);
  const [mostrarMotivos, setMostrarMotivos] = useState(false);

  const TZ = "America/Costa_Rica";
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: TZ });

  // === Helpers de color (mismo criterio que SupervisorMenu) ===
  const getBarColor = (p) => {
    if (p >= 100) return "bg-green-600";
    if (p >= 80) return "bg-yellow-400";
    if (p >= 50) return "bg-orange-500";
    return "bg-red-600";
  };
  const getPctTextColor = (p) => {
    if (p >= 100) return "text-green-600";
    if (p >= 80) return "text-yellow-500";
    if (p >= 50) return "text-orange-500";
    return "text-red-600";
  };
  const getEffTextColor = (pEff) => (pEff < 80 ? "text-red-600" : "text-green-600");

  const formatFechaLargaCR = (fechaISO) => {
    const fecha = new Date(fechaISO);
    const opciones = {
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: TZ,
    };
    return fecha
      .toLocaleDateString("es-CR", opciones)
      .replace(/\.$/, "")
      .replace(",", "");
  };

// === Cargar ruta del agente por teléfono ===
const cargarRutaAgente = async () => {
  const { data, error } = await supabase
    .from("agentes")
    .select("ruta_norm, ruta_normalizada, ruta_excel")
    .eq("telefono", usuario.telefono)
    .single();

  if (error || !data) return null;

  console.log("DATA RUTA:", data);

  return (
    data.ruta_norm ||
    data.ruta_normalizada ||
    data.ruta_excel ||
    null
  );
};


  const cargarDatos = async () => {
    setLoading(true);
    setActualizando(true);

    const rutaAgente = await cargarRutaAgente();
    console.log("RUTA DEL AGENTE:", rutaAgente);

    if (!rutaAgente) {
      console.log("ERROR: No se encontró ruta para el agente");
      setRegistros([]);
      setAtendidos([]);
      setLoading(false);
      return;
    }

    const { data: registrosData, error: registrosError } = await supabase
      .from("vw_desabasto_unicos_cr")
      .select(`
        id,
        mdn_usuario,
        pdv,
        saldo,
        promadio_diario,
        promedio_semanal,
        monto_comprado,
        monto_recargado_este_mes,
        promedio_recargado_en_los_ultimos_3_meses,
        ultimo_uso_de_mis_recargas,
        fecha_carga_cr,
        saldo_menor_al_promedio_diario,
        ruta_norm,
        estado_atencion
      `)
      .eq("ruta_norm", rutaAgente)
      .gte("fecha_carga_cr", `${hoy}T00:00:00`)
      .lte("fecha_carga_cr", `${hoy}T23:59:59`);

    if (registrosError) console.error("Error DESABASTO:", registrosError.message);

    const { data: atencionesData, error: atencionesError } = await supabase
      .from("atenciones_agentes")
      .select("id, mdn_usuario, pdv, resultado, motivo_no_efectivo, hora, created_at")
      .eq("agente", usuario.telefono)
      .gte("fecha", `${hoy}T00:00:00`)
      .lte("fecha", `${hoy}T23:59:59`)

    console.log("DEBUG usuario.telefono:", usuario.telefono);
    console.log("DEBUG hoy:", hoy);
    console.log("DEBUG atencionesData:", atencionesData);
    console.log("DEBUG atencionesError:", atencionesError);

    if (atencionesError) {
      console.error("ERROR ATENCIONES:", atencionesError);
    }

    const atendidosIds = (atencionesData || []).map((a) => String(a.mdn_usuario));

    const pendientes = (registrosData || [])
      .filter((r) => !atendidosIds.includes(String(r.mdn_usuario)))
      .map((r) => {
        const t = (r.saldo_menor_al_promedio_diario || "").toLowerCase();
        let porcentaje = 100;
        if (t.includes("25")) porcentaje = 25;
        else if (t.includes("50")) porcentaje = 50;
        else if (t.includes("75")) porcentaje = 75;
        return { ...r, porcentaje };
      })
      .sort((a, b) => a.porcentaje - b.porcentaje);

    const totalDesabasto = (registrosData || []).length;
    const totalAtendidos = (atencionesData || []).length;
    const porcentajeAvance = totalDesabasto
      ? Math.round((totalAtendidos / totalDesabasto) * 100)
      : 0;

    const efectivos = (atencionesData || []).filter(
      (a) => a.resultado === "efectivo"
    ).length;
    const noEfectivos = (atencionesData || []).filter(
      (a) => a.resultado === "no efectivo"
    ).length;
    const total = efectivos + noEfectivos || 1;
    const porcentajeEfectivos = Math.round((efectivos / total) * 100);
    const porcentajeNoEfectivos = Math.round((noEfectivos / total) * 100);

    const mdns = (atencionesData || []).map((a) => a.mdn_usuario);
    let usos = [];
    if (mdns.length > 0) {
      const { data: usosData } = await supabase
        .from("desabasto_registros")
        .select("mdn_usuario, ultimo_uso_de_mis_recargas")
        .in("mdn_usuario", mdns);
      usos = usosData || [];
    }

    const atendidosConUso = (atencionesData || []).map((a) => {
      const match = usos.find((u) => u.mdn_usuario === a.mdn_usuario);
      return {
        ...a,
        ultimo_uso_de_mis_recargas: match
          ? match.ultimo_uso_de_mis_recargas
          : null,
      };
    });

    setRegistros(pendientes);
    setAtendidos(atendidosConUso);
    setResumen({
      totalDesabasto,
      totalAtendidos,
      porcentajeAvance,
      efectivos,
      noEfectivos,
      porcentajeEfectivos,
      porcentajeNoEfectivos,
    });

    setLoading(false);
    setActualizando(false);
  };

    const manejarNoEfectivo = (pdv) => {
    setPdvSeleccionado(pdv);
    setMostrarMotivos(true);
  };

  const marcarAtencion = async (pdv, resultado, motivo = null) => {
    const horaCR = new Date().toLocaleTimeString("es-CR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    const { error } = await supabase
      .from("atenciones_agentes")
      .insert([
        {
          agente: usuario.telefono,
          mdn_usuario: Number(pdv.mdn_usuario),
          pdv: pdv.pdv,
          hora: horaCR,
          resultado,
          motivo_no_efectivo: motivo,
          atendido: true
        }
      ]);

    if (error) {
      console.log("🚨 ERROR AL INSERTAR:", JSON.stringify(error, null, 2));
    } else {
      console.log("✅ INSERT EXITOSO");
    }

    // 🔥 ESTO VA AQUÍ, DENTRO DE LA FUNCIÓN
    setMostrarMotivos(false);
    setMotivoSeleccionado(null);
    setPdvSeleccionado(null);
    cargarDatos();
  };

  const devolverPDV = async (atencion) => {
    await supabase.from("atenciones_agentes").delete().eq("id", atencion.id);
    cargarDatos();
  };

  useEffect(() => {
    cargarDatos();
  }, []);


  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return "N/D";
    return parseFloat(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <p className="text-gray-500">Cargando información...</p>
      </div>
    );

  if (!loading && registros.length === 0 && atendidos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
        <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            Panel de Agente — Sin datos disponibles
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Datos no han sido cargados para el día de hoy.
          </p>
          <button
            onClick={cargarDatos}
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-semibold"
          >
            🔄 Reintentar
          </button>
        </div>
      </div>
    );
  }

  // === Fecha formateada ===
  const fechaTexto = formatFechaLargaCR(new Date());

    return (
    <div className="flex flex-col min-h-screen bg-gray-100 overflow-y-auto">
      {/* === Encabezado adaptable garantizado (desktop y móvil) === */}
      <header className="sticky top-0 z-50 bg-white shadow-sm w-full px-3 py-3 flex flex-col items-center justify-center text-center space-y-2">
        {/* Región y nombre */}
        <h2 className="text-base md:text-lg font-semibold text-gray-800 break-words w-full">
          {usuario.region?.toUpperCase()} — {usuario.nombre}
        </h2>

        {/* Botón de actualización SIEMPRE visible */}
        <div className="w-full flex justify-center">
          <button
            onClick={cargarDatos}
            className={`text-sm bg-blue-600 text-white py-1 px-5 rounded-lg hover:bg-blue-700 active:scale-95 transition ${
              actualizando ? "animate-spin" : ""
            }`}
            title="Actualizar datos"
          >
            🔄 Actualizar
          </button>
        </div>

        {/* Fecha siempre centrada */}
        <p className="text-sm text-gray-600 w-full flex justify-center items-center gap-1">
          📅 <span>{fechaTexto}</span>
        </p>

        {/* Avance y efectividad */}
        <p className="text-xs sm:text-sm w-full text-center leading-snug">
          <span className={`font-semibold ${getPctTextColor(resumen.porcentajeAvance)}`}>
            {resumen.totalAtendidos} de {resumen.totalDesabasto} PDV en desabasto atendidos (
            {resumen.porcentajeAvance}%)
          </span>{" "}
          |{" "}
          <span className={`font-semibold ${getEffTextColor(resumen.porcentajeEfectivos)}`}>
            Efectivos: {resumen.porcentajeEfectivos}%
          </span>
        </p>
      </header>

      {/* === Resto del contenido (sin cambios) === */}
      <main className="flex-1 w-full max-w-4xl mx-auto p-3 sm:p-5 md:p-8 space-y-5">
        {/* === Resumen de avance === */}
        <div className="bg-white rounded-2xl p-4 text-center shadow-md">
          <p className="text-sm md:text-base text-gray-700 mb-1">
            {resumen.totalAtendidos} / {resumen.totalDesabasto} PDV atendidos
          </p>
          <div className="w-full bg-gray-300 rounded-full h-3 overflow-hidden mb-1">
            <div
              className={`${getBarColor(resumen.porcentajeAvance)} h-3 transition-all`}
              style={{ width: `${resumen.porcentajeAvance}%` }}
            />
          </div>
          <p className="text-xs md:text-sm text-gray-600">
            Avance:{" "}
            <span className={`font-semibold ${getPctTextColor(resumen.porcentajeAvance)}`}>
              {resumen.porcentajeAvance}%
            </span>
          </p>
        </div>

        {/* === PDV pendientes === */}
        <section>
          <h3 className="text-sm md:text-base font-semibold text-gray-700 mb-2 text-center">
            PDV por atender
          </h3>
          {registros.length === 0 ? (
            <p className="text-center text-gray-600 text-sm">
              Todos los PDV fueron atendidos ✅
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {registros.map((pdv, i) => (
                <div
                  key={i}
                  className="rounded-xl shadow p-4 bg-white border border-gray-200 hover:shadow-lg transition"
                >
                  <p className="text-xs text-gray-500">MDN: {pdv.mdn_usuario}</p>
                  <h3 className="text-base font-semibold text-gray-800">{pdv.pdv}</h3>
                  <p className="text-sm text-gray-700">
                    Saldo actual: ₡{formatNumber(pdv.saldo)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Promedio semanal: ₡{formatNumber(pdv.promedio_semanal)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Última compra:{" "}
                    {pdv.fecha_ultima_compra
                      ? new Date(pdv.fecha_ultima_compra).toLocaleDateString("es-CR")
                      : "N/D"}
                  </p>
                  <p
                    className={`text-xs font-semibold mt-1 ${
                      pdv.porcentaje === 25
                        ? "text-red-600"
                        : pdv.porcentaje === 50
                        ? "text-orange-500"
                        : "text-yellow-500"
                    }`}
                  >
                    Desabasto: {pdv.porcentaje} %
                  </p>

                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => marcarAtencion(pdv, "efectivo")}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-semibold py-2 rounded-lg"
                    >
                      🟢 Efectivo
                    </button>
                    <button
                      onClick={() => manejarNoEfectivo(pdv)}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold py-2 rounded-lg"
                    >
                      🔴 No efectivo
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* === Popup selección motivo === */}
        {mostrarMotivos && (
          <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
            <div className="bg-white rounded-2xl shadow-xl p-6 w-80">
              <h3 className="text-md font-semibold text-gray-800 mb-3 text-center">
                Seleccione el motivo
              </h3>
              <div className="flex flex-col gap-2">
                {[
                  "Tiene saldo suficiente",
                  "No tiene dinero",
                  "PDV Cerrado",
                  "No está encargado",
                  "PDV inactivo SIFAM",
                  "Se contactó sin respuesta",
                  "Recargado/Sin uso MR",
                  "Activador de chips",
                  "Usuario personal",
                  "Fuera Ruta/No SINPE",
                ].map((motivo, idx) => (
                  <button
                    key={idx}
                    onClick={() => marcarAtencion(pdvSeleccionado, "no efectivo", motivo)}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 py-2 px-3 rounded-lg text-sm font-medium"
                  >
                    {motivo}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMostrarMotivos(false)}
                className="mt-4 text-sm text-gray-500 hover:text-gray-700 w-full text-center"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* === Resumen general === */}
        {atendidos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-4 text-center">
            <h3 className="text-sm md:text-base font-semibold text-gray-800 mb-1">
              Resumen de resultados del día
            </h3>
            <div className="flex justify-around text-xs md:text-sm font-semibold">
              <p className="text-gray-700">
                🟢 Efectivos: {resumen.efectivos} (
                <span
                  className={`font-semibold ${getEffTextColor(resumen.porcentajeEfectivos)}`}
                >
                  {resumen.porcentajeEfectivos}%
                </span>
                )
              </p>
              <p className="text-red-600">
                🔴 No efectivos: {resumen.noEfectivos} ({resumen.porcentajeNoEfectivos}%)
              </p>
            </div>
          </div>
        )}

        {/* === Histórico === */}
        {atendidos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-md p-4">
            <h3 className="text-sm md:text-base font-semibold text-gray-800 text-center mb-2">
              PDV Atendidos Hoy ({atendidos.length})
            </h3>
            <div className="divide-y divide-gray-200">
              {atendidos.map((a) => (
                <div
                  key={a.id}
                  className="py-2 text-sm text-gray-700 flex justify-between items-center"
                >
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {a.pdv}
                      {a.resultado === "efectivo" && (
                        <span className="w-3 h-3 bg-green-500 rounded-full" />
                      )}
                      {a.resultado === "no efectivo" && (
                        <span className="w-3 h-3 bg-red-500 rounded-full" />
                      )}
                    </p>
                    <p className="text-xs text-gray-500">MDN: {a.mdn_usuario}</p>
                    {a.resultado === "no efectivo" && a.motivo_no_efectivo && (
                      <p className="text-xs text-gray-600 italic">
                        Motivo: {a.motivo_no_efectivo}
                      </p>
                    )}
                    {a.ultimo_uso_de_mis_recargas && (
                      <p className="text-xs text-gray-500">
                        Último uso MR: {a.ultimo_uso_de_mis_recargas}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">
                      {a.hora ||
                        new Date(a.created_at).toLocaleTimeString("es-CR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                    </span>
                    <button
                      onClick={() => devolverPDV(a)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-bold"
                      title="Devolver a pendientes"
                    >
                      ↩
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
