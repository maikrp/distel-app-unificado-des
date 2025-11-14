/* eslint-disable no-unused-vars */
/* =============================================================================
   VisitForm.jsx — versión 1.3.6 funcional Distel-app-unificado
   - Base respetada: 1.2.6 funcional completa (sin eliminar nada innecesario)
   - Cambios v1.2.8:
     • Corrige sombra de variable: se usa `usuarioLocal` en lugar de redefinir `usuario`.
     • Carga prioritaria de usuario:
         props.usuario  > localStorage("usuario") > consulta a `agentes` por teléfono
       y se consolida en `usuarioDatos`.
     • `geo_aprobado_por` con formato:
         "<acceso>: <nombre> (<telefono>)"
       Ej.: "supervisor: Juan Pérez (88889999)"
     • Sin cambios en:
         duplicados por TAE, modales, UI, back al Módulo de Visitas, cálculo Haversine,
         guardado en dos fases sin tocar lat/lng si NO se aprueba geo.
   ============================================================================ */

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  AlertCircle,
  Save,
  RefreshCw,
  Map,
  Info,
  User,
  Phone,
  Route,
} from "lucide-react";
import { supabase } from "../../supabaseClient";

// ============================================================================
// Componente principal
// ============================================================================
export default function VisitForm({ usuario, setVista }) {
  // ============================
  // Estados de formulario
  // ============================
  const [mdnCode, setMdnCode] = useState("");
  const [pdvName, setPdvName] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contactoWs, setContactoWs] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [route, setRoute] = useState("");
  const [geo, setGeo] = useState(""); // "lat,lng" desde clientes
  const [latitude, setLatitude] = useState(null); // GPS actual
  const [longitude, setLongitude] = useState(null); // GPS actual


  // Dirección desde clientes
  const [provincia, setProvincia] = useState("");
  const [canton, setCanton] = useState("");
  const [distrito, setDistrito] = useState("");
  const [direccion, setDireccion] = useState("");

  // Estados de proceso
  const [loading, setLoading] = useState(false);
  const [found, setFound] = useState(false);
  const [success, setSuccess] = useState(false);

  // Confirmación de cambios
  const [modalChanges, setModalChanges] = useState(false);
  const [changesList, setChangesList] = useState([]);
  const [originalData, setOriginalData] = useState({});

  // Modal por diferencia geográfica
  const [modalGeoDiff, setModalGeoDiff] = useState(false);
  const [geoDistance, setGeoDistance] = useState(0);

  // Bandera de autorización explícita de cambio de geo
  const [geoConfirmada, setGeoConfirmada] = useState(false);

  // GPS
  const [accuracy, setAccuracy] = useState(null);
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(true);

  // Manejo de duplicados por TAE
  const [dupList, setDupList] = useState([]);
  const [showDupModal, setShowDupModal] = useState(false);

  // NUEVO: id_cliente seleccionado cuando hay duplicados
  const [selectedIdCliente, setSelectedIdCliente] = useState(null);

  // ============================================
  // Sincronizar usuario desde parámetros de URL (v1.2.9)
  // ============================================
  useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    try {
      const datos = JSON.parse(atob(token));
      localStorage.setItem("usuario", JSON.stringify(datos));
      params.delete("token");
      window.history.replaceState(null, "", window.location.pathname);
    } catch (e) {
      console.warn("Token inválido:", e);
    }
  }
}, []);

  // ========= v1.2.9 FIX: carga garantizada del usuario logueado =========
  const [usuarioDatos, setUsuarioDatos] = useState(() => {
    try {
      const u = localStorage.getItem("usuario");
      return u ? JSON.parse(u) : {};
    } catch {
      return {};
    }
  });

  // Si el prop trae más datos, los combina una sola vez
  useEffect(() => {
    if (usuario && typeof usuario === "object") {
      setUsuarioDatos((prev) => ({ ...prev, ...usuario }));
    }
  }, [usuario]);

  // Refuerzo: si al montar no tiene nombre ni teléfono, reintenta del localStorage
  useEffect(() => {
    if (!usuarioDatos?.telefono || !usuarioDatos?.nombre) {
      const userStored = localStorage.getItem("usuario");
      if (userStored) {
        try {
          const parsed = JSON.parse(userStored);
          if (parsed?.telefono) setUsuarioDatos(parsed);
        } catch (e) {
          console.error("Error cargando usuario desde localStorage:", e);
        }
      }
    }
  }, []);


  // ============================
  // Captura de ubicación por GPS
  // ============================
  useEffect(() => {
    let intervalId;
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no soporta GPS.");
      setIsGettingLocation(false);
      return;
    }
    const obtenerPosicion = () => {
      setIsGettingLocation(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLatitude(pos.coords.latitude);
          setLongitude(pos.coords.longitude);
          setAccuracy(pos.coords.accuracy);
          setIsGettingLocation(false);
          setLocationError("");
        },
        (err) => {
          console.error("Error GPS:", err);
          setLocationError("⚠️ Activa el GPS y permite el acceso a la ubicación.");
          setIsGettingLocation(false);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    };
    obtenerPosicion();
    intervalId = setInterval(() => {
      if (!latitude || !longitude) obtenerPosicion();
    }, 10000);
    return () => clearInterval(intervalId);
  }, [latitude, longitude]);

  // ============================
  // Utilidad: cargar cliente en el formulario
  // ============================
  const cargarClienteEnFormulario = (data) => {
    setOriginalData(data);
    setSelectedIdCliente(data.id_cliente ?? null);
    setPdvName(data.pdv || "");
    setContacto(data.contacto || "");
    setTelefono(data.telefono || "");
    setContactoWs(data.contacto_ws || "");
    setWhatsapp(data.whatsapp || "");
    setRoute(data.nombre_ruta ?? data.ruta ?? data.ruta_excel ?? "");
    setGeo(data.geo || ""); // string "lat,lng"
    setProvincia(data.provincia || "");
    setCanton(data.canton || "");
    setDistrito(data.distrito || "");
    setDireccion(data.direccion || "");
    setFound(true);
  };

  // ============================
  // Buscar cliente por TAE, manejando duplicados
  // ============================
  const handleSearch = async () => {
    if (!mdnCode) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("clientes")
      .select("*")
      .eq("tae", mdnCode.trim());

    if (error) {
      setFound(false);
      setLoading(false);
      alert("Error al buscar el cliente");
      return;
    }

    if (!data || data.length === 0) {
      setFound(false);
      setLoading(false);
      alert("Cliente no encontrado");
      return;
    }

    if (data.length === 1) {
      // una coincidencia
      cargarClienteEnFormulario(data[0]);
      setShowDupModal(false);
      setDupList([]);
      setLoading(false);
      return;
    }

    // múltiples coincidencias
    setDupList(data);
    setShowDupModal(true);
    setFound(false);
    setLoading(false);
  };

  // ============================
  // Haversine en metros
  // ============================
  const calcularDistanciaMetros = (lat1, lon1, lat2, lon2) => {
    const n = (x) => Number(x);
    if (
      lat1 === null ||
      lon1 === null ||
      lat2 === null ||
      lon2 === null ||
      Number.isNaN(n(lat1)) ||
      Number.isNaN(n(lon1)) ||
      Number.isNaN(n(lat2)) ||
      Number.isNaN(n(lon2))
    )
      return 0;

    const R = 6371e3;
    const φ1 = (n(lat1) * Math.PI) / 180;
    const φ2 = (n(lat2) * Math.PI) / 180;
    const Δφ = ((n(lat2) - n(lat1)) * Math.PI) / 180;
    const Δλ = ((n(lon2) - n(lon1)) * Math.PI) / 180;
    const a =
      Math.sin(Δφ / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ============================
  // Preparar cambios antes de guardar
  // ============================
  const compararCampo = (orig, campoOrig, nuevo, difArr) => {
    const anterior = (orig[campoOrig] || "").toString().trim();
    const actual = (nuevo || "").toString().trim();
    if (anterior !== actual) difArr.push({ campo: campoOrig, anterior, actual });
  };
// << Parte 1/4 FIN >>
  const calcularCambios = () => {
    const dif = [];
    const orig = originalData;

    compararCampo(orig, "pdv", pdvName, dif);
    compararCampo(orig, "contacto", contacto, dif);
    compararCampo(orig, "telefono", telefono, dif);
    compararCampo(orig, "contacto_ws", contactoWs, dif);
    compararCampo(orig, "whatsapp", whatsapp, dif);

    const origRuta =
      originalData.nombre_ruta ??
      originalData.ruta ??
      originalData.ruta_excel ??
      "";
    if ((origRuta || "") !== (route || "")) {
      dif.push({
        campo: "nombre_ruta",
        anterior: origRuta || "",
        actual: route || "",
      });
    }

    compararCampo(orig, "provincia", provincia, dif);
    compararCampo(orig, "canton", canton, dif);
    compararCampo(orig, "distrito", distrito, dif);
    compararCampo(orig, "direccion", direccion, dif);

    // Si hay geo previa, medir distancia. Si no hay, ofrecer registrar la actual.
    if (latitude && longitude) {
      if (geo) {
        const [geoLat, geoLng] = geo.split(",").map((v) => parseFloat(v.trim()));
        const distancia = calcularDistanciaMetros(
          geoLat,
          geoLng,
          latitude,
          longitude
        );
        setGeoDistance(distancia);
        if (distancia > 10) {
          setChangesList(dif);
          setModalGeoDiff(true); // pedir autorización para cambiar
          return;
        }
      } else {
        // No existe geo previa: ofrecer registrar la actual
        setChangesList(dif);
        setGeoDistance(0);
        setModalGeoDiff(true);
        return;
      }
    }

    if (dif.length === 0) {
      alert("No hay cambios para guardar.");
      return;
    }

    setChangesList(dif);
    setModalChanges(true);
  };

  // ============================
  // Confirmar / cancelar cambio de geo
  // ============================
  const confirmarCambioGeo = () => {
    setGeoConfirmada(true);
    setModalGeoDiff(false);
    const dif = [...changesList];
    dif.push({
      campo: "geo",
      anterior: geo || "sin registro",
      actual:
        latitude !== null && longitude !== null
          ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          : "sin lectura",
    });
    setChangesList(dif);
    setModalChanges(true);
  };

  const cancelarCambioGeo = () => {
    setGeoConfirmada(false);
    setModalGeoDiff(false);
    if (changesList.length > 0) {
      setModalChanges(true);
    } else {
      alert("No hay cambios para guardar.");
    }
  };

    // ============================
    // Helpers
    // ============================
    const mantener = (nuevo, original) => {
      if (nuevo === undefined || nuevo === null) return original ?? null;
      if (typeof nuevo === "string" && nuevo.trim() === "") return original ?? null;
      return nuevo?.trim ? nuevo.trim() : nuevo;
    };

    const geoClientesToObject = () => {
      if (!geo) return null;
      const parts = geo.split(",");
      if (parts.length !== 2) return null;

      const glat = parseFloat(parts[0].trim());
      const glng = parseFloat(parts[1].trim());

      // ⚠️ Validación reforzada: evita coordenadas vacías, 0,0 o fuera de rango
      if (
        Number.isNaN(glat) ||
        Number.isNaN(glng) ||
        glat === 0 ||
        glng === 0 ||
        Math.abs(glat) > 90 ||
        Math.abs(glng) > 180
      ) {
        return null;
      }

      return { lat: glat, lng: glng };
    };

  // ============================
  // Validación de sesión y teléfono del agente original
  // ============================
  const guardarCambiosConfirmados = async () => {
  // ============================
  // Validación de sesión y teléfono del agente
  // ============================
  if (!usuarioDatos?.telefono || !/^[0-9]{8}$/.test(usuarioDatos.telefono)) {
    alert(
      "⚠️ Error: no se detecta un número de teléfono válido en la sesión.\nVuelve a iniciar sesión antes de continuar."
    );
    return;
  }

  setModalChanges(false);

  if (!mdnCode || !route) {
    alert("Debe haber un código y una ruta antes de guardar.");
    return;
  }
    
    // ✅ Fecha UTC correcta — Supabase convertirá a local en las vistas
    const fechaUTC = new Date().toISOString().slice(0, 19).replace("T", " ");


    const payloadBase = {
      // ✅ ahora toma el número del agente logueado desde usuarioDatos
      agente_id: usuarioDatos.telefono,
      pdv_id: String(mdnCode).trim(), // si quieres dejarlo texto
      id_cliente: Number(selectedIdCliente ?? originalData.id_cliente ?? 0),

      nombre_pdv: mantener(pdvName, originalData.pdv),
      contacto: mantener(contacto, originalData.contacto),
      telefono: mantener(telefono, originalData.telefono),
      contacto_ws: mantener(contactoWs, originalData.contacto_ws),
      whatsapp: mantener(whatsapp, originalData.whatsapp),
      ruta: mantener(
        route,
        originalData.nombre_ruta || originalData.ruta || originalData.ruta_excel
      ),
      provincia: mantener(provincia, originalData.provincia),
      canton: mantener(canton, originalData.canton),
      distrito: mantener(distrito, originalData.distrito),
      direccion: mantener(direccion, originalData.direccion),
      accuracy: accuracy ?? null,
      created_at: fechaUTC, // ← guardado en UTC real
    };

    // 2) Payload GEO solo si se autoriza
    const payloadGeo =
      geoConfirmada && latitude && longitude
        ? {
            lat: latitude,
            lng: longitude,
            confirma_geo: true,
            // ========= NUEVO v1.2.8: formato correcto usando usuarioDatos =========
            geo_aprobado_por: `${usuarioDatos?.acceso || "sin_acceso"}: ${
              usuarioDatos?.nombre || "sin_nombre"
            } (${usuarioDatos?.telefono || "sin_tel"})`,
          }
        : null;

    // 3) Chequear existencia del registro en visitas_pdv
    const { data: existente, error: errorSelect } = await supabase
      .from("visitas_pdv")
      .select("pdv_id")
      .eq("pdv_id", payloadBase.pdv_id)
      .eq("agente_id", payloadBase.agente_id)
      .maybeSingle();

    if (errorSelect && errorSelect.code !== "PGRST116") {
      console.error("Error al verificar existencia:", errorSelect.message);
      alert("Error al verificar el registro existente.");
      return;
    }

    let errorFinal = null;

    if (existente) {
      // --- UPDATE: primero no-geo
      const { error: errA } = await supabase
        .from("visitas_pdv")
        .update(payloadBase)
        .eq("pdv_id", payloadBase.pdv_id)
        .eq("agente_id", payloadBase.agente_id);

      if (errA) {
        errorFinal = errA;
      } else if (payloadGeo) {
        // Solo si se autorizó, se actualizan lat/lng y geo_aprobado_por
        const { error: errB } = await supabase
          .from("visitas_pdv")
          .update(payloadGeo)
          .eq("pdv_id", payloadBase.pdv_id)
          .eq("agente_id", payloadBase.agente_id);
        if (errB) errorFinal = errB;
      }
    } else {
      // --- INSERT:
      let insertPayload = { ...payloadBase };

      if (payloadGeo) {
        // Insert con aprobación: incluye confirma_geo y geo_aprobado_por
        insertPayload = { ...insertPayload, ...payloadGeo };
      } else {
        // Insert sin aprobación: solo copiar geo existente de clientes
        const geoCli = geoClientesToObject();
        if (geoCli) {
          insertPayload = {
            ...insertPayload,
            lat: geoCli.lat,
            lng: geoCli.lng,
            confirma_geo: false, // No se aprueba ni se firma
          };
        }
      }

      const { error: errIns } = await supabase
        .from("visitas_pdv")
        .insert([insertPayload]);

      if (errIns) errorFinal = errIns;
    }

    if (errorFinal) {
      console.error("Error al guardar:", errorFinal.message);
      alert(`Error al guardar la visita:\n${errorFinal.message}`);
      return;
    }

    alert("✅ Datos del PDV guardados correctamente.");
    setSuccess(true);
    setTimeout(() => setSuccess(false), 1500);
    setGeoConfirmada(false); // limpiar bandera
    limpiarFormulario();
  };

  // ============================
  // Abrir mapa
  // ============================
  const handleOpenMaps = () => {
    if (geo) {
      const [lat, lng] = geo.split(",").map((t) => t.trim());
      window.open(`https://www.google.com/maps?q=${lat},${lng}`, "_blank");
    } else if (latitude && longitude) {
      window.open(
        `https://www.google.com/maps?q=${latitude},${longitude}`,
        "_blank"
      );
    } else {
      alert("No hay coordenadas registradas.");
    }
  };

  // ============================
  // Limpiar formulario
  // ============================
  const limpiarFormulario = () => {
    setMdnCode("");
    setPdvName("");
    setContacto("");
    setTelefono("");
    setContactoWs("");
    setWhatsapp("");
    setRoute("");
    setGeo("");
    setLatitude(null);
    setLongitude(null);
    setProvincia("");
    setCanton("");
    setDistrito("");
    setDireccion("");
    setFound(false);
    setOriginalData({});
    setChangesList([]);
    setModalChanges(false);
    setModalGeoDiff(false);
    setGeoDistance(0);
    setDupList([]);
    setShowDupModal(false);
    setSelectedIdCliente(null);
  };

  // ============================
  // UI: éxito
  // ============================
  if (success)
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 w-[360px] text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            ¡Visita guardada!
          </h2>
        </div>
      </div>
    );
  
  // ============================
  // UI principal
  // ============================
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-8">
      <motion.div
        className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 w-[380px] text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Encabezado de marcas */}
        <div className="flex items-center justify-center space-x-6 mb-6">
          <img src="/liberty.png" alt="Liberty" className="w-20 h-20" />
          <img src="/logo_distel.png" alt="Distel" className="w-20 h-20" />
        </div>

        <h1 className="text-xl font-bold text-gray-800 mb-6">
          Actualización de Datos del PDV
        </h1>

        {/* Código del PDV */}
        <div className="mb-4 text-left">
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Código del PDV (TAE)
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={mdnCode}
            onChange={(e) => setMdnCode(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50"
          />
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSearch}
            disabled={loading}
            className="w-full mt-2 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700"
          >
            {loading ? "Buscando..." : "Buscar Cliente"}
          </motion.button>

          {/* Botón para regresar al menú principal */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setVista("menuPrincipal")}
            className="w-full mt-3 py-2 rounded-xl bg-gray-500 hover:bg-gray-600 text-white font-semibold"
          >
            ← Volver al Módulo de Visitas
          </motion.button>
        </div>

        {found && (
          <form className="space-y-4 text-left">
            {/* Campos existentes */}
            <Input label="Nombre del PDV" value={pdvName} setValue={setPdvName} />
            <Input label="Nombre del Contacto" value={contacto} setValue={setContacto} />
            <Input label="Teléfono" value={telefono} setValue={setTelefono} />
            <Input
              label="Nombre del Contacto WhatsApp"
              value={contactoWs}
              setValue={setContactoWs}
            />
            <Input label="Número de WhatsApp" value={whatsapp} setValue={setWhatsapp} />

            {/* Ruta */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Ruta
              </label>
              {route && (
                <p className="text-xs text-gray-500 mb-1 ml-1">
                  Ruta actual:{" "}
                  <span className="font-semibold text-gray-700">{route}</span>
                </p>
              )}
              <select
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              >
                <option value="">Selecciona una ruta</option>
                {[
                  "AJ01",
                  "AJ03",
                  "AJ07",
                  "AJ08",
                  "HD02",
                  "SJ02",
                  "SJ05",
                  "SJ16",
                  "RG01",
                  "RG02",
                  "RG03",
                  "RG06",
                  "RG07",
                  "RG08",
                  "ZN01",
                  "ZN05",
                  "ZN06",
                  "ZN07",
                  "ZN08",
                ].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Dirección */}
            <Input label="Provincia" value={provincia} setValue={setProvincia} />
            <Input label="Cantón" value={canton} setValue={setCanton} />
            <Input label="Distrito" value={distrito} setValue={setDistrito} />
            <Input label="Dirección" value={direccion} setValue={setDireccion} />

            {/* Geo de clientes */}
            {geo && (
              <div className="mt-2">
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Georreferencia registrada en Maestro
                </label>
                <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl border border-gray-200">
                  <MapPin className="w-5 h-5" />
                  {geo}
                </div>
              </div>
            )}

            {/* Ubicación GPS actual */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Ubicación GPS actual
              </label>
              <div className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-600 rounded-xl">
                <MapPin className="w-5 h-5" />
                {isGettingLocation
                  ? "Capturando ubicación..."
                  : latitude && longitude
                  ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                  : "Error en GPS"}
              </div>
              {locationError && (
                <p className="text-red-500 text-sm mt-2 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> {locationError}
                </p>
              )}
            </div>

            {/* Mapa */}
            {(geo || (latitude && longitude)) && (
              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                onClick={handleOpenMaps}
                className="w-full mt-2 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-semibold"
              >
                <Map className="w-5 h-5 inline mr-2" /> Ir al PDV
              </motion.button>
            )}

            {/* Guardar */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={calcularCambios}
              className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-xl font-semibold"
            >
              <Save className="w-5 h-5" /> Guardar Datos
            </motion.button>

            {/* Menú */}
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => setVista("menuPrincipal")}
              className="w-full mt-3 bg-gray-500 hover:bg-gray-600 text-white py-3 rounded-xl font-semibold"
            >
              Volver al Menú de Clientes
            </motion.button>
          </form>
        )}

        {/* ============================
            MODALES COMPLETOS
           ============================ */}

        {/* Modal por diferencia de geo */}
        <AnimatePresence>
          {modalGeoDiff && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white rounded-3xl shadow-xl border border-gray-200 p-6 w-[360px] text-left"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-lg font-bold text-gray-800 mb-2 text-center">
                  Confirmar actualización de georreferenciación
                </h2>
                <p className="text-sm text-gray-700 mb-3 text-center">
                  La ubicación actual difiere más de{" "}
                  <strong>10 metros</strong> de la registrada.
                </p>
                <div className="text-xs bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
                  <p>
                    <span className="font-semibold">Geo registrada:</span>{" "}
                    {geo || "sin registro"}
                  </p>
                  <p>
                    <span className="font-semibold">Geo actual:</span>{" "}
                    {latitude !== null && longitude !== null
                      ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
                      : "sin lectura"}
                  </p>
                  <p>
                    <span className="font-semibold">Distancia:</span>{" "}
                    {geoDistance.toFixed(1)} m
                  </p>
                </div>
                <div className="flex gap-3 justify-center">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={confirmarCambioGeo}
                    className="flex-1 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
                  >
                    Proceder
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={cancelarCambioGeo}
                    className="flex-1 py-2 bg-gray-500 text-white rounded-xl font-semibold hover:bg-gray-600"
                  >
                    No proceder
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal de selección de duplicados por TAE */}
        <AnimatePresence>
          {showDupModal && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-[60]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white rounded-3xl shadow-2xl border border-gray-200 p-4 w-[380px] max-h-[80vh] overflow-auto text-left"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <h3 className="text-lg font-bold text-gray-800 mb-2 text-center">
                  Selecciona el PDV a actualizar
                </h3>
                <p className="text-xs text-gray-600 mb-3 text-center">
                  Se encontraron {dupList.length} registros con TAE{" "}
                  <b>{mdnCode}</b>.
                </p>

                <div className="space-y-3">
                  {dupList.map((c) => (
                    <div
                      key={`${c.id_cliente ?? "s"}-${c.tae ?? "sin"}`}
                      className="rounded-2xl border border-gray-200 bg-white shadow-sm p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
                          id_cliente: {c.id_cliente ?? "—"}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border text-gray-700">
                          estado: {c.estatus ?? "—"}
                        </span>
                      </div>

                      <h4 className="text-sm font-semibold text-gray-800 mt-2 mb-1">
                        {c.pdv || "(Sin nombre de PDV)"}
                      </h4>

                      <div className="text-xs text-gray-700 space-y-1">
                        <p className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5" />
                          <span>Contacto: {c.contacto || "—"}</span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5" />
                          <span>
                            Tel: {c.telefono || "—"} | WS: {c.whatsapp || "—"}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <Route className="w-3.5 h-3.5" />
                          <span>
                            Ruta: {c.nombre_ruta ?? c.ruta ?? c.ruta_excel ?? "—"}
                          </span>
                        </p>
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>
                            {c.provincia || "—"}/{c.canton || "—"}/
                            {c.distrito || "—"}
                          </span>
                        </p>
                        {c.geo && (
                          <p className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5" />
                            <span className="truncate">Geo: {c.geo}</span>
                          </p>
                        )}
                        {c.direccion && (
                          <p className="text-[11px] text-gray-600">
                            {c.direccion}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedIdCliente(c.id_cliente ?? null); // fijar id_cliente
                            cargarClienteEnFormulario(c);
                            setShowDupModal(false);
                          }}
                          className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                        >
                          Seleccionar
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            window.open(
                              c.geo
                                ? `https://www.google.com/maps?q=${c.geo}`
                                : "https://www.google.com/maps",
                              "_blank"
                            )
                          }
                          className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm border"
                          title="Abrir en Google Maps"
                        >
                          <MapPin className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowDupModal(false);
                    setDupList([]);
                  }}
                  className="w-full mt-3 py-2 rounded-xl bg-gray-500 hover:bg-gray-600 text-white text-sm font-semibold"
                >
                  Cancelar
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Modal de confirmación de cambios */}
        <AnimatePresence>
          {modalChanges && (
            <motion.div
              className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="bg-white rounded-3xl shadow-xl border border-gray-200 p-6 w-[360px] text-left"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <h2 className="text-lg font-bold text-gray-800 mb-3 text-center">
                  Se guardarán los siguientes cambios:
                </h2>
                <ul className="text-sm text-gray-700 space-y-2 mb-4">
                  {changesList.map((c, idx) => (
                    <li key={idx}>
                      • <strong>{c.campo}</strong>: de{" "}
                      <span className="text-red-600">
                        "{c.anterior || "vacío"}"
                      </span>{" "}
                      a{" "}
                      <span className="text-green-600">
                        "{c.actual || "vacío"}"
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-3 justify-center">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={guardarCambiosConfirmados}
                    className="flex-1 py-2 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700"
                  >
                    Confirmar
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setModalChanges(false)}
                    className="flex-1 py-2 bg-gray-500 text-white rounded-xl font-semibold hover:bg-gray-600"
                  >
                    Cancelar
                  </motion.button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-xs text-gray-400 mt-6">
          © 2025 Distel — Módulo de Actualización
        </p>
      </motion.div>
    </div>
  );
}

// ============================
// Input controlado con mayúsculas
// ============================
function Input({ label, value, setValue }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value.toUpperCase())}
        className="w-full px-4 py-3 border border-gray-300 rounded-xl"
      />
    </div>
  );
}
