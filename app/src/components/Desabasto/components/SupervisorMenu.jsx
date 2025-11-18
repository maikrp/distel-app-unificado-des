/* =====================================================================
   SUPERVISOR MENU – VERSIÓN 3.0.1 DESARROLLO
   FUNCIONAL Y LISTA PARA PRODUCCIÓN
===================================================================== */

import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../supabaseClient";

export default function SupervisorMenu({ usuario }) {

  // ============================
  // ESTADOS
  // ============================
  const [vista, setVista] = useState("menu");
  const [agentes, setAgentes] = useState([]);
  const [detalles, setDetalles] = useState(null); // Estado para manejar la vista de detalles
  const [loading, setLoading] = useState(true);
  const [resumenZona, setResumenZona] = useState({});
  const [historico, setHistorico] = useState([]);
  const [fechaRango, setFechaRango] = useState({ inicio: null, fin: null });

  // ============================
  // FECHAS – COSTA RICA
  // ============================
  const TZ = "America/Costa_Rica";

  const hoyISO = () => {
    const cr = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
    return cr.toISOString().split("T")[0];
  };

  // Ajuste: Día anterior = SÁBADO si es domingo o lunes
  const isoNDiasAtras = (n) => {
    const nowCR = new Date(new Date().toLocaleString("en-US", { timeZone: TZ }));
    const dia = nowCR.getDay(); // 0=dom, 1=lun, 6=sab

    if (n === 1) {
      if (dia === 0) {
        const sab = new Date(nowCR);
        sab.setDate(sab.getDate() - 1);
        return sab.toISOString().split("T")[0];
      }
      if (dia === 1) {
        const sab = new Date(nowCR);
        sab.setDate(sab.getDate() - 2);
        return sab.toISOString().split("T")[0];
      }
    }

    const d = new Date(nowCR);
    d.setDate(nowCR.getDate() - n);
    return d.toISOString().split("T")[0];
  };

  const formatFechaLargoCR = (iso) => {
    if (!iso) return "";
    const fecha = new Date(`${iso}T12:00:00`);
    return fecha
      .toLocaleDateString("es-CR", {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: TZ,
      })
      .replace(",", "");
  };

  const formatFechaCortoCR = (iso) => {
    if (!iso) return "";
    const fecha = new Date(`${iso}T12:00:00`);
    return fecha.toLocaleDateString("es-CR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      timeZone: TZ,
    });
  };

  // ============================
  // SEMÁFORO
  // ============================
  const obtenerSemaforo = (p) => {
    if (p >= 100) return "🟢";
    if (p >= 80) return "🟡";
    if (p >= 50) return "🟠";
    return "🔴";
  };

  // ============================
  // FORMATOS
  // ============================
  const formatNumber = (num) => {
    if (num === null || num === undefined || isNaN(num)) return "N/D";
    return parseFloat(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // =====================================================================
  // CARGAR AGENTES BASE (usa SIEMPRE ruta_norm)
  // =====================================================================
  const cargarAgentesBase = useCallback(async () => {
  let q = supabase
    .from("agentes")
    .select("telefono, nombre, region, ruta_norm, activo, tipo")
    .eq("activo", true)
    .eq("tipo", "agente");

  if (usuario.acceso === "regional") {
    // Solución para GTE: usar ilike para regiones que empiezan con el nombre del supervisor
    q = q.ilike("region", `${usuario.region}%`);
  }
  if (usuario.acceso === "ruta") {
    q = q.eq("ruta_norm", usuario.ruta_norm);
  }

  const { data } = await q;
  return data || [];
}, [usuario]);

  // =====================================================================
  // CARGAR DESABASTO POR RUTA (CORREGIDO: con fecha_carga_cr_dia, ruta_norm)
  // =====================================================================
  const cargarDesabastoRuta = async (rutaNorm, fechaISO) => {
    const query = supabase
      .from("vw_desabasto_unicos_cr")
      .select(`
        mdn_usuario,
        pdv,
        saldo,
        promedio_semanal,
        saldo_menor_al_promedio_diario,
        fecha_carga_cr,
        ruta_norm
      `)
      .eq("ruta_norm", rutaNorm)
      .in("saldo_menor_al_promedio_diario", [
        "Menor al 25%",
        "Menor al 50%",
        "Menor al 75%",
      ])
      .eq("fecha_carga_cr_dia", fechaISO); // <-- Usando la columna calculada

    const { data, error } = await query;

    if (error) {
      console.error("ERROR desabasto:", error);
      return []; // Devuelve array vacío en caso de error
    }

    return data || [];
  };

  // =====================================================================
  // CARGAR ATENCIONES (TELÉFONO DEL AGENTE, con fecha_dia)
  // =====================================================================
  const cargarAtencionesAgente = async (telefono, fechaISO) => {
    const query = supabase
      .from("atenciones_agentes")
      .select(`
        id,
        mdn_usuario,
        pdv,
        resultado,
        motivo_no_efectivo,
        created_at
      `)
      .eq("agente", telefono)
      .eq("fecha_dia", fechaISO); // <-- Usando la columna calculada

    const { data, error } = await query;

    if (error) {
      console.error("ERROR atenciones:", error);
      return [];
    }

    return data || [];
  };

  // =====================================================================
  // CARGA PRINCIPAL (hoy / día anterior)
  // =====================================================================
  const cargarAgentesDelDia = useCallback(
    async (offset = 0) => {
      setLoading(true);

      const fechaObjetivo = offset === 0 ? hoyISO() : isoNDiasAtras(offset);
      const agentesBase = await cargarAgentesBase();

      let totalZonaDesabasto = 0;
      let totalZonaAtendidos = 0;
      let totalZonaEfectivos = 0;

      const agentesConDatos = await Promise.all(
        agentesBase.map(async (ag) => {
          const desabasto = await cargarDesabastoRuta(ag.ruta_norm, fechaObjetivo);
          const atenciones = await cargarAtencionesAgente(ag.telefono, fechaObjetivo);

          const totalDesabasto = desabasto.length;
          const totalAtendidos = atenciones.length;
          const efectivos = atenciones.filter((a) => a.resultado === "efectivo").length;

          const porcentajeAvance =
            totalDesabasto > 0 ? Math.round((totalAtendidos / totalDesabasto) * 100) : 0;

          const porcentajeEfectivos =
            totalAtendidos > 0 ? Math.round((efectivos / totalAtendidos) * 100) : 0;

          totalZonaDesabasto += totalDesabasto;
          totalZonaAtendidos += totalAtendidos;
          totalZonaEfectivos += efectivos;

          let colorBarra = "bg-red-600";
          if (porcentajeAvance >= 100) colorBarra = "bg-green-600";
          else if (porcentajeAvance >= 80) colorBarra = "bg-yellow-400";
          else if (porcentajeAvance >= 50) colorBarra = "bg-orange-500";

          return {
            ...ag,
            totalDesabasto,
            totalAtendidos,
            porcentajeAvance,
            porcentajeEfectivos,
            efectivos,
            colorBarra,
            semaforo: obtenerSemaforo(porcentajeAvance),
          };
        })
      );

      const ordenados = agentesConDatos
        .sort((a, b) => b.porcentajeAvance - a.porcentajeAvance)
        .map((a, idx) => ({
          ...a,
          ranking: idx + 1,
          totalAgentes: agentesConDatos.length,
        }));

      const porcentajeZona =
        totalZonaDesabasto > 0
          ? Math.round((totalZonaAtendidos / totalZonaDesabasto) * 100)
          : 0;

      const porcentajeEfectivosZona =
        totalZonaAtendidos > 0
          ? Math.round((totalZonaEfectivos / totalZonaAtendidos) * 100)
          : 0;

      let colorZona = "bg-red-600";
      if (porcentajeZona >= 100) colorZona = "bg-green-600";
      else if (porcentajeZona >= 80) colorZona = "bg-yellow-400";
      else if (porcentajeZona >= 50) colorZona = "bg-orange-500";

      setResumenZona({
        totalZonaDesabasto,
        totalZonaAtendidos,
        porcentajeZona,
        porcentajeEfectivosZona,
        colorZona,
        semaforo: obtenerSemaforo(porcentajeZona),
      });

      setAgentes(ordenados);
      setLoading(false);
    },
    [cargarAgentesBase, cargarDesabastoRuta, cargarAtencionesAgente]
  );

  // =====================================================================
  // CARGAR DETALLES DE UNA RUTA / AGENTE (CORREGIDO: con fecha_dia, telefono)
  // =====================================================================
  const cargarDetallesRuta = async (rutaNorm, telefonoAgente, nombreAgente) => {
    setLoading(true);

    const fechaObjetivo = vista === "anterior" ? isoNDiasAtras(1) : hoyISO();

    const { data: registros } = await supabase
      .from("vw_desabasto_unicos_cr")
      .select(`
        mdn_usuario,
        pdv,
        saldo,
        promedio_semanal,
        saldo_menor_al_promedio_diario,
        fecha_carga_cr,
        ruta_norm
      `)
      .eq("ruta_norm", rutaNorm)
      .in("saldo_menor_al_promedio_diario", [
        "Menor al 25%",
        "Menor al 50%",
        "Menor al 75%",
      ])
      .eq("fecha_carga_cr_dia", fechaObjetivo); // <-- Usando la columna calculada

    const { data: atenciones } = await supabase
      .from("atenciones_agentes")
      .select(`
        id,
        mdn_usuario,
        pdv,
        hora,
        created_at,
        resultado,
        motivo_no_efectivo
      `)
      .eq("agente", telefonoAgente) // <-- Usando telefono
      .eq("fecha_dia", fechaObjetivo); // <-- Usando la columna calculada

    const atendidosIds = new Set(
      (atenciones || []).map((a) => String(a.mdn_usuario))
    );

    const pendientes = (registros || [])
      .filter((r) => !atendidosIds.has(String(r.mdn_usuario)))
      .map((r) => {
        const t = (r.saldo_menor_al_promedio_diario || "").toLowerCase();
        let porcentaje = 100;
        if (t.includes("25")) porcentaje = 25;
        else if (t.includes("50")) porcentaje = 50;
        else if (t.includes("75")) porcentaje = 75;

        return { ...r, porcentaje, mdn_usuario: String(r.mdn_usuario) };
      })
      .sort((a, b) => a.porcentaje - b.porcentaje);

    const totalDesabasto = registros?.length || 0;
    const totalAtendidos = atenciones?.length || 0;

    const porcentajeAvance =
      totalDesabasto > 0
        ? Math.round((totalAtendidos / totalDesabasto) * 100)
        : 0;

    let colorRuta = "bg-red-600";
    if (porcentajeAvance >= 100) colorRuta = "bg-green-600";
    else if (porcentajeAvance >= 80) colorRuta = "bg-yellow-400";
    else if (porcentajeAvance >= 50) colorRuta = "bg-orange-500";

    setDetalles({
      rutaNorm,
      nombreAgente,
      telefonoAgente,
      fechaObjetivo,
      totalDesabasto,
      totalAtendidos,
      porcentajeAvance,
      colorRuta,
      semaforo: obtenerSemaforo(porcentajeAvance),
      atenciones: atenciones || [],
      pendientes,
    });

    setLoading(false);
  };

  const formatHoraDet = (a) => {
    if (a.hora) return a.hora;

    try {
      return new Date(a.created_at).toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: TZ,
      });
    } catch {
      return "";
    }
  };

  // =====================================================================
  // VISTA DETALLE RUTA (Integrada en VistaSeguimiento)
  // =====================================================================
  const VistaDetalleRuta = ({ detalles, onVolver }) => {
    if (!detalles) return null; // Asegura que detalles exista

    const {
      rutaNorm,
      nombreAgente,
      fechaObjetivo,
      pendientes,
      porcentajeAvance,
      colorRuta,
      totalDesabasto,
      totalAtendidos,
      atenciones,
      semaforo,
    } = detalles;

    const efectivos = atenciones.filter((a) => a.resultado === "efectivo").length;
    const noEfectivos = atenciones.filter((a) => a.resultado === "no efectivo").length;
    const total = atenciones.length || 1;

    const porcentajeEfectivos = Math.round((efectivos / total) * 100);
    const porcentajeNoEfectivos = Math.round((noEfectivos / total) * 100);

    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-4xl animate-fadeIn">

          <div className="flex flex-col items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 text-center">
              {semaforo} Avance de atención — {rutaNorm}
            </h2>
            <p className="text-xs text-gray-500">Agente: {nombreAgente}</p>
            <p className="text-xs text-gray-500">
              Fecha: {formatFechaLargoCR(fechaObjetivo)}
            </p>

            <div className="flex justify-center gap-3 mt-3">
              <button
                onClick={onVolver} // Llama a la función para volver a la vista de agentes
                className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
              >
                ⬅ Volver
              </button>
            </div>
          </div>

          <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`${colorRuta} h-4 transition-all duration-500`}
              style={{ width: `${porcentajeAvance}%` }}
            />
          </div>

          <p className="text-sm text-center text-gray-700 mb-4">
            {totalAtendidos} de {totalDesabasto} PDV atendidos ({porcentajeAvance}%) |
            Efectivos: {porcentajeEfectivos}% — No efectivos: {porcentajeNoEfectivos}%
          </p>

          {/* Pendientes */}
          {pendientes.length === 0 ? (
            <p className="text-center text-gray-600 mt-4">
              Todos los PDV en desabasto fueron atendidos ✅
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendientes.map((pdv, i) => (
                <div
                  key={i}
                  className="rounded-xl shadow-md p-4 flex flex-col justify-between border border-gray-200 bg-white"
                >
                  <div>
                    <p className="text-xs text-gray-500">
                      MDN: {pdv.mdn_usuario}
                    </p>
                    <h3 className="text-base font-bold text-gray-800">{pdv.pdv}</h3>

                    <p className="text-sm text-gray-700">
                      Saldo actual: ₡{formatNumber(pdv.saldo)}
                    </p>

                    <p className="text-sm text-gray-600">
                      Promedio semanal: {formatNumber(pdv.promedio_semanal)}
                    </p>

                    {/* Comentado porque fecha_ultima_compra no está en la vista */}
                    {/* <p className="text-sm text-gray-600">
                      Última compra:{" "}
                      {pdv.fecha_ultima_compra
                        ? new Date(pdv.fecha_ultima_compra).toLocaleDateString("es-CR")
                        : "N/D"}
                    </p> */}

                    <p
                      className={`text-xs font-semibold mt-1 ${
                        pdv.porcentaje === 25
                          ? "text-red-600"
                          : pdv.porcentaje === 50
                          ? "text-orange-500"
                          : "text-yellow-500"
                      }`}
                    >
                      Desabasto: {pdv.porcentaje}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Atendidos */}
          {atenciones.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-xl border border-gray-200 shadow p-4">
              <h3 className="text-md font-semibold text-gray-800 text-center mb-2">
                PDV Atendidos ({atenciones.length})
              </h3>

              <div className="divide-y divide-gray-200">
                {atenciones.map((a) => (
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

                      <p className="text-xs text-gray-500">
                        MDN: {a.mdn_usuario}
                      </p>

                      {a.resultado === "no efectivo" && a.motivo_no_efectivo && (
                        <p className="text-xs text-gray-600 italic">
                          Motivo: {a.motivo_no_efectivo}
                        </p>
                      )}
                    </div>

                    <span className="text-xs text-gray-600">
                      {formatHoraDet(a)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    );
  };

  // =====================================================================
  // HISTÓRICO 7 DÍAS (con fecha_dia)
  // =====================================================================
  const cargarHistorico7Dias = useCallback(async () => {
    setLoading(true);

    try {
      let queryAgentes = supabase
        .from("agentes")
        .select("nombre, telefono, ruta_norm, region")
        .eq("activo", true)
        .eq("tipo", "agente");

      if (usuario.acceso === "regional") {
        queryAgentes = queryAgentes.eq("region", usuario.region);
      }

      const { data: agentesData } = await queryAgentes;
      if (!agentesData || agentesData.length === 0) {
        setHistorico([]);
        return setFechaRango({ inicio: null, fin: null });
      }

      const dias = Array.from({ length: 7 }, (_, i) => isoNDiasAtras(6 - i));
      const historicoData = [];

      for (const fecha of dias) {
        const { data: registrosDia } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select("mdn_usuario, ruta_norm, fecha_carga_cr")
          .eq("fecha_carga_cr_dia", fecha); // <-- Usando la columna calculada

        for (const ag of agentesData) {
          const totalDesabasto =
            registrosDia?.filter((r) => r.ruta_norm === ag.ruta_norm).length || 0;

          const { data: atencionesAgente } = await supabase
            .from("atenciones_agentes")
            .select("resultado, created_at")
            .eq("agente", ag.telefono) // <-- Usando telefono
            .eq("fecha_dia", fecha); // <-- Usando la columna calculada

          const totalAtendidos = atencionesAgente?.length || 0;
          const efectivos =
            atencionesAgente?.filter((a) => a.resultado === "efectivo").length ||
            0;

          const porcentajeAvance =
            totalDesabasto > 0
              ? Math.round((totalAtendidos / totalDesabasto) * 100)
              : 0;

          const porcentajeEfectivos =
            totalAtendidos > 0
              ? Math.round((efectivos / totalAtendidos) * 100)
              : 0;

          historicoData.push({
            fecha,
            agente: ag.nombre,
            telefono: ag.telefono,
            ruta: ag.ruta_norm,
            desabasto: totalDesabasto,
            atendidos: totalAtendidos,
            porcentajeAvance,
            porcentajeEfectivos,
          });
        }
      }

      const filtrados = historicoData.filter(
        (r) => r.desabasto > 0 || r.atendidos > 0
      );

      setHistorico(filtrados);
      setFechaRango({ inicio: dias[0], fin: dias[dias.length - 1] });
    } catch (err) {
      console.error("ERROR en histórico:", err.message);
      setHistorico([]);
      setFechaRango({ inicio: null, fin: null });
    } finally {
      setLoading(false);
    }
  }, [usuario]);

  // ---------------------------------------------------------------------
  // VISTA HISTÓRICO
  // ---------------------------------------------------------------------
  const VistaHistorico = () => {
    if (loading) {
      return (
        <p className="text-center text-gray-500 mt-6">Cargando histórico...</p>
      );
    }

    if (!historico || historico.length === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100">
          <div className="bg-white p-8 rounded-2xl shadow text-center">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">
              No hay datos históricos
            </h2>
            <button
              onClick={() => setVista("menu")}
              className="bg-blue-600 text-white py-2 px-5 rounded-lg hover:bg-blue-700"
            >
              ⬅ Volver
            </button>
          </div>
        </div>
      );
    }

    const grupos = historico.reduce((acc, r) => {
      if (!acc[r.agente]) acc[r.agente] = [];
      acc[r.agente].push(r);
      return acc;
    }, {});

    const agentesOrdenados = Object.entries(grupos)
      .map(([agente, registros]) => {
        const avgAvance =
          registros.reduce((s, r) => s + r.porcentajeAvance, 0) /
          registros.length;
        const avgEfectivos =
          registros.reduce((s, r) => s + r.porcentajeEfectivos, 0) /
          registros.length;

        return {
          agente,
          registros,
          avgAvance: Math.round(avgAvance),
          avgEfectivos: Math.round(avgEfectivos),
        };
      })
      .sort((a, b) => b.avgAvance - a.avgAvance);

    return (
      <div className="min-h-screen bg-gray-100 px-4 py-6 flex justify-center">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl">
          <h2 className="text-lg font-semibold text-gray-800 text-center mb-2">
            📈 Resumen Histórico — Últimos 7 días — Región {usuario.region}
          </h2>

          {fechaRango.inicio && (
            <p className="text-sm text-gray-600 text-center mb-4">
              Desde {formatFechaLargoCR(fechaRango.inicio)} hasta{" "}
              {formatFechaLargoCR(fechaRango.fin)}
            </p>
          )}

          <div className="flex justify-center mb-4">
            <button
              onClick={() => setVista("menu")}
              className="bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              ⬅ Volver
            </button>
          </div>

          {agentesOrdenados.map((ag, idx) => (
            <div key={ag.agente} className="mb-6 border-t pt-4">
              <h3 className="text-md font-bold text-gray-800 mb-2">
                {idx + 1}. 👤 {ag.agente}
              </h3>

              <p className="text-sm text-gray-600 mb-2">
                Promedio avance:{" "}
                <span
                  className={
                    ag.avgAvance >= 100
                      ? "text-green-600"
                      : ag.avgAvance >= 80
                      ? "text-yellow-600"
                      : ag.avgAvance >= 50
                      ? "text-orange-600"
                      : "text-red-600"
                  }
                >
                  {ag.avgAvance}%
                </span>{" "}
                | Efectivos:{" "}
                <span className="text-blue-600">{ag.avgEfectivos}%</span>
              </p>

              <div className="overflow-x-auto border rounded-lg shadow-sm">
                <table className="min-w-[600px] w-full text-sm">
                  <thead className="bg-gray-200 text-gray-800">
                    <tr>
                      <th className="p-2 text-left">Fecha</th>
                      <th className="p-2 text-center">Desabasto</th>
                      <th className="p-2 text-center">Atendidos</th>
                      <th className="p-2 text-center">% Avance</th>
                      <th className="p-2 text-center">% Efectivos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ag.registros.map((r, i) => (
                      <tr key={i} className="border-b hover:bg-gray-50 transition">
                        <td className="p-2">{formatFechaCortoCR(r.fecha)}</td>
                        <td className="p-2 text-center">{r.desabasto}</td>
                        <td className="p-2 text-center">{r.atendidos}</td>
                        <td
                          className={`p-2 text-center font-semibold ${
                            r.porcentajeAvance >= 100
                              ? "text-green-600"
                              : r.porcentajeAvance >= 80
                              ? "text-yellow-600"
                              : r.porcentajeAvance >= 50
                              ? "text-orange-600"
                              : "text-red-600"
                          }`}
                        >
                          {r.porcentajeAvance}%
                        </td>
                        <td className="p-2 text-center text-blue-600 font-semibold">
                          {r.porcentajeEfectivos}%
                        </td>
                      </tr>
                    ))}

                    <tr className="bg-gray-100 font-semibold">
                      <td className="p-2 text-center">Promedio</td>
                      <td className="p-2 text-center">—</td>
                      <td className="p-2 text-center">—</td>
                      <td className="p-2 text-center">{ag.avgAvance}%</td>
                      <td className="p-2 text-center">{ag.avgEfectivos}%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // =====================================================================
  // VISTAS PRINCIPALES (MENÚ, HOY, ANTERIOR)
  // =====================================================================
  const VistaMenu = () => (
    <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
      <div className="flex flex-col justify-center items-center w-full px-4">
        <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full animate-fadeIn sm:mt-[-250px]">
          <h2 className="text-xl font-semibold mb-6 text-gray-800">
            Supervisión — {usuario.region}
          </h2>

          <div className="space-y-4">
            <button
              onClick={() => {
                setVista("actual");
                cargarAgentesDelDia(0);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold"
            >
              📊 Seguimiento Desabasto (Hoy)
            </button>

            <button
              onClick={() => {
                setVista("anterior");
                cargarAgentesDelDia(1);
              }}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-lg font-semibold"
            >
              📅 Día Anterior
            </button>

            <button
              onClick={() => {
                setVista("historico");
                cargarHistorico7Dias();
              }}
              className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold"
            >
              📈 Histórico 7 días
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ---------------------------------------------------------------------
  // VISTA SEGUIMIENTO (HOY / AYER) - AHORA INCLUYE LA VISTA DE DETALLES
  // ---------------------------------------------------------------------
  const VistaSeguimiento = ({ offset }) => {
    if (loading)
      return (
        <p className="text-center text-gray-500 mt-6">Cargando información…</p>
      );

    // Si detalles está definido, renderiza la vista de detalles
    if (detalles) {
      return <VistaDetalleRuta detalles={detalles} onVolver={() => setDetalles(null)} />;
    }

    const {
      totalZonaDesabasto = 0,
      totalZonaAtendidos = 0,
      porcentajeZona = 0,
      porcentajeEfectivosZona = 0,
      colorZona = "bg-red-600",
      semaforo = "🔴",
    } = resumenZona;

    return (
      <div className="min-h-screen bg-gray-100 px-4 py-6 flex justify-center">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl">

          <h2 className="text-xl font-semibold text-gray-800 text-center">
            {semaforo} Supervisión — {usuario.region}
          </h2>

          <p className="text-sm text-gray-500 text-center mb-3">
            {offset === 1
              ? formatFechaLargoCR(isoNDiasAtras(1))
              : formatFechaLargoCR(hoyISO())}
          </p>

          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={() => setVista("menu")}
              className="text-sm bg-gray-500 text-white py-1 px-4 rounded-lg hover:bg-gray-600"
            >
              ⬅ Menú
            </button>

            <button
              onClick={() => cargarAgentesDelDia(offset)}
              className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              🔄 Actualizar
            </button>
          </div>

          <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`${colorZona} h-4 transition-all duration-500`}
              style={{ width: `${porcentajeZona}%` }}
            />
          </div>

          <p className="text-sm text-center text-gray-700 mb-4">
            {totalZonaAtendidos} de {totalZonaDesabasto} PDV atendidos (
            {porcentajeZona}%) | Efectivos: {porcentajeEfectivosZona}%
          </p>

          {agentes.length === 0 ? (
            <div className="bg-white p-6 rounded-xl shadow text-center text-gray-600">
              No hay agentes registrados en esta región.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {agentes.map((a) => (
                <div
                  key={a.telefono}
                  className="rounded-xl shadow-md p-4 border border-gray-200 bg-white"
                >
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span>{a.semaforo}</span> {a.nombre}
                  </h3>
                  <p className="text-xs text-gray-500 mb-1">
                    {a.ranking}.º de {a.totalAgentes} — Ruta {a.ruta_norm}
                  </p>

                  <div className="bg-gray-300 rounded-full h-3 overflow-hidden mb-2">
                    <div
                      className={`${a.colorBarra} h-3 transition-all duration-500`}
                      style={{ width: `${a.porcentajeAvance}%` }}
                    />
                  </div>

                  <p className="text-xs text-gray-700 mb-2">
                    {a.totalAtendidos} de {a.totalDesabasto} PDV atendidos (
                    {a.porcentajeAvance}%) | Efectivos: {a.porcentajeEfectivos}%
                  </p>

                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                    onClick={() =>
                      cargarDetallesRuta(a.ruta_norm, a.telefono, a.nombre)
                    }
                  >
                    🔍 Ver detalles
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // =====================================================================
  // RENDER PRINCIPAL - AHORA SOLO GESTIONA LAS VISTAS PRINCIPALES
  // =====================================================================
  if (vista === "menu") return <VistaMenu />;
  if (vista === "actual") return <VistaSeguimiento offset={0} />;
  if (vista === "anterior") return <VistaSeguimiento offset={1} />;
  if (vista === "historico") return <VistaHistorico />;

  // Por si acaso
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
      <p className="text-gray-600">Cargando…</p>
    </div>
  );
}