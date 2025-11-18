/* eslint-disable no-unused-vars */
/* ============================================================================
   GlobalSupervisorMenu — Módulo A DESARROLLO Ver 3.0.1
   Imports, configuración inicial, helpers de fecha y helpers visuales
   ============================================================================ */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "../../../supabaseClient.js";
/* ============================================================================
   Componente principal
   ============================================================================ */
export default function GlobalSupervisorMenu({ usuario }) {
  /* --------------------------------------------------------------------------
     Vistas y contexto global
     -------------------------------------------------------------------------- */
  const [vista, setVista] = useState("menu"); 
  const [offsetDiasCtx, setOffsetDiasCtx] = useState(0);
  const [fechaFijadaCtx, setFechaFijadaCtx] = useState(null);
  const [metricaLiberty, setMetricaLiberty] = useState(null);
  /* --------------------------------------------------------------------------
     Estados globales para resumen, región, agentes, histórico y motivos
     -------------------------------------------------------------------------- */
  const [regiones, setRegiones] = useState([]);
  const [regionSeleccionada, setRegionSeleccionada] = useState(null);
  const [agentesRegion, setAgentesRegion] = useState([]);
  const [agenteSeleccionado, setAgenteSeleccionado] = useState(null);
  const [detallesAgente, setDetallesAgente] = useState(null);
  const [loading, setLoading] = useState(true);
  const [resumenGlobal, setResumenGlobal] = useState({});
  const [historico, setHistorico] = useState([]);
  const [fechaRango, setFechaRango] = useState({ inicio: null, fin: null });
  const [historicoRegionAgentes, setHistoricoRegionAgentes] = useState([]);
  const [fechaRangoRegion, setFechaRangoRegion] = useState({ inicio: null, fin: null });
  const [resumenMotivos, setResumenMotivos] = useState([]);
  const [resumenMotivosRegion, setResumenMotivosRegion] = useState([]);
  /* --------------------------------------------------------------------------
     Detección de SuperAdmin
     -------------------------------------------------------------------------- */
  const isSuperAdmin = (() => {
    const a = String(usuario?.acceso || "").toLowerCase();
    const r = String(usuario?.rol || "").toLowerCase();
    const t = String(usuario?.tipo || "").toLowerCase();
    const sup = String(usuario?.supervisor || "").toLowerCase();
    const flag = Boolean(usuario?.superadmin === true);
    return (
      a === "superadmin" ||
      r === "superadmin" ||
      flag ||
      (t === "supervisor" && sup === "superadmin")
    );
  })();
  /* --------------------------------------------------------------------------
     Zona horaria y helpers de fecha (versión uniforme que evita desfaces)
     -------------------------------------------------------------------------- */
  const TZ = "America/Costa_Rica";
  // === Fecha “hoy” en CR (YYYY-MM-DD) ===
  const hoyISO = () =>
    new Date().toLocaleDateString("en-CA", { timeZone: TZ });
  // === Obtener fecha N días atrás (CR real, sin efectos de timezone) ===
  const isoNDiasAtras = (n) => {
    const base = hoyISO(); // YYYY-MM-DD ya en CR
    const [y, m, d] = base.split("-").map(Number);
    const ref = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); 
    ref.setUTCDate(ref.getUTCDate() - n);
    const yy = ref.getUTCFullYear();
    const mm = String(ref.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ref.getUTCDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
  };
  // === Parser estable para evitar salto de día ===
  const parseISOasCRDate = (iso) => {
    const [y, m, d] = (iso || "").split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  };
  // === Formato largo uniforme ===
  const formatFechaLargoCR = (iso) => {
    if (!iso) return "";
    const fecha = parseISOasCRDate(iso);
    const opciones = {
      timeZone: TZ,
      weekday: "long",
      day: "2-digit",
      month: "short",
      year: "numeric",
    };
    const txt = fecha.toLocaleDateString("es-CR", opciones).replace(/\.$/, "");
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  };
  /* --------------------------------------------------------------------------
     Helpers visuales (colores, porcentajes, formatos seguros)
     -------------------------------------------------------------------------- */
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
  const getEffTextColor = (pEff) =>
    pEff < 80 ? "text-red-600" : "text-green-600";
  const obtenerColorBarra = (p) => {
    const color = getBarColor(p);
    switch (color) {
      case "bg-green-600": return "🟢";
      case "bg-yellow-400": return "🟡";
      case "bg-orange-500": return "🟠";
      default: return "🔴";
    }
  };
  const formatNumber = (n) => {
    if (n === null || n === undefined || isNaN(n)) return "N/D";
    return Number(n).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };
  const normalizarRegion = (r) => {
    const n = (r || "").trim().toLowerCase();
    if (!n) return null;
    if (n.includes("oficina")) return null;
    if (n === "gte" || n.includes("gte")) return "GTE";
    if (n.includes("zona norte") || n === "norte") return "NORTE";
    if (n === "gam") return "GAM";
    return (r || "").toUpperCase();
  };
  // === Ajuste fino de porcentajes de motivos ===
  const ajustarPorcentajes100 = (items) => {
    const positivos = (items || [])
      .map((x) => ({
        motivo: x.motivo,
        porcentaje: parseFloat(x.porcentaje || 0),
        count: x.count || 0,
      }))
      .filter((x) => x.porcentaje > 0);
    if (positivos.length === 0) return [];
    let arr = positivos.map((x) => ({
      ...x,
      porcentaje: parseFloat(x.porcentaje.toFixed(2)),
    }));
    arr.sort((a, b) => b.porcentaje - a.porcentaje);
    let suma = arr.reduce((s, x) => s + x.porcentaje, 0);
    const diff = parseFloat((100 - suma).toFixed(2));
    if (Math.abs(diff) >= 0.01)
      arr[arr.length - 1].porcentaje = parseFloat(
        (arr[arr.length - 1].porcentaje + diff).toFixed(2)
      );
    if (arr[arr.length - 1].porcentaje < 0) {
      arr[arr.length - 1].porcentaje = 0;
      const nuevaSuma = arr.reduce((s, x) => s + x.porcentaje, 0);
      const diff2 = parseFloat((100 - nuevaSuma).toFixed(2));
      arr[0].porcentaje = parseFloat((arr[0].porcentaje + diff2).toFixed(2));
    }
    arr.sort((a, b) => b.porcentaje - a.porcentaje);
    return arr;
  };
/* ============================================================================
   MÓDULO B — CARGA DE DATOS: RESUMEN GLOBAL (HOY / DÍA ANTERIOR)
   ============================================================================ */
  const cargarResumenGlobalGenerico = useCallback(
    async (offsetDias = 0, fechaForzada = null) => {
      setLoading(true);
      // Obtención correcta de la fecha de referencia — CR estable
      const fechaReferencia = fechaForzada ?? isoNDiasAtras(offsetDias);
      try {
        /* -------------------------------------------------------------
           1. Obtener agentes activos y normalizar región
        ------------------------------------------------------------- */
        const { data: agentesDataRaw, error: agentesError } = await supabase
          .from("agentes")
          .select("telefono, nombre, region, ruta_norm, activo, tipo") // <--- CAMBIO: Solo campos necesarios
          .eq("activo", true)
          .eq("tipo", "agente"); // <--- Asegura que solo sean agentes
        if (agentesError) throw agentesError;
        const agentesData = (agentesDataRaw || [])
          .map((a) => ({ 
            ...a, 
            region_norm: normalizarRegion(a.region) 
          }))
          .filter((a) => a.region_norm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm
        /* -------------------------------------------------------------
           2. Agrupar agentes por región
        ------------------------------------------------------------- */
        const regionesMap = {};
        agentesData.forEach((a) => {
          if (!regionesMap[a.region_norm]) regionesMap[a.region_norm] = [];
          regionesMap[a.region_norm].push(a);
        });
        /* -------------------------------------------------------------
           3. Acumuladores globales
        ------------------------------------------------------------- */
        let totalGlobalDesabasto = 0;
        let totalGlobalAtendidos = 0;
        let totalGlobalEfectivos = 0;
        /* -------------------------------------------------------------
           4. Procesar cada región y cada agente
        ------------------------------------------------------------- */
        const regionesConDatos = await Promise.all(
          Object.keys(regionesMap).map(async (regionKey) => {
            const agentesRegionLocal = regionesMap[regionKey];
            let totalRegionDesabasto = 0;
            let totalRegionAtendidos = 0;
            let totalRegionEfectivos = 0;
            await Promise.all(
              agentesRegionLocal.map(async (agente) => {
                /* --------------------------------------------------
                   DESABASTO — Vista corregida vw_desabasto_unicos_cr
                   Filtro real por ruta_norm - CAMBIO: Usa fecha_carga_cr_dia
                -------------------------------------------------- */
                const { data: registros, error: errorLiberty } = await supabase
                  .from("vw_desabasto_unicos_cr")
                  .select(`
                    mdn_usuario,
                    saldo_menor_al_promedio_diario,
                    fecha_carga_cr,
                    ruta_norm
                  `)
                  .eq("ruta_norm", agente.ruta_norm) // <--- CAMBIO: Usa ruta_norm
                  .in("saldo_menor_al_promedio_diario", [
                    "Menor al 25%",
                    "Menor al 50%",
                    "Menor al 75%"
                  ])
                  .eq("fecha_carga_cr_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_carga_cr_dia
                if (errorLiberty) {
                  console.error("Error al consultar desabasto:", errorLiberty);
                  return;
                }
                /* --------------------------------------------------
                   ATENCIONES DEL AGENTE — Día exacto CR - CAMBIO: Usa fecha_dia
                -------------------------------------------------- */
                const { data: atencionesDia, error: errorAt } = await supabase
                  .from("atenciones_agentes")
                  .select("mdn_usuario, resultado, agente, fecha_dia") // <--- CAMBIO: Incluye fecha_dia si es necesario
                  .eq("agente", agente.telefono) // <--- CAMBIO: Usa telefono
                  .eq("fecha_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_dia
                if (errorAt) console.error("Error atenciones:", errorAt);
                /* --------------------------------------------------
                   CÁLCULOS POR AGENTE
                -------------------------------------------------- */
                const totalDesabasto = registros?.length || 0;
                const totalAtendidos = atencionesDia?.length || 0;
                const efectivos = (atencionesDia || []).filter(
                  (x) => x.resultado === "efectivo"
                ).length;
                totalRegionDesabasto += totalDesabasto;
                totalRegionAtendidos += totalAtendidos;
                totalRegionEfectivos += efectivos;
              })
            );
            /* -------------------------------------------------------------
               5. Porcentajes por región
            ------------------------------------------------------------- */
            const porcentajeAvance =
              totalRegionDesabasto > 0
                ? Math.round((totalRegionAtendidos / totalRegionDesabasto) * 100)
                : 0;
            const porcentajeEfectividad =
              totalRegionAtendidos > 0
                ? Math.round((totalRegionEfectivos / totalRegionAtendidos) * 100)
                : 0;
            /* -------------------------------------------------------------
               6. Acumulado global
            ------------------------------------------------------------- */
            totalGlobalDesabasto += totalRegionDesabasto;
            totalGlobalAtendidos += totalRegionAtendidos;
            totalGlobalEfectivos += totalRegionEfectivos;
            return {
              region: regionKey,
              totalRegionDesabasto,
              totalRegionAtendidos,
              totalRegionEfectivos,
              porcentajeAvance,
              porcentajeEfectividad,
              semaforo: obtenerColorBarra(porcentajeAvance)
            };
          })
        );
        /* -------------------------------------------------------------
           7. Calcular porcentaje global
        ------------------------------------------------------------- */
        const porcentajeGlobal =
          totalGlobalDesabasto > 0
            ? Math.round((totalGlobalAtendidos / totalGlobalDesabasto) * 100)
            : 0;
        const porcentajeGlobalEfectividad =
          totalGlobalAtendidos > 0
            ? Math.round((totalGlobalEfectivos / totalGlobalAtendidos) * 100)
            : 0;
        /* -------------------------------------------------------------
           8. Actualizar estados
        ------------------------------------------------------------- */
        setResumenGlobal({
          totalGlobalDesabasto,
          totalGlobalAtendidos,
          totalGlobalEfectivos,
          porcentajeGlobal,
          porcentajeGlobalEfectividad,
          semaforo: obtenerColorBarra(porcentajeGlobal)
        });
        setRegiones(
          regionesConDatos.sort(
            (a, b) => b.porcentajeAvance - a.porcentajeAvance
          )
        );
      } catch (e) {
        console.error("Error resumen global:", e);
        setResumenGlobal({});
        setRegiones([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );
/* ============================================================================
   MÓDULO C — CARGA DE REGIÓN Y CARGA DE DETALLE DE AGENTE
   ============================================================================ */
  // === CARGA DE AGENTES DE UNA REGIÓN (HOY / ANTERIOR) ===
  const cargarRegion = async (regionNorm, offsetDias = 0) => {
    setLoading(true);
    setRegionSeleccionada(regionNorm);
    setAgenteSeleccionado(null);
    setDetallesAgente(null);
    // Fecha de referencia
    const fecha = fechaFijadaCtx ?? isoNDiasAtras(offsetDias);

    // Obtener agentes activos - CAMBIO: Selecciona telefono y ruta_norm
    const { data: agentesDataRaw } = await supabase
      .from("agentes")
      .select("telefono, nombre, region, ruta_norm, activo, tipo") // <--- CAMBIO: Solo campos necesarios
      .eq("activo", true)
      .eq("tipo", "agente"); // <--- Asegura que solo sean agentes

    const agentesRegionLocal = (agentesDataRaw || [])
      .map((a) => ({ ...a, region_norm: normalizarRegion(a.region) }))
      .filter((a) => a.region_norm === regionNorm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm

    // Cargar datos por cada agente
    const agentesConDatos = await Promise.all(
      agentesRegionLocal.map(async (agente) => {
        /* -------------------------------------------------------------
           DESABASTO — Vista vw_desabasto_unicos_cr - CAMBIO: Usa fecha_carga_cr_dia
        ------------------------------------------------------------- */
        const { data: registros, error } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select(`
            mdn_usuario,
            saldo_menor_al_promedio_diario,
            fecha_carga_cr,
            ruta_norm
          `)
          .eq("ruta_norm", agente.ruta_norm) // <--- CAMBIO: Usa ruta_norm
          .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia
        if (error) {
          console.error("Error desabasto región:", error);
          return { ...agente, desabasto: [], atenciones: [] };
        }
        /* -------------------------------------------------------------
           ATENCIONES DEL AGENTE - CAMBIO: Usa fecha_dia
        ------------------------------------------------------------- */
        const { data: atenciones, error: errorAt } = await supabase
          .from("atenciones_agentes")
          .select("mdn_usuario, resultado, created_at")
          .eq("agente", agente.telefono) // <--- CAMBIO: Usa telefono
          .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia
        if (errorAt) console.error("Error atenciones región:", errorAt);
        /* -------------------------------------------------------------
           CÁLCULOS
        ------------------------------------------------------------- */
        const totalDesabasto = registros?.length || 0;
        const totalAtendidos = atenciones?.length || 0;
        const efectivos = (atenciones || []).filter(
          (x) => x.resultado === "efectivo"
        ).length;
        const porcentajeAvance =
          totalDesabasto > 0
            ? Math.round((totalAtendidos / totalDesabasto) * 100)
            : 100;
        const porcentajeEfectividad =
          totalAtendidos > 0
            ? Math.round((efectivos / totalAtendidos) * 100)
            : 0;

        return {
          ...agente,
          totalDesabasto,
          totalAtendidos,
          efectivos,
          porcentajeAvance,
          porcentajeEfectividad,
          semaforo: obtenerColorBarra(porcentajeAvance)
        };
      })
    );
    setAgentesRegion(
      agentesConDatos.sort((a, b) => b.porcentajeAvance - a.porcentajeAvance)
    );
    setLoading(false);
    setVista("region");
  };
    /* ============================================================================
     DETALLE DEL AGENTE — PENDIENTES, ATENDIDOS, EFECTIVIDAD, MOTIVOS - CORREGIDO (PARSE ERROR)
     ============================================================================ */
  const cargarDetalleAgente = async (agente) => {
    console.log("🔍 DEBUG: cargarDetalleAgente - INICIO", agente); // Log para depuración
    setLoading(true);
    try {
      // Fecha de referencia: la del contexto actual (hoy o día fijado)
      const fecha = fechaFijadaCtx ?? isoNDiasAtras(offsetDiasCtx);
      console.log("🔍 DEBUG: Fecha de referencia para detalles", fecha); // Log para depuración

      /* -------------------------------------------------------------
         DESABASTO — Vista corregida - CAMBIO: Usa ruta_norm y fecha_carga_cr_dia
         - CAMBIO: Eliminado 'fecha_ultima_compra' de la selección
      ------------------------------------------------------------- */
      const { data: registros, error } = await supabase
        .from("vw_desabasto_unicos_cr")
        .select(`
          mdn_usuario,
          pdv,
          saldo,
          promedio_semanal,
          -- fecha_ultima_compra,  <-- Eliminado porque no existe en la vista
          saldo_menor_al_promedio_diario,
          fecha_carga_cr,
          ruta_norm
        `) // <--- Comentario JavaScript aquí está bien, fuera de la cadena de columnas
        .eq("ruta_norm", agente.ruta_norm) // <--- CAMBIO: Usa ruta_norm
        .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia
      if (error) {
          console.error("❌ Error al consultar desabasto en DETALLES:", error);
          throw error; // Lanza el error para que sea capturado por el catch
      }
      console.log("🔍 DEBUG: Registros de desabasto para detalles", registros); // Log para depuración

      /* -------------------------------------------------------------
         ATENCIONES DEL AGENTE — incluye motivos - CAMBIO: Usa telefono y fecha_dia
      ------------------------------------------------------------- */
      const { data: atencionesDia, error: errAt } = await supabase
        .from("atenciones_agentes")
        .select(`
          id,
          mdn_usuario,
          pdv,
          hora,
          created_at,
          resultado,
          motivo_no_efectivo,
          fecha_dia
        `) // <--- Comentario JavaScript aquí está bien, fuera de la cadena de columnas
        .eq("agente", agente.telefono) // <--- CAMBIO: Usa telefono
        .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia
      if (errAt) {
          console.error("❌ Error al consultar atenciones en DETALLES:", errAt);
          throw errAt; // Lanza el error para que sea capturado por el catch
      }
      console.log("🔍 DEBUG: Atenciones para detalles", atencionesDia); // Log para depuración

      /* -------------------------------------------------------------
         PENDIENTES — registros sin atención
      ------------------------------------------------------------- */
      const atendidosIds = new Set(
        (atencionesDia || []).map((a) => String(a.mdn_usuario))
      );
      console.log("🔍 DEBUG: IDs de atenciones para filtrar pendientes", Array.from(atendidosIds)); // Log para depuración
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
      console.log("🔍 DEBUG: Pendientes calculados", pendientes); // Log para depuración

      /* -------------------------------------------------------------
         CÁLCULOS DE EFECTIVIDAD
      ------------------------------------------------------------- */
      const totalDesabasto = registros?.length || 0;
      const totalAtendidos = atencionesDia?.length || 0;
      const efectivos = (atencionesDia || []).filter(
        (a) => a.resultado === "efectivo"
      ).length;
      const noEfectivos = (atencionesDia || []).filter(
        (a) => a.resultado === "no efectivo"
      ).length;
      const porcentajeAvance =
        totalDesabasto > 0
          ? Math.round((totalAtendidos / totalDesabasto) * 100)
          : 100;
      const porcentajeEfectividad =
        totalAtendidos > 0
          ? Math.round((efectivos / totalAtendidos) * 100)
          : 0;
      const porcentajeNoEfectivos =
        totalAtendidos > 0
          ? Math.round((noEfectivos / totalAtendidos) * 100)
          : 0;
      console.log("🔍 DEBUG: Cálculos de efectividad", { totalDesabasto, totalAtendidos, efectivos, noEfectivos, porcentajeAvance, porcentajeEfectividad, porcentajeNoEfectivos }); // Log para depuración

      /* -------------------------------------------------------------
         Motivos de no compra
      ------------------------------------------------------------- */
      const motivosMap = {};
      (atencionesDia || []).forEach((a) => {
        if (a.resultado === "no efectivo" && a.motivo_no_efectivo) {
          const m = a.motivo_no_efectivo.trim();
          motivosMap[m] = (motivosMap[m] || 0) + 1;
        }
      });
      const totalMotivos = Object.values(motivosMap).reduce(
        (s, x) => s + x,
        0
      );
      const motivosPorcentaje = Object.entries(motivosMap).map(
        ([m, v]) => ({
          motivo: m,
          count: v,
          porcentaje: totalMotivos
            ? ((v / totalMotivos) * 100).toFixed(2)
            : "0.00",
          cantidad: v
        })
      );
      console.log("🔍 DEBUG: Motivos de no compra", motivosPorcentaje); // Log para depuración

      /* -------------------------------------------------------------
         SET DETALLES
      ------------------------------------------------------------- */
      const nuevosDetalles = {
        pendientes,
        atenciones: atencionesDia || [],
        totalDesabasto,
        totalAtendidos,
        efectivos,
        noEfectivos,
        porcentajeAvance,
        porcentajeEfectividad,
        porcentajeNoEfectivos,
        motivosPorcentaje,
        semaforo: obtenerColorBarra(porcentajeAvance)
      };
      console.log("🔍 DEBUG: Estado detalles a ser actualizado", nuevosDetalles); // Log para depuración

      setDetallesAgente(nuevosDetalles);
      setAgenteSeleccionado(agente);
      setVista("agente"); // Cambia la vista para mostrar el detalle
      console.log("🔍 DEBUG: cargarDetalleAgente - FIN, vista cambiada a 'agente'"); // Log para depuración
    } catch (err) {
      console.error("❌ Error cargarDetalleAgente:", err);
      setDetallesAgente(null);
      setAgenteSeleccionado(null);
      // Opcional: Mostrar un mensaje de error al usuario
      alert("Error al cargar los detalles del agente: " + err.message);
      // Opcional: Volver a la vista de región en caso de error
      // setVista("region");
    } finally {
      setLoading(false);
      console.log("🔍 DEBUG: cargarDetalleAgente - FINALLY, loading a false"); // Log para depuración
    }
  };
  
/* ============================================================================
   MÓDULO D — HISTÓRICO GLOBAL (7 DÍAS) Y POR REGIÓN (AGENTES)
   ============================================================================ */
  // === HISTÓRICO GLOBAL 7 DÍAS (POR REGIÓN) ===
  const cargarResumenHistorico = useCallback(async () => {
    setLoading(true);
    try {
      // Obtener agentes activos - CAMBIO: Selecciona telefono y ruta_norm
      const { data: agentesDataRaw } = await supabase
        .from("agentes")
        .select("telefono, nombre, region, ruta_norm") // <--- CAMBIO: Solo campos necesarios
        .eq("activo", true)
        .eq("tipo", "agente"); // <--- Asegura que solo sean agentes

      const agentesData = (agentesDataRaw || [])
        .map((a) => ({ ...a, region_norm: normalizarRegion(a.region) }))
        .filter((a) => a.region_norm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm

      // Últimos 7 días (incluyendo hoy)
      const dias = Array.from({ length: 7 }, (_, i) => isoNDiasAtras(6 - i));
      const historicoData = [];
      for (const fecha of dias) {
        // Desabasto del día - CAMBIO: Usa fecha_carga_cr_dia
        const { data: registrosDia } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select("ruta_norm, mdn_usuario, fecha_carga_cr")
          .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia

        // Atenciones del mismo día - CAMBIO: Usa fecha_dia
        const { data: atencionesDia } = await supabase
          .from("atenciones_agentes")
          .select("agente, resultado, mdn_usuario, fecha_dia") // <--- CAMBIO: Incluye fecha_dia
          .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia

        // Agrupar por región
        const regionesMap = {};
        (agentesData || []).forEach((ag) => {
          const desabastoAg =
            (registrosDia || []).filter(
              (r) => r.ruta_norm === ag.ruta_norm // <--- CAMBIO: Usa ruta_norm
            ).length || 0;
          const atencionesAg = (atencionesDia || []).filter(
            (a) => a.agente === ag.telefono // <--- CAMBIO: Usa telefono
          );
          const atendidos = atencionesAg.length;
          const efectivos = atencionesAg.filter(
            (a) => a.resultado === "efectivo"
          ).length;
          if (!regionesMap[ag.region_norm]) {
            regionesMap[ag.region_norm] = {
              desabasto: 0,
              atendidos: 0,
              efectivos: 0
            };
          }
          regionesMap[ag.region_norm].desabasto += desabastoAg;
          regionesMap[ag.region_norm].atendidos += atendidos;
          regionesMap[ag.region_norm].efectivos += efectivos;
        });
        Object.entries(regionesMap).forEach(([region, vals]) => {
          const porcentajeAvance =
            vals.desabasto > 0
              ? Math.round((vals.atendidos / vals.desabasto) * 100)
              : 0;
          const porcentajeEfectivos =
            vals.atendidos > 0
              ? Math.round((vals.efectivos / vals.atendidos) * 100)
              : 0;
          historicoData.push({
            fecha,
            region,
            desabasto: vals.desabasto,
            atendidos: vals.atendidos,
            porcentajeAvance,
            porcentajeEfectivos
          });
        });
      }
      const filtrados = historicoData.filter(
        (r) => r.desabasto > 0 || r.atendidos > 0
      );
      setHistorico(filtrados);
      setFechaRango({ inicio: dias[0], fin: dias[dias.length - 1] });
    } catch (err) {
      console.error("Error histórico global:", err.message);
      setHistorico([]);
      setFechaRango({ inicio: null, fin: null });
    } finally {
      setLoading(false);
    }
  }, []);
  /* ============================================================================
     HISTÓRICO POR REGIÓN — DETALLE POR AGENTES
     ============================================================================ */
  const cargarResumenHistoricoRegion = async (regionNorm) => {
    setLoading(true);
    try {
      setRegionSeleccionada(regionNorm);
      // Obtener agentes activos - CAMBIO: Selecciona telefono y ruta_norm
      const { data: agentesDataRaw } = await supabase
        .from("agentes")
        .select("telefono, nombre, region, ruta_norm") // <--- CAMBIO: Solo campos necesarios
        .eq("activo", true)
        .eq("tipo", "agente"); // <--- Asegura que solo sean agentes

      const agentesRegion = (agentesDataRaw || [])
        .map((a) => ({ ...a, region_norm: normalizarRegion(a.region) }))
        .filter((a) => a.region_norm === regionNorm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm

      const dias = Array.from({ length: 7 }, (_, i) => isoNDiasAtras(6 - i));
      const historicoData = [];
      for (const fecha of dias) {
        // Desabasto del día - CAMBIO: Usa fecha_carga_cr_dia
        const { data: registrosDia } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select("ruta_norm, mdn_usuario") // <--- CAMBIO: Solo campos necesarios
          .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia

        // Atenciones del día - CAMBIO: Usa fecha_dia
        const { data: atencionesDia } = await supabase
          .from("atenciones_agentes")
          .select("agente, resultado, mdn_usuario, fecha_dia") // <--- CAMBIO: Incluye fecha_dia
          .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia

        agentesRegion.forEach((ag) => {
          const desabastoAg =
            (registrosDia || []).filter(
              (r) => r.ruta_norm === ag.ruta_norm // <--- CAMBIO: Usa ruta_norm
            ).length || 0;
          const atencionesAg = (atencionesDia || []).filter(
            (a) => a.agente === ag.telefono // <--- CAMBIO: Usa telefono
          );
          const totalAtendidos = atencionesAg.length;
          const efectivos = atencionesAg.filter(
            (a) => a.resultado === "efectivo"
          ).length;
          const porcentajeAvance =
            desabastoAg > 0
              ? Math.round((totalAtendidos / desabastoAg) * 100)
              : 0;
          const porcentajeEfectivos =
            totalAtendidos > 0
              ? Math.round((efectivos / totalAtendidos) * 100)
              : 0;
          historicoData.push({
            fecha,
            agente: ag.nombre,
            desabasto: desabastoAg,
            atendidos: totalAtendidos,
            efectivos,
            porcentajeAvance,
            porcentajeEfectivos
          });
        });
      }
      const filtrados = historicoData.filter(
        (r) => r.desabasto > 0 || r.atendidos > 0
      );
      setHistoricoRegionAgentes(filtrados);
      setFechaRangoRegion({ inicio: dias[0], fin: dias[dias.length - 1] });
      setVista("historicoRegionAgentes");
    } catch (err) {
      console.error("Error histórico región-agentes:", err.message);
      setHistoricoRegionAgentes([]);
      setFechaRangoRegion({ inicio: null, fin: null });
    } finally {
      setLoading(false);
    }
  };
/* ============================================================================
   MÓDULO E — RESUMEN MOTIVOS (7 DÍAS) Y DETALLE POR REGIÓN
   ============================================================================ */
  /* ============================================================================
     RESUMEN DE MOTIVOS — 7 DÍAS (POR REGIÓN)
     ============================================================================ */
  const cargarResumenMotivos = useCallback(async () => {
    setLoading(true);
    try {
      // Obtener agentes activos - CAMBIO: Selecciona telefono y ruta_norm
      const { data: agentes } = await supabase
        .from("agentes")
        .select("telefono, nombre, region, ruta_norm") // <--- CAMBIO: Solo campos necesarios
        .eq("activo", true)
        .eq("tipo", "agente"); // <--- Asegura que solo sean agentes

      const agentesData = (agentes || [])
        .map((a) => ({ ...a, region_norm: normalizarRegion(a.region) }))
        .filter((a) => a.region_norm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm

      const dias = Array.from({ length: 7 }, (_, i) => isoNDiasAtras(6 - i));
      const resumen = {}; // agrupado por región
      for (const fecha of dias) {
        // DESABASTO - CAMBIO: Usa fecha_carga_cr_dia
        const { data: registrosDia } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select("ruta_norm, mdn_usuario") // <--- CAMBIO: Solo campos necesarios
          .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia

        // ATENCIONES - CAMBIO: Usa fecha_dia
        const { data: atencionesDia } = await supabase
          .from("atenciones_agentes")
          .select("agente, resultado, motivo_no_efectivo, fecha_dia") // <--- CAMBIO: Incluye fecha_dia
          .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia

        // PROCESO POR AGENTE
        agentesData.forEach((ag) => {
          const region = ag.region_norm;
          if (!resumen[region]) {
            resumen[region] = {
              region,
              desabasto: 0,
              atendidos: 0,
              efectivos: 0,
              noefectivos: 0,
              motivos: {}
            };
          }
          // cuantos PDV tuvo en desabasto ese día
          const desabastoAg =
            (registrosDia || []).filter(
              (r) => r.ruta_norm === ag.ruta_norm // <--- CAMBIO: Usa ruta_norm
            ).length;
          // atenciones del agente ese día
          const atencionesAg =
            (atencionesDia || []).filter((a) => a.agente === ag.telefono); // <--- CAMBIO: Usa telefono
          const efectivos = atencionesAg.filter(
            (x) => x.resultado === "efectivo"
          ).length;
          const noefectivos = atencionesAg.filter(
            (x) => x.resultado === "no efectivo"
          ).length;
          resumen[region].desabasto += desabastoAg;
          resumen[region].atendidos += atencionesAg.length;
          resumen[region].efectivos += efectivos;
          resumen[region].noefectivos += noefectivos;
          // Motivos no compra
          atencionesAg.forEach((a) => {
            if (a.resultado === "no efectivo" && a.motivo_no_efectivo) {
              const motivo = a.motivo_no_efectivo.trim();
              if (!resumen[region].motivos[motivo])
                resumen[region].motivos[motivo] = 0;
              resumen[region].motivos[motivo] += 1;
            }
          });
        });
      }
      // Convertir resumen a array procesado
      const regionesProcesadas = Object.values(resumen).map((r) => {
        const motivosArray = Object.entries(r.motivos || {});
        const totalNoEf = motivosArray.reduce((s, [, v]) => s + v, 0);
        // convertir motivo → porcentaje
        const motivosPorcentaje = motivosArray.map(([motivo, count]) => ({
          motivo,
          count,
          porcentaje: totalNoEf
            ? ((count / totalNoEf) * 100).toFixed(2)
            : "0.00"
        }));
        return {
          ...r,
          porcentajeEfectivos:
            r.atendidos > 0
              ? Math.round((r.efectivos / r.atendidos) * 100)
              : 0,
          porcentajeNoEfectivos:
            r.atendidos > 0
              ? Math.round((r.noefectivos / r.atendidos) * 100)
              : 0,
          motivosPorcentaje: ajustarPorcentajes100(motivosPorcentaje)
        };
      });
      // Orden por regiones con más problemas
      regionesProcesadas.sort(
        (a, b) => (b.porcentajeNoEfectivos || 0) - (a.porcentajeNoEfectivos || 0)
      );
      setResumenMotivos(regionesProcesadas);
      setFechaRango({
        inicio: dias[0],
        fin: dias[dias.length - 1]
      });
      setVista("resumenMotivos");
    } catch (err) {
      console.error("Error resumen motivos:", err.message);
      setResumenMotivos([]);
    } finally {
      setLoading(false);
    }
  }, []);
  /* ============================================================================
     RESUMEN DE MOTIVOS POR REGIÓN → DETALLE POR AGENTES
     ============================================================================ */
  const cargarResumenMotivosRegion = async (regionNorm) => {
    setLoading(true);
    try {
      setRegionSeleccionada(regionNorm);
      // Obtener agentes activos - CAMBIO: Selecciona telefono y ruta_norm
      const { data: agentes } = await supabase
        .from("agentes")
        .select("telefono, nombre, region, ruta_norm") // <--- CAMBIO: Solo campos necesarios
        .eq("activo", true)
        .eq("tipo", "agente"); // <--- Asegura que solo sean agentes

      const agentesRegion = (agentes || [])
        .map((a) => ({ ...a, region_norm: normalizarRegion(a.region) }))
        .filter((a) => a.region_norm === regionNorm && a.ruta_norm); // <--- CAMBIO: Filtra por ruta_norm

      const dias = Array.from({ length: 7 }, (_, i) => isoNDiasAtras(6 - i));
      const resumenAgentes = {};
      for (const fecha of dias) {
        // DESABASTO - CAMBIO: Usa fecha_carga_cr_dia
        const { data: registrosDia } = await supabase
          .from("vw_desabasto_unicos_cr")
          .select("ruta_norm, mdn_usuario") // <--- CAMBIO: Solo campos necesarios
          .eq("fecha_carga_cr_dia", fecha); // <--- CAMBIO: Usa fecha_carga_cr_dia

        // ATENCIONES - CAMBIO: Usa fecha_dia
        const { data: atencionesDia } = await supabase
          .from("atenciones_agentes")
          .select("agente, resultado, motivo_no_efectivo, fecha_dia") // <--- CAMBIO: Incluye fecha_dia
          .eq("fecha_dia", fecha); // <--- CAMBIO: Usa fecha_dia

        agentesRegion.forEach((ag) => {
          const agKey = ag.nombre;
          if (!resumenAgentes[agKey]) {
            resumenAgentes[agKey] = {
              agente: agKey,
              desabasto: 0,
              atendidos: 0,
              efectivos: 0,
              noefectivos: 0,
              motivos: {}
            };
          }
          const desabastoAg =
            (registrosDia || []).filter(
              (r) => r.ruta_norm === ag.ruta_norm // <--- CAMBIO: Usa ruta_norm
            ).length;
          const atencionesAg = (atencionesDia || []).filter(
            (a) => a.agente === ag.telefono // <--- CAMBIO: Usa telefono
          );
          const efectivos = atencionesAg.filter(
            (a) => a.resultado === "efectivo"
          ).length;
          const noefectivos = atencionesAg.filter(
            (a) => a.resultado === "no efectivo"
          ).length;
          resumenAgentes[agKey].desabasto += desabastoAg;
          resumenAgentes[agKey].atendidos += atencionesAg.length;
          resumenAgentes[agKey].efectivos += efectivos;
          resumenAgentes[agKey].noefectivos += noefectivos;
          // Motivos por agente
          atencionesAg.forEach((a) => {
            if (a.resultado === "no efectivo" && a.motivo_no_efectivo) {
              const m = a.motivo_no_efectivo.trim();
              if (!resumenAgentes[agKey].motivos[m])
                resumenAgentes[agKey].motivos[m] = 0;
              resumenAgentes[agKey].motivos[m] += 1;
            }
          });
        });
      }
      const agentesProcesados = Object.values(resumenAgentes).map((a) => {
        const motivosArray = Object.entries(a.motivos || {});
        const totalNoEf = motivosArray.reduce((s, [, v]) => s + v, 0);
        const motivosPorcentaje = motivosArray.map(([m, v]) => ({
          motivo: m,
          count: v,
          porcentaje: totalNoEf
            ? ((v / totalNoEf) * 100).toFixed(2)
            : "0.00"
        }));
        return {
          ...a,
          porcentajeEfectivos:
            a.atendidos > 0
              ? Math.round((a.efectivos / a.atendidos) * 100)
              : 0,
          porcentajeNoEfectivos:
            a.atendidos > 0
              ? Math.round((a.noefectivos / a.atendidos) * 100)
              : 0,
          motivosPorcentaje: ajustarPorcentajes100(motivosPorcentaje)
        };
      });
      agentesProcesados.sort(
        (a, b) => (b.porcentajeNoEfectivos || 0) - (a.porcentajeNoEfectivos || 0)
      );
      setResumenMotivosRegion(agentesProcesados);
      setVista("resumenMotivosRegion");
    } catch (err) {
      console.error("Error resumen motivos región:", err.message);
      setResumenMotivosRegion([]);
    } finally {
      setLoading(false);
    }
  };
/* ============================================================================
   MÓDULO F — FECHAS LABORABLES, ÚLTIMO DÍA LABORABLE Y MÉTRICA LIBERTY
   ============================================================================ */
  // === Obtener última fecha laborable (lunes–sábado), excluyendo hoy ===
  const obtenerUltimaFechaLaborable = async () => {
    try {
      const { data, error } = await supabase
        .from("atenciones_agentes")
        .select("fecha_dia") // <--- CAMBIO: Usa fecha_dia
        .order("fecha_dia", { ascending: false }); // <--- CAMBIO: Ordena por fecha_dia
      if (error) throw error;
      if (!data || data.length === 0) return null;
      const hoyCR = hoyISO();
      const esDomingo = (iso) => {
        try {
          const d = parseISOasCRDate(iso);
          return d.getUTCDay() === 0; // 0 = domingo
        } catch {
          return false;
        }
      };
      for (const r of data) {
        if (!r.fecha_dia) continue; // <--- CAMBIO: Usa fecha_dia
        const iso = r.fecha_dia.split("T")[0]; // <--- CAMBIO: Usa fecha_dia
        if (iso === hoyCR) continue;     // excluir hoy
        if (esDomingo(iso)) continue;    // excluir domingo
        return iso;                      // primer día válido
      }
      return null;
    } catch (err) {
      console.error("Error obtenerUltimaFechaLaborable:", err.message);
      return null;
    }
  };
  /* ============================================================================
     MÉTRICA LIBERTY — Cálculo diario (hoy o anterior)
     ============================================================================ */
  const cargarMetricaLiberty = useCallback(async () => {
    try {
      // Fecha según vista
      const fechaReferencia =
        vista === "anterior" && fechaFijadaCtx
          ? fechaFijadaCtx
          : hoyISO();
      /* -----------------------------------------------------------------------
         1) Total cargados en desabasto (registros originales) - CAMBIO: Usa fecha_carga_cr_dia
      ----------------------------------------------------------------------- */
      const { count: totalCargados, error: errCarg } = await supabase
        .from("vw_desabasto_unicos_cr")
        .select("mdn_usuario", { count: "exact", head: true })
        .eq("fecha_carga_cr_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_carga_cr_dia
      if (errCarg) throw errCarg;
      /* -----------------------------------------------------------------------
         2) Total atendidos (todas las atenciones del día) - CAMBIO: Usa fecha_dia
      ----------------------------------------------------------------------- */
      const { count: totalAtendidos, error: errAt } = await supabase
        .from("atenciones_agentes")
        .select("id", { count: "exact", head: true })
        .eq("fecha_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_dia
      if (errAt) throw errAt;
      /* -----------------------------------------------------------------------
         3) Obtener total_excel del día desde control_registro
      ----------------------------------------------------------------------- */
      const { data: registrosControl, error: errCtrl } = await supabase
        .from("control_registro")
        .select("id, total_excel, fecha_carga")
        .order("fecha_carga", { ascending: false });
      if (errCtrl) throw errCtrl;
      const fechaSimple = fechaReferencia.split("T")[0];
      const registroActual =
        (registrosControl || []).find(
          (r) => (r.fecha_carga || "").startsWith(fechaSimple)
        ) ||
        (registrosControl || []).find(
          (r) => (r.fecha_carga || "") < `${fechaSimple}T00:00:00`
        );
      const totalExcel = registroActual?.total_excel || 0;
      const idRegistro = registroActual?.id;
      /* -----------------------------------------------------------------------
         4) Cálculo de desabasto no atendido (pendientes) - CAMBIO: Usa fecha_carga_cr_dia y fecha_dia
      ----------------------------------------------------------------------- */
      const { count: totalDesabastoHoy, error: errDes } = await supabase
        .from("vw_desabasto_unicos_cr")
        .select("mdn_usuario", { count: "exact", head: true })
        .eq("fecha_carga_cr_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_carga_cr_dia
      if (errDes) throw errDes;
      const { count: totalEfectivosHoy, error: errEf } = await supabase
        .from("atenciones_agentes")
        .select("id", { count: "exact", head: true })
        .eq("resultado", "efectivo")
        .eq("fecha_dia", fechaReferencia); // <--- CAMBIO: Usa fecha_dia
      if (errEf) throw errEf;
      const pendientes = Math.max(
        (totalDesabastoHoy || 0) - (totalEfectivosHoy || 0),
        0
      );
      /* -----------------------------------------------------------------------
         5) Fórmula principal
      ----------------------------------------------------------------------- */
      const porcentaje =
        totalExcel > 0 ? ((pendientes / totalExcel) * 100).toFixed(1) : "0";
      /* -----------------------------------------------------------------------
         6) Guardado automático solo si la vista es "actual"
      ----------------------------------------------------------------------- */
      if (idRegistro && vista === "actual") {
        const { error: errUpdate } = await supabase
          .from("control_registro")
          .update({ metrica_liberty: porcentaje })
          .eq("id", idRegistro);
        if (errUpdate)
          console.error("Error al guardar Métrica Liberty:", errUpdate.message);
      }
      /* -----------------------------------------------------------------------
         7) Guardar en estado
      ----------------------------------------------------------------------- */
      setMetricaLiberty({
        fechaReferencia,
        totalExcel,
        totalCargados,
        totalAtendidos,
        totalPendientes: pendientes,
        porcentaje
      });
    } catch (err) {
      console.error("Error en cargarMetricaLiberty:", err.message);
      setMetricaLiberty(null);
    }
  }, [vista, fechaFijadaCtx]);
/* ============================================================================
   MÓDULO G — CARGAS AUTOMÁTICAS POR VISTA Y RENDERS PRINCIPALES
   ============================================================================ */
  /* ============================================================================
     CARGAS AUTOMÁTICAS SEGÚN VISTA
     ============================================================================ */
  useEffect(() => {
    if (vista === "menu") {
      setLoading(false);
      return;
    }
    if (vista === "actual") {
      setFechaFijadaCtx(null);
      cargarResumenGlobalGenerico(0, null);
      cargarMetricaLiberty();
      return;
    }
    if (vista === "anterior") {
      (async () => {
        const ultimaFechaLab = await obtenerUltimaFechaLaborable();
        if (ultimaFechaLab) {
          setFechaFijadaCtx(ultimaFechaLab);
          await cargarResumenGlobalGenerico(0, ultimaFechaLab);
        } else {
          setFechaFijadaCtx(null);
          await cargarResumenGlobalGenerico(1, null);
        }
        cargarMetricaLiberty();
      })();
      return;
    }
    if (vista === "historico") {
      cargarResumenHistorico();
      return;
    }
  }, [
    vista,
    cargarResumenGlobalGenerico,
    cargarResumenHistorico,
    cargarMetricaLiberty
  ]);
  /* ============================================================================
     RENDER 1 — MENÚ PRINCIPAL
     ============================================================================ */
  if (vista === "menu") {
    return (
      <div className="min-h-screen sm:min-h-[90vh] flex items-start sm:items-center justify-center bg-gray-100 px-4 py-6 sm:py-10 overflow-hidden">
        <div className="flex flex-col justify-center items-center w-full px-4">
          <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full transform transition-all animate-fadeIn sm:mt-[-250px]">
            <h2 className="text-xl font-semibold mb-6 text-gray-800">
              Supervisión Global — Todas las Regiones
            </h2>
            <div className="space-y-4">
              <button
                onClick={() => {
                  setOffsetDiasCtx(0);
                  setVista("actual");
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold"
              >
                📊 Seguimiento Desabasto (Hoy)
              </button>
              <button
                onClick={() => {
                  setOffsetDiasCtx(1);
                  setVista("anterior");
                }}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 px-4 rounded-lg font-semibold"
              >
                📅 Revisar Desabasto último día de atención
              </button>
              <button
                onClick={() => setVista("historico")}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold"
              >
                📈 Resumen por Región (7 días)
              </button>
              <button
                onClick={() => cargarResumenMotivos()}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white py-3 px-4 rounded-lg font-semibold"
              >
                📊 Resumen Razones No Compra (7 días)
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 2 — ACTUAL (HOY)
     ============================================================================ */
  if (vista === "actual") {
    const {
      totalGlobalDesabasto = 0,
      totalGlobalAtendidos = 0,
      totalGlobalEfectivos = 0,
      porcentajeGlobal = 0,
      porcentajeGlobalEfectividad = 0,
      semaforo = "🔴"
    } = resumenGlobal;
    if (
      !loading &&
      (regiones.length === 0 ||
        (totalGlobalDesabasto === 0 &&
          totalGlobalAtendidos === 0 &&
          totalGlobalEfectivos === 0))
    ) {
      return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-10">
          <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">
              Supervisión Global — Todas las Regiones
            </h2>
            <p className="text-sm text-gray-600 mb-6">
              Datos no han sido cargados para el día de hoy.
            </p>
            <button
              onClick={() => setVista("menu")}
              className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-semibold"
            >
              ⬅ Volver al Menú
            </button>
          </div>
        </div>
      );
    }
    const barClass = getBarColor(porcentajeGlobal);
    const pctClass = getPctTextColor(porcentajeGlobal);
    const effClass = getEffTextColor(porcentajeGlobalEfectividad);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full transform transition-all animate-fadeIn sm:mt-[-150px]">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {semaforo} Supervisor Global — Todas las Regiones
            </h2>
            <p className="text-sm text-gray-500">
              📅 {formatFechaLargoCR(hoyISO())}
            </p>
          </div>
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={() => setVista("menu")}
              className="text-sm bg-gray-500 text-white py-1 px-4 rounded-lg hover:bg-gray-600"
            >
              ⬅ Menú
            </button>
            <button
              onClick={() =>
                cargarResumenGlobalGenerico(0, null)
              }
              className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              🔄 Actualizar
            </button>
          </div>
          <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`${barClass} h-4`}
              style={{ width: `${porcentajeGlobal}%` }}
            />
          </div>
          <p className="text-sm text-center text-gray-700 mb-1">
            Avance Global:{" "}
            <span className={`font-semibold ${pctClass}`}>
              {porcentajeGlobal}%
            </span>{" "}
            — {totalGlobalAtendidos} de {totalGlobalDesabasto} PDV atendidos
          </p>
          <p className="text-xs text-center text-gray-600 mb-1">
            Efectividad Global:{" "}
            <span className={`font-semibold ${effClass}`}>
              {porcentajeGlobalEfectividad}%
            </span>{" "}
            — Efectivos {totalGlobalEfectivos} de {totalGlobalAtendidos}
          </p>
          {/* Métrica Liberty */}
          {metricaLiberty && (
            <>
              <p className="text-sm font-semibold text-center mt-1 mb-1 text-blue-600">
                Métrica de Desabasto Liberty:{" "}
                <span
                  className={
                    parseFloat(metricaLiberty.porcentaje) < 4
                      ? "text-green-600 font-bold"
                      : "text-red-600 font-bold"
                  }
                >
                  {metricaLiberty.porcentaje}%
                </span>{" "}
                — ({metricaLiberty.totalPendientes} de{" "}
                {metricaLiberty.totalExcel})
              </p>
              <div className="mb-3" />
            </>
          )}
          {/* Lista de regiones */}
          {regiones.length === 0 ? (
            <div className="bg-white p-6 rounded-xl shadow-sm text-center text-gray-600">
              No hay datos de regiones disponibles.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {regiones.map((r, i) => {
                const rBar = getBarColor(r.porcentajeAvance);
                const rPct = getPctTextColor(r.porcentajeAvance);
                const rEff = getEffTextColor(r.porcentajeEfectividad);
                return (
                  <div
                    key={i}
                    className="rounded-xl shadow-md p-4 border border-gray-200 bg-white"
                  >
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <span>{r.semaforo}</span> ZONA {r.region?.toUpperCase()}
                    </h3>
                    <div className="bg-gray-300 rounded-full h-3 overflow-hidden mb-2">
                      <div
                        className={`${rBar} h-3`}
                        style={{ width: `${r.porcentajeAvance}%` }}
                      />
                    </div>
                    <p className="text-xs">
                      Avance:{" "}
                      <span className={`font-semibold ${rPct}`}>
                        {r.porcentajeAvance}%
                      </span>{" "}
                      — {r.totalRegionAtendidos} de {r.totalRegionDesabasto}
                    </p>
                    <p className="text-xs mb-2">
                      Efectividad:{" "}
                      <span className={`font-semibold ${rEff}`}>
                        {r.porcentajeEfectividad}%
                      </span>{" "}
                      — Efectivos {r.totalRegionEfectivos} de{" "}
                      {r.totalRegionAtendidos}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => cargarRegion(r.region, 0)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                      >
                        Ver región
                      </button>
                      <button
                        onClick={() => cargarResumenHistoricoRegion(r.region)}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                      >
                        Histórico 7 días (agentes)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 3 — VISTA ANTERIOR (ÚLTIMO DÍA LABORABLE)
     ============================================================================ */
  if (vista === "anterior") {
    const {
      totalGlobalDesabasto = 0,
      totalGlobalAtendidos = 0,
      totalGlobalEfectivos = 0,
      porcentajeGlobal = 0,
      porcentajeGlobalEfectividad = 0,
      semaforo = "🔴"
    } = resumenGlobal;
    const barClass = getBarColor(porcentajeGlobal);
    const pctClass = getPctTextColor(porcentajeGlobal);
    const effClass = getEffTextColor(porcentajeGlobalEfectividad);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-8 text-center max-w-md w-full transform transition-all animate-fadeIn sm:mt-[-150px]">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {semaforo} Desabasto Último día atención — Todas las Regiones
            </h2>
            <p className="text-sm text-gray-500">
              📅 {formatFechaLargoCR(fechaFijadaCtx)}
            </p>
          </div>
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={() => setVista("menu")}
              className="text-sm bg-gray-500 text-white py-1 px-4 rounded-lg hover:bg-gray-600"
            >
              ⬅ Menú
            </button>
            <button
              onClick={() =>
                cargarResumenGlobalGenerico(
                  1,
                  fechaFijadaCtx ?? null
                )
              }
              className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              🔄 Actualizar
            </button>
          </div>
          <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`${barClass} h-4`}
              style={{ width: `${porcentajeGlobal}%` }}
            />
          </div>
          <p className="text-sm text-center text-gray-700 mb-1">
            Avance Global:{" "}
            <span className={`font-semibold ${pctClass}`}>
              {porcentajeGlobal}%
            </span>{" "}
            — {totalGlobalAtendidos} de {totalGlobalDesabasto}
          </p>
          <p className="text-xs text-center text-gray-600 mb-1">
            Efectividad:{" "}
            <span className={`font-semibold ${effClass}`}>
              {porcentajeGlobalEfectividad}%
            </span>{" "}
            — Efectivos {totalGlobalEfectivos} de {totalGlobalAtendidos}
          </p>
          {metricaLiberty && (
            <>
              <p className="text-sm font-semibold text-center mt-1 mb-1 text-blue-600">
                Métrica Liberty:{" "}
                <span
                  className={
                    parseFloat(metricaLiberty.porcentaje) < 4
                      ? "text-green-600 font-bold"
                      : "text-red-600 font-bold"
                  }
                >
                  {metricaLiberty.porcentaje}%
                </span>{" "}
                — ({metricaLiberty.totalPendientes} de{" "}
                {metricaLiberty.totalExcel})
              </p>
              <div className="mb-3" />
            </>
          )}
          {/* LISTA REGIONES IGUAL QUE EN "ACTUAL" */}
          <div className="grid gap-4 md:grid-cols-2">
            {regiones.map((r, i) => {
              const rBar = getBarColor(r.porcentajeAvance);
              const rPct = getPctTextColor(r.porcentajeAvance);
              const rEff = getEffTextColor(r.porcentajeEfectividad);
              return (
                <div
                  key={i}
                  className="rounded-xl shadow-md p-4 border border-gray-200 bg-white"
                >
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <span>{r.semaforo}</span> ZONA{" "}
                    {r.region?.toUpperCase()}
                  </h3>
                  <div className="bg-gray-300 rounded-full h-3 overflow-hidden mb-2">
                    <div
                      className={`${rBar} h-3`}
                      style={{ width: `${r.porcentajeAvance}%` }}
                    />
                  </div>
                  <p className="text-xs">
                    Avance:{" "}
                    <span className={`font-semibold ${rPct}`}>
                      {r.porcentajeAvance}%
                    </span>{" "}
                    — {r.totalRegionAtendidos} de{" "}
                    {r.totalRegionDesabasto}
                  </p>
                  <p className="text-xs mb-2">
                    Efectividad:{" "}
                    <span className={`font-semibold ${rEff}`}>
                      {r.porcentajeEfectividad}%
                    </span>{" "}
                    — Efectivos {r.totalRegionEfectivos} de{" "}
                    {r.totalRegionAtendidos}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        cargarRegion(
                          r.region,
                          1
                        )
                      }
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                    >
                      Ver región
                    </button>
                    <button
                      onClick={() =>
                        cargarResumenHistoricoRegion(r.region)
                      }
                      className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                    >
                      Histórico 7 días (agentes)
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 4 — VISTA REGIÓN
     ============================================================================ */
  if (vista === "region" && regionSeleccionada) {
    const totalZonaDesabasto = agentesRegion.reduce(
      (s, a) => s + (a.totalDesabasto || 0),
      0
    );
    const totalZonaAtendidos = agentesRegion.reduce(
      (s, a) => s + (a.totalAtendidos || 0),
      0
    );
    const totalZonaEfectivos = agentesRegion.reduce(
      (s, a) => s + (a.efectivos || 0),
      0
    );
    const porcentajeZona =
      totalZonaDesabasto > 0
        ? Math.round((totalZonaAtendidos / totalZonaDesabasto) * 100)
        : 0;
    const porcentajeZonaEfectividad =
      totalZonaAtendidos > 0
        ? Math.round((totalZonaEfectivos / totalZonaAtendidos) * 100)
        : 0;
    const barZona = getBarColor(porcentajeZona);
    const pctZona = getPctTextColor(porcentajeZona);
    const effZona = getEffTextColor(porcentajeZonaEfectividad);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl animate-fadeIn">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {obtenerColorBarra(porcentajeZona)} Supervisor —{" "}
              {regionSeleccionada.toUpperCase()}
            </h2>
            <p className="text-sm text-gray-500">
              📅 {formatFechaLargoCR(
                fechaFijadaCtx ?? isoNDiasAtras(offsetDiasCtx)
              )}
            </p>
          </div>
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={() => {
                setRegionSeleccionada(null);
                setAgentesRegion([]);
                setVista(
                  offsetDiasCtx === 1 ? "anterior" : "actual"
                );
              }}
              className="text-sm bg-gray-500 text-white py-1 px-4 rounded-lg hover:bg-gray-600"
            >
              ⬅ Regiones
            </button>
            <button
              onClick={() =>
                cargarRegion(regionSeleccionada, offsetDiasCtx)
              }
              className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              🔄 Actualizar
            </button>
          </div>
          <div className="text-center mb-4">
            <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
              <div
                className={`${barZona} h-4`}
                style={{ width: `${porcentajeZona}%` }}
              />
            </div>
            <p className="text-xs">
              Avance: {totalZonaAtendidos} de {totalZonaDesabasto} (
              <span className={`font-semibold ${pctZona}`}>
                {porcentajeZona}%
              </span>
              )
            </p>
            <p className="text-xs mb-2">
              Efectividad:{" "}
              <span className={`font-semibold ${effZona}`}>
                {porcentajeZonaEfectividad}%
              </span>{" "}
              — Efectivos {totalZonaEfectivos} de{" "}
              {totalZonaAtendidos}
            </p>
          </div>
          {agentesRegion.length === 0 ? (
            <div className="bg-white p-6 rounded-xl shadow-sm text-center text-gray-600">
              No hay agentes en esta región.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {agentesRegion.map((a) => {
                const barA = getBarColor(a.porcentajeAvance);
                return (
                  <div
                    key={a.id}
                    className="rounded-xl shadow-md p-4 border border-gray-200 bg-white"
                  >
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                      <span>{a.semaforo}</span> {a.nombre}
                    </h3>
                    <p className="text-xs text-gray-500 mb-1">
                      Ruta {a.ruta_norm} {/* <--- CAMBIO: Muestra ruta_norm */}
                    </p>
                    <div className="bg-gray-300 rounded-full h-3 overflow-hidden mb-2">
                      <div
                        className={`${barA} h-3 transition-all duration-500`}
                        style={{ width: `${a.porcentajeAvance}%` }}
                      />
                    </div>
                    <p className="text-xs">
                      Avance:{" "}
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            a.porcentajeAvance >= 100
                              ? "rgb(22, 163, 74)"
                              : a.porcentajeAvance >= 80
                              ? "rgb(234, 179, 8)"
                              : a.porcentajeAvance >= 50
                              ? "rgb(249, 115, 22)"
                              : "rgb(220, 38, 38)"
                        }}
                      >
                        {a.porcentajeAvance}%
                      </span>{" "}
                      — {a.totalAtendidos} de {a.totalDesabasto}
                    </p>
                    <p className="text-xs mb-2">
                      Efectividad:{" "}
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            a.porcentajeEfectividad >= 80
                              ? "rgb(22, 163, 74)"
                              : "rgb(220, 38, 38)"
                        }}
                      >
                        {a.porcentajeEfectividad}%
                      </span>{" "}
                      — Efectivos {a.efectivos} de{" "}
                      {a.totalAtendidos}
                    </p>
                    <button
                      onClick={() => cargarDetalleAgente(a)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg w-full"
                    >
                      Ver detalles
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 5 — DETALLE DE AGENTE
     ============================================================================ */
  if (
    vista === "agente" &&
    detallesAgente &&
    agenteSeleccionado &&
    regionSeleccionada
  ) {
    const {
      pendientes = [],
      atenciones = [],
      totalDesabasto,
      totalAtendidos,
      efectivos,
      noEfectivos,
      porcentajeAvance,
      porcentajeEfectividad,
      porcentajeNoEfectivos,
      motivosPorcentaje
    } = detallesAgente;

    const barA = getBarColor(porcentajeAvance);
    const pctA = getPctTextColor(porcentajeAvance);
    const effA = getEffTextColor(porcentajeEfectividad);

    const formatHora = (a) => {
      if (a.hora) return a.hora;
      try {
        return new Date(a.created_at).toLocaleTimeString(
          "es-CR",
          {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: TZ
          }
        );
      } catch {
        return "";
      }
    };

    // Formateador para números
    const formatNumber = (num) => {
      if (num === null || num === undefined || isNaN(num)) return "N/D";
      return parseFloat(num).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    };

    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center px-4 py-6 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl animate-fadeIn">
          <div className="text-center mb-3">
            <h2 className="text-lg font-semibold text-gray-800">
              📋 {regionSeleccionada.toUpperCase()} —{" "}
              {agenteSeleccionado.nombre}
            </h2>
            <p className="text-xs text-gray-500">
              📅 {formatFechaLargoCR(
                fechaFijadaCtx ?? isoNDiasAtras(offsetDiasCtx)
              )}
            </p>
          </div>
          <div className="flex justify-center gap-3 mb-4">
            <button
              onClick={() => {
                setDetallesAgente(null);
                setVista("region");
              }}
              className="text-sm bg-gray-500 text-white py-1 px-4 rounded-lg hover:bg-gray-600"
            >
              ⬅ Agentes
            </button>
            <button
              onClick={() =>
                cargarDetalleAgente(agenteSeleccionado)
              }
              className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
            >
              🔄 Actualizar
            </button>
          </div>
          {/* Barra de avance */}
          <div className="bg-gray-300 rounded-full h-4 overflow-hidden mb-2">
            <div
              className={`${barA} h-4 transition-all duration-500`}
              style={{ width: `${porcentajeAvance}%` }}
            />
          </div>
          <p className="text-sm text-center text-gray-700 mb-4">
            {totalAtendidos} de {totalDesabasto} PDV (
            <span className={`font-semibold ${pctA}`}>
              {porcentajeAvance}%
            </span>
            ) | Efectivos:{" "}
            <span className={`font-semibold ${effA}`}>
              {porcentajeEfectividad}%
            </span>
          </p>
          {/* Pendientes */}
          {pendientes.length === 0 ? (
            <p className="text-center text-gray-600 mt-2">
              Todos los PDV fueron atendidos ✅
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendientes.map((pdv, i) => (
                <div
                  key={i}
                  className="rounded-xl shadow-md p-4 border border-gray-200 bg-white"
                >
                  <h3 className="text-base font-bold text-gray-800">
                    {pdv.pdv}
                  </h3>
                  <p className="text-xs text-gray-500">
                    MDN: {pdv.mdn_usuario}
                  </p>
                  <p className="text-sm text-gray-700">
                    Saldo: ₡{formatNumber(pdv.saldo)}
                  </p>
                  <p className="text-sm text-gray-600">
                    Promedio semanal: ₡
                    {formatNumber(pdv.promedio_semanal)}
                  </p>
                  {/* Comentado porque fecha_ultima_compra no está en la vista */}
                  {/* <p className="text-xs text-gray-500">
                    Última compra:{" "}
                    {pdv.fecha_ultima_compra
                      ? new Date(
                          pdv.fecha_ultima_compra
                        ).toLocaleDateString("es-CR")
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
                      {a.resultado === "no efectivo" &&
                        a.motivo_no_efectivo && (
                          <p className="text-xs text-gray-600 italic">
                            Motivo: {a.motivo_no_efectivo}
                          </p>
                        )}
                    </div>
                    <span className="text-xs text-gray-600">
                      {a.hora || formatHora(a)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-300 mt-3 pt-2 text-center text-sm text-gray-700">
                <p>
                  🟢 Efectivos:{" "}
                  <span className={`font-semibold ${effA}`}>
                    {efectivos} ({porcentajeEfectividad}%)
                  </span>{" "}
                  — 🔴 No efectivos: {noEfectivos} (
                  {porcentajeNoEfectivos}%) — Avance:{" "}
                  <span className={`font-semibold ${pctA}`}>
                    {porcentajeAvance}%
                  </span>
                </p>
              </div>
            </div>
          )}
          {/* Motivos */}
          {motivosPorcentaje.length > 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-200 shadow p-4 mt-6">
              <h4 className="text-md font-semibold text-gray-800 mb-2 text-center">
                🧾 Razones No Compra (
                {offsetDiasCtx === 1 ? "Último día" : "Hoy"})
              </h4>
              <div className="flex flex-wrap justify-center gap-2">
                {motivosPorcentaje.map((m, i) => (
                  <span
                    key={i}
                    className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium"
                  >
                    {m.motivo}: {m.cantidad} ({m.porcentaje}%)
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 6 — HISTÓRICO GLOBAL (POR REGIÓN)
     ============================================================================ */
  if (vista === "historico") {
    const grupos = historico.reduce((acc, r) => {
      if (!acc[r.region]) acc[r.region] = [];
      acc[r.region].push(r);
      return acc;
    }, {});
    const regionesOrdenadas = Object.entries(grupos)
      .map(([region, registros]) => {
        const avgAvance =
          registros.reduce(
            (s, r) => s + (r.porcentajeAvance || 0),
            0
          ) / registros.length;
        const avgEfectivos =
          registros.reduce(
            (s, r) => s + (r.porcentajeEfectivos || 0),
            0
          ) / registros.length;
        return {
          region,
          registros,
          avgAvance: Math.round(avgAvance),
          avgEfectivos: Math.round(avgEfectivos)
        };
      })
      .sort((a, b) => b.avgAvance - a.avgAvance);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center p-4 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl">
          <div className="flex flex-col items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 text-center">
              📈 Resumen Histórico — Últimos 7 días
            </h2>
            {fechaRango.inicio && fechaRango.fin && (
              <p className="text-sm text-gray-600 mt-1 text-center">
                📆 {formatFechaLargoCR(fechaRango.inicio)} →{" "}
                {formatFechaLargoCR(fechaRango.fin)}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-3">
              <button
                onClick={() => setVista("menu")}
                className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
              >
                ⬅ Menú
              </button>
            </div>
          </div>
          {loading ? (
            <p className="text-center text-gray-500 mt-4">
              Cargando...
            </p>
          ) : regionesOrdenadas.length === 0 ? (
            <p className="text-center text-gray-500 mt-4">
              No hay datos históricos.
            </p>
          ) : (
            regionesOrdenadas.map((rg, idx) => (
              <div
                key={rg.region}
                className="mb-6 border-t border-gray-300 pt-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-bold text-gray-800">
                    {idx + 1}. 🗺️ Región {rg.region}
                  </h3>
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-gray-600">
                      Promedio Avance:{" "}
                      <span
                        className={`font-semibold ${getPctTextColor(
                          rg.avgAvance
                        )}`}
                      >
                        {rg.avgAvance}%
                      </span>{" "}
                      | Efectivos:{" "}
                      <span
                        className={`font-semibold ${getEffTextColor(
                          rg.avgEfectivos
                        )}`}
                      >
                        {rg.avgEfectivos}%
                      </span>
                    </p>
                    <button
                      onClick={() =>
                        cargarResumenHistoricoRegion(rg.region)
                      }
                      className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg"
                    >
                      📊 Por agentes
                    </button>
                  </div>
                </div>
                <div className="relative overflow-x-auto border rounded-lg shadow-sm">
                  <table className="min-w-[600px] w-full text-sm border-collapse">
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
                      {rg.registros.map((r, i) => (
                        <tr
                          key={i}
                          className="border-b hover:bg-gray-50 transition-colors"
                        >
                          <td className="p-2">
                            📅 {formatFechaLargoCR(r.fecha)}
                          </td>
                          <td className="p-2 text-center">
                            {r.desabasto}
                          </td>
                          <td className="p-2 text-center">
                            {r.atendidos}
                          </td>
                          <td
                            className={`p-2 text-center font-semibold ${getPctTextColor(
                              r.porcentajeAvance
                            )}`}
                          >
                            {r.porcentajeAvance}%
                          </td>
                          <td
                            className={`p-2 text-center font-semibold ${getEffTextColor(
                              r.porcentajeEfectivos
                            )}`}
                          >
                            {r.porcentajeEfectivos}%
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 text-center">Promedio</td>
                        <td className="p-2 text-center">—</td>
                        <td className="p-2 text-center">—</td>
                        <td
                          className={`p-2 text-center ${getPctTextColor(
                            rg.avgAvance
                          )}`}
                        >
                          {rg.avgAvance}%
                        </td>
                        <td
                          className={`p-2 text-center ${getEffTextColor(
                            rg.avgEfectivos
                          )}`}
                        >
                          {rg.avgEfectivos}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 7 — HISTÓRICO POR AGENTES EN UNA REGIÓN
     ============================================================================ */
  if (vista === "historicoRegionAgentes" && regionSeleccionada) {
    const grupos = historicoRegionAgentes.reduce((acc, r) => {
      if (!acc[r.agente]) acc[r.agente] = [];
      acc[r.agente].push(r);
      return acc;
    }, {});
    const agentesOrdenados = Object.entries(grupos)
      .map(([agente, registros]) => {
        const totalDesabasto = registros.reduce(
          (s, r) => s + (r.desabasto || 0),
          0
        );
        const totalAtendidos = registros.reduce(
          (s, r) => s + (r.atendidos || 0),
          0
        );
        const totalEfectivos = registros.reduce(
          (s, r) => s + (r.efectivos || 0),
          0
        );
        const avgAvance =
          registros.reduce(
            (s, r) => s + (r.porcentajeAvance || 0),
            0
          ) / registros.length;
        const avgEfectivos =
          registros.reduce(
            (s, r) => s + (r.porcentajeEfectivos || 0),
            0
          ) / registros.length;
        const avgNoEfectivos = 100 - avgEfectivos;
        return {
          agente,
          registros,
          avgAvance: Math.round(avgAvance),
          avgEfectivos: Math.round(avgEfectivos),
          avgNoEfectivos: Math.round(avgNoEfectivos),
          totalDesabasto,
          totalAtendidos,
          totalEfectivos,
          totalNoEfectivos: totalAtendidos - totalEfectivos
        };
      })
      .sort((a, b) => b.avgEfectivos - a.avgEfectivos);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center p-4 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-5xl">
          <div className="flex flex-col items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800 text-center">
              📈 Resumen Histórico — Región {regionSeleccionada} —
              Últimos 7 días
            </h2>
            {fechaRangoRegion.inicio &&
              fechaRangoRegion.fin && (
                <p className="text-sm text-gray-600 mt-1 text-center">
                  📆 {formatFechaLargoCR(
                    fechaRangoRegion.inicio
                  )}{" "}
                  →{" "}
                  {formatFechaLargoCR(fechaRangoRegion.fin)}
                </p>
              )}
            <div className="flex justify-center gap-3 mt-3">
              <button
                onClick={() => setVista("historico")}
                className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
              >
                ⬅ Volver
              </button>
            </div>
          </div>
          {loading ? (
            <p className="text-center text-gray-500 mt-4">
              Cargando...
            </p>
          ) : agentesOrdenados.length === 0 ? (
            <p className="text-center text-gray-500 mt-4">
              No hay datos para esta región.
            </p>
          ) : (
            agentesOrdenados.map((ag, idx) => (
              <div
                key={ag.agente}
                className="mb-6 border-t border-gray-300 pt-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-bold text-gray-800">
                    {idx + 1}. 👤 {ag.agente}
                  </h3>
                  <p className="text-sm text-gray-600">
                    🟢 Efectivos{" "}
                    <span
                      className={`font-semibold ${getEffTextColor(
                        ag.avgEfectivos
                      )}`}
                    >
                      {ag.avgEfectivos}%
                    </span>{" "}
                    | 🔴 No efectivos{" "}
                    <span className="font-semibold text-red-600">
                      {ag.avgNoEfectivos}%
                    </span>
                  </p>
                </div>
                <div className="relative overflow-x-auto border rounded-lg shadow-sm">
                  <table className="min-w-[760px] w-full text-sm border-collapse">
                    <thead className="bg-gray-200 text-gray-800">
                      <tr>
                        <th className="p-2 text-left">Fecha</th>
                        <th className="p-2 text-center">Desabasto</th>
                        <th className="p-2 text-center">Atendidos</th>
                        <th className="p-2 text-center">No efectivos</th>
                        <th className="p-2 text-center">% Avance</th>
                        <th className="p-2 text-center">% Efectivos</th>
                        <th className="p-2 text-center">% No efectivos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ag.registros.map((r, i) => {
                        const noEf =
                          (r.atendidos || 0) -
                          (r.efectivos || 0);
                        const pctNoEf =
                          100 - (r.porcentajeEfectivos || 0);
                        return (
                          <tr
                            key={i}
                            className="border-b hover:bg-gray-50 transition-colors"
                          >
                            <td className="p-2">
                              📅 {formatFechaLargoCR(r.fecha)}
                            </td>
                            <td className="p-2 text-center">
                              {r.desabasto}
                            </td>
                            <td className="p-2 text-center">
                              {r.atendidos}
                            </td>
                            <td className="p-2 text-center text-red-600 font-semibold">
                              {noEf}
                            </td>
                            <td
                              className={`p-2 text-center font-semibold ${getPctTextColor(
                                r.porcentajeAvance
                              )}`}
                            >
                              {r.porcentajeAvance}%
                            </td>
                            <td
                              className={`p-2 text-center font-semibold ${getEffTextColor(
                                r.porcentajeEfectivos
                              )}`}
                            >
                              {r.porcentajeEfectivos}%
                            </td>
                            <td className="p-2 text-center text-red-600 font-semibold">
                              {pctNoEf}%
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-gray-100 font-semibold">
                        <td className="p-2 text-center">
                          Totales
                        </td>
                        <td className="p-2 text-center text-gray-800">
                          {ag.totalDesabasto}
                        </td>
                        <td className="p-2 text-center text-gray-800">
                          {ag.totalAtendidos}
                        </td>
                        <td className="p-2 text-center text-red-600">
                          {ag.totalNoEfectivos}
                        </td>
                        <td className="p-2 text-center text-gray-800">
                          —
                        </td>
                        <td
                          className={`p-2 text-center ${getEffTextColor(
                            ag.avgEfectivos
                          )}`}
                        >
                          {ag.avgEfectivos}%
                        </td>
                        <td className="p-2 text-center text-red-600">
                          {ag.avgNoEfectivos}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 8 — RESUMEN DE MOTIVOS (7 DÍAS)
     ============================================================================ */
  if (vista === "resumenMotivos") {
    const totalEfectivosPais = resumenMotivos.reduce(
      (s, r) => s + (r.efectivos || 0),
      0
    );
    const totalNoEfectivosPais = resumenMotivos.reduce(
      (s, r) => s + (r.noefectivos || 0),
      0
    );
    const totalAtendidosPais =
      totalEfectivosPais + totalNoEfectivosPais;
    const pctEfectivosPais =
      totalAtendidosPais > 0
        ? Math.round(
            (totalEfectivosPais / totalAtendidosPais) * 100
          )
        : 0;
    const pctNoEfectivosPais =
      100 - pctEfectivosPais;
    const motivosPaisCounts = {};
    resumenMotivos.forEach((r) => {
      (r.motivosPorcentaje || []).forEach((m) => {
        motivosPaisCounts[m.motivo] =
          (motivosPaisCounts[m.motivo] || 0) + (m.count || 0);
      });
    });
    const totalMotivosPais = Object.values(
      motivosPaisCounts
    ).reduce((s, v) => s + v, 0);
    const motivosPaisArray = Object.entries(
      motivosPaisCounts
    )
      .map(([motivo, count]) => ({
        motivo,
        count,
        porcentaje: totalMotivosPais
          ? ((count / totalMotivosPais) * 100).toFixed(2)
          : "0.00"
      }))
      .sort((a, b) => b.count - a.count);
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center p-4 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-6xl">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800">
              📊 Resumen Razones No Compra — Últimos 7 días
            </h2>
            {fechaRango.inicio && fechaRango.fin && (
              <p className="text-sm text-gray-600">
                📅 {formatFechaLargoCR(fechaRango.inicio)} →
                {formatFechaLargoCR(fechaRango.fin)}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-3">
              <button
                onClick={() => setVista("menu")}
                className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
              >
                ⬅ Menú
              </button>
            </div>
          </div>
          {/* Resumen país */}
          <div className="bg-white rounded-2xl shadow-md border border-gray-200 p-4 mb-6">
            <h3 className="text-md font-semibold text-gray-800 mb-1 text-center">
              🇨🇷 Total País
            </h3>
            <p className="text-sm text-gray-700 text-center">
              Atendidos {totalAtendidosPais.toLocaleString()} —
              🟢 Efectivos{" "}
              <span
                className={`font-semibold ${getEffTextColor(
                  pctEfectivosPais
                )}`}
              >
                {totalEfectivosPais.toLocaleString()} (
                {pctEfectivosPais}%)
              </span>{" "}
              — 🔴 No efectivos{" "}
              {totalNoEfectivosPais.toLocaleString()} (
              {pctNoEfectivosPais}%)
            </p>
            {motivosPaisArray.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2 mt-3">
                {motivosPaisArray.map((m, i) => (
                  <span
                    key={i}
                    className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium shadow-sm"
                  >
                    {m.motivo}:{" "}
                    {m.count.toLocaleString()} ({m.porcentaje}%)
                  </span>
                ))}
              </div>
            )}
          </div>
          {/* Tabla regiones */}
          {resumenMotivos.length === 0 ? (
            <p className="text-center text-gray-500">
              No hay datos disponibles.
            </p>
          ) : (
            <>
              <div className="relative overflow-x-auto border rounded-lg shadow-sm">
                <table className="min-w=[800px] w-full text-sm border-collapse">
                  <thead className="bg-gray-200 text-gray-800">
                    <tr>
                      <th className="p-2 text-left">Región</th>
                      <th className="p-2 text-center">Desabasto</th>
                      <th className="p-2 text-center">Atendidos</th>
                      <th className="p-2 text-center">Efectivos</th>
                      <th className="p-2 text-center">No efectivos</th>
                      <th className="p-2 text-center">% Efectivos</th>
                      <th className="p-2 text-center">% No efectivos</th>
                      <th className="p-2 text-center">Ver agentes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumenMotivos.map((r, i) => (
                      <tr
                        key={i}
                        className="border-b hover:bg-gray-50"
                      >
                        <td className="p-2 font-semibold text-gray-800">
                          {r.region}
                        </td>
                        <td className="p-2 text-center">
                          {r.desabasto}
                        </td>
                        <td className="p-2 text-center">
                          {r.atendidos}
                        </td>
                        <td className="p-2 text-center text-green-600 font-semibold">
                          {r.efectivos}
                        </td>
                        <td className="p-2 text-center text-red-600 font-semibold">
                          {r.noefectivos}
                        </td>
                        <td
                          className={`p-2 text-center font-semibold ${getEffTextColor(
                            r.porcentajeEfectivos
                          )}`}
                        >
                          {r.porcentajeEfectivos}%
                        </td>
                        <td className="p-2 text-center text-red-700 font-semibold">
                          {r.porcentajeNoEfectivos}%
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() =>
                              cargarResumenMotivosRegion(
                                r.region
                              )
                            }
                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg"
                          >
                            Detalle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* BLOQUES MOTIVOS POR REGIÓN */}
              {resumenMotivos.map((r, idx) =>
                (r.motivosPorcentaje || []).length > 0 ? (
                  <div
                    key={idx}
                    className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-6xl mx-auto mt-6 animate-fadeIn"
                  >
                    <div className="text-center mb-2">
                      <h4 className="text-lg font-semibold text-gray-800">
                        🧾 Razones No Compra — {r.region}
                      </h4>
                      {fechaRango.inicio && fechaRango.fin && (
                        <p className="text-sm text-gray-600">
                          📅{" "}
                          {formatFechaLargoCR(
                            fechaRango.inicio
                          )}{" "}
                          →{" "}
                          {formatFechaLargoCR(fechaRango.fin)}
                        </p>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 text-center mb-3">
                      Atendidos {r.atendidos} — 🟢 Efectivos{" "}
                      <span
                        className={`font-semibold ${getEffTextColor(
                          r.porcentajeEfectivos
                        )}`}
                      >
                        {r.efectivos} ({r.porcentajeEfectivos}
                        %)
                      </span>{" "}
                      — 🔴 No efectivos {r.noefectivos} (
                      {r.porcentajeNoEfectivos}
                      %)
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {r.motivosPorcentaje.map((m, i) => (
                        <span
                          key={i}
                          className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium"
                        >
                          {m.motivo}: {m.count ?? 0} menciones (
                          {m.porcentaje}
                          %)
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null
              )}
            </>
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     RENDER 9 — RESUMEN MOTIVOS POR REGIÓN (DETALLE POR AGENTE)
     ============================================================================ */
  if (vista === "resumenMotivosRegion" && regionSeleccionada) {
    return (
      <div className="min-h-screen sm:min-h-[90vh] bg-gray-100 flex items-start sm:items-center justify-center p-4 sm:py-10 overflow-hidden">
        <div className="bg-white shadow-lg rounded-3xl p-6 w-full max-w-6xl">
          <div className="text-center mb-4">
            <h2 className="text-xl font-semibold text-gray-800 mb-1">
              📊 Razones No Compra — Región{" "}
              {regionSeleccionada}
            </h2>
            {fechaRango.inicio && fechaRango.fin && (
              <p className="text-sm text-gray-600 text-center">
                📅 {formatFechaLargoCR(fechaRango.inicio)} →
                {formatFechaLargoCR(fechaRango.fin)}
              </p>
            )}
            <div className="flex justify-center gap-3 mt-3">
              <button
                onClick={() => setVista("resumenMotivos")}
                className="text-sm bg-blue-600 text-white py-1 px-4 rounded-lg hover:bg-blue-700"
              >
                ⬅ Regiones
              </button>
            </div>
          </div>
          {resumenMotivosRegion.length === 0 ? (
            <p className="text-center text-gray-500">
              No hay datos para esta región.
            </p>
          ) : (
            resumenMotivosRegion.map((a, idx) => (
              <div
                key={idx}
                className="mb-8 border-t border-gray-300 pt-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-md font-bold text-gray-800">
                    {idx + 1}. 👤 {a.agente}
                  </h3>
                  <p className="text-sm text-gray-600">
                    🟢 Efectivos{" "}
                    <span
                      className={`font-semibold ${getEffTextColor(
                        a.porcentajeEfectivos
                      )}`}
                    >
                      {a.porcentajeEfectivos}%
                    </span>{" "}
                    | 🔴 No efectivos{" "}
                    <span className="font-semibold text-red-600">
                      {a.porcentajeNoEfectivos}%
                    </span>
                  </p>
                </div>
                <div className="relative overflow-x-auto border rounded-lg shadow-sm mb-3">
                  <table className="min-w-[600px] w-full text-sm border-collapse">
                    <thead className="bg-gray-200 text-gray-800 sticky top-0 z-10">
                      <tr>
                        <th className="p-2 text-left">Desabasto</th>
                        <th className="p-2 text-center">Atendidos</th>
                        <th className="p-2 text-center">Efectivos</th>
                        <th className="p-2 text-center">
                          No Efectivos
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b hover:bg-gray-50">
                        <td className="p-2 text-center font-semibold text-gray-800">
                          {a.desabasto}
                        </td>
                        <td className="p-2 text-center text-gray-700">
                          {a.atendidos}
                        </td>
                        <td className="p-2 text-center text-green-600 font-semibold">
                          {a.efectivos}
                        </td>
                        <td className="p-2 text-center text-red-600 font-semibold">
                          {a.noefectivos}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {a.motivosPorcentaje.length > 0 && (
                  <div className="bg-gray-50 rounded-xl border border-gray-200 shadow p-4">
                    <h4 className="text-md font-semibold text-gray-800 mb-2 text-center">
                      🧾 Motivos de No Compra
                    </h4>
                    <div className="flex flex-wrap justify-center gap-2">
                      {a.motivosPorcentaje.map((m, i) => (
                        <span
                          key={i}
                          className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium"
                        >
                          {m.motivo}: {m.count ?? 0} (
                          {m.porcentaje}%)
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }
  /* ============================================================================
     FALLBACK FINAL
   ============================================================================ */
  if (loading) {
    return (
      <p className="text-center text-gray-500 mt-6">
        Cargando información...
      </p>
    );
  }
  return null;
}  // <—— ESTA ES LA LLAVE FINAL DEL COMPONENTE