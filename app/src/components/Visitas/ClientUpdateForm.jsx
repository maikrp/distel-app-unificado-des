import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  AlertCircle,
  Save,
  Clock,
  RefreshCw,
} from "lucide-react";
import { supabase } from "../utils/supabase";

export default function ClientUpdateForm({ setVista }) {
  const [mdnCode, setMdnCode] = useState("");
  const [pdvName, setPdvName] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [contactoWs, setContactoWs] = useState("");
  const [whatsapp, setWhatsapp] = useState("");

  const [originalData, setOriginalData] = useState({});
  const [route, setRoute] = useState("");
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [isGettingLocation, setIsGettingLocation] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [existingVisitId, setExistingVisitId] = useState(null);

  // Cargar datos del usuario logueado
    const [usuarioDatos, setUsuarioDatos] = useState(() => {
      try {
        const u = localStorage.getItem("usuario");
        return u ? JSON.parse(u) : {};
      } catch {
        return {};
      }
    });

  const routes = [
    "AJ01","AJ03","AJ07","AJ08","HD02","SJ02","SJ05","SJ16",
    "RG01","RG02","RG03","RG06","RG07","RG08",
    "ZN01","ZN05","ZN06","ZN07","ZN08",
  ];

  // === GPS ===
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Tu navegador no soporta GPS.");
      setIsGettingLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setAccuracy(pos.coords.accuracy);
        setIsGettingLocation(false);
      },
      () => {
        setLocationError("Activa el GPS e inténtalo de nuevo.");
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  // === Buscar cliente y último registro existente ===
  useEffect(() => {
    const fetchData = async () => {
      if (mdnCode.trim().length >= 8) {
        try {
          const { data: clienteData, error: clienteError } = await supabase
            .from("clientes")
            .select("tae, pdv, contacto, telefono, nombre_ruta")
            .eq("tae", mdnCode.trim())
            .limit(1);

          if (clienteError || !clienteData || clienteData.length === 0) {
            setPdvName("No encontrado");
            setContacto("");
            setTelefono("");
            setContactoWs("");
            setWhatsapp("");
            setRoute("");
            setOriginalData({});
            setExistingVisitId(null);
            return;
          }

          const c = clienteData[0];
          setPdvName(c.pdv?.toUpperCase() || "SIN NOMBRE");
          setContacto(c.contacto?.toUpperCase() || "");
          setTelefono(c.telefono?.toUpperCase() || "");
          setRoute(c.nombre_ruta || "");

          const { data: visitaData, error: visitaError } = await supabase
            .from("visitas_pdv")
            .select("id, contacto_ws, whatsapp, ruta, nombre_pdv")
            .eq("pdv_id", mdnCode.trim())
            .order("created_at", { ascending: false })
            .limit(1);

          if (visitaError) console.warn("Error leyendo visitas_pdv:", visitaError);

          const ultimo = visitaData && visitaData.length > 0 ? visitaData[0] : {};
          setExistingVisitId(ultimo.id || null);
          setContactoWs(ultimo.contacto_ws?.toUpperCase() || "");
          setWhatsapp(ultimo.whatsapp?.toUpperCase() || "");

          const rutaFinal = ultimo.ruta || c.nombre_ruta || "";
          const pdvFinal = ultimo.nombre_pdv?.toUpperCase() || c.pdv?.toUpperCase() || "SIN NOMBRE";
          setRoute(rutaFinal);
          setPdvName(pdvFinal);

          setOriginalData({
            contacto: c.contacto?.toUpperCase() || "",
            telefono: c.telefono?.toUpperCase() || "",
            contacto_ws: ultimo.contacto_ws?.toUpperCase() || "",
            whatsapp: ultimo.whatsapp?.toUpperCase() || "",
            route_original: rutaFinal,
            pdv_original: pdvFinal,
          });
        } catch (err) {
          console.error("Error general:", err.message);
          setError("Error al consultar la información del cliente.");
        }
      } else {
        setPdvName("");
        setContacto("");
        setTelefono("");
        setContactoWs("");
        setWhatsapp("");
        setOriginalData({});
        setExistingVisitId(null);
      }
    };
    fetchData();
  }, [mdnCode]);

  // === Manejar envío ===
  const handleSubmit = async (e) => {
    e.preventDefault();
    // ✅ Validar que el agente tenga teléfono válido antes de guardar
    if (!usuarioDatos?.telefono || !/^[0-9]{8}$/.test(usuarioDatos.telefono)) {
      setError("⚠️ No se detecta un teléfono válido. Inicia sesión antes de continuar.");
      return;
    }
    if (mdnCode.length !== 8) {
      setError("El MDN debe tener 8 dígitos.");
      return;
    }
    if (!latitude || !longitude || !route) {
      setError("Faltan datos obligatorios.");
      return;
    }

    const cambios = [];

    if (pdvName !== originalData.pdv_original) {
      const confirmPdv = window.confirm(
        `El nombre del PDV cambiará de "${originalData.pdv_original}" a "${pdvName}". ¿Desea continuar?`
      );
      if (confirmPdv) cambios.push(`Nombre PDV: ${originalData.pdv_original} → ${pdvName}`);
      else setPdvName(originalData.pdv_original);
    }

    if (contacto !== originalData.contacto)
      cambios.push(`Contacto: ${originalData.contacto || "(vacío)"} → ${contacto}`);
    if (telefono !== originalData.telefono)
      cambios.push(`Teléfono: ${originalData.telefono || "(vacío)"} → ${telefono}`);

    let sobreescribirWS = true;
    if (contactoWs !== originalData.contacto_ws) {
      if (originalData.contacto_ws) {
        const confirmWS = window.confirm(
          `Ya existe un valor previo para Contacto WS (${originalData.contacto_ws}). ¿Desea sobrescribirlo?`
        );
        sobreescribirWS = confirmWS;
      }
      if (sobreescribirWS)
        cambios.push(`Contacto WS: ${originalData.contacto_ws || "(vacío)"} → ${contactoWs || "(vacío)"}`);
    }

    let sobreescribirWhats = true;
    if (whatsapp !== originalData.whatsapp) {
      if (originalData.whatsapp) {
        const confirmWhats = window.confirm(
          `Ya existe un valor previo para WhatsApp (${originalData.whatsapp}). ¿Desea sobrescribirlo?`
        );
        sobreescribirWhats = confirmWhats;
      }
      if (sobreescribirWhats)
        cambios.push(`WhatsApp: ${originalData.whatsapp || "(vacío)"} → ${whatsapp || "(vacío)"}`);
    }

    if (cambios.length === 0) {
      alert("No hay cambios para actualizar.");
      return;
    }

    const confirmar = window.confirm(
      `Se actualizarán los siguientes campos:\n\n${cambios.join("\n")}\n\n¿Desea continuar?`
    );
    if (!confirmar) return;

    setIsSubmitting(true);
    const fechaCR = new Date().toLocaleString("sv-SE", {
      timeZone: "America/Costa_Rica",
    });

    let queryError = null;

    if (existingVisitId) {
      const { error: updateError } = await supabase
        .from("visitas_pdv")
        .update({
          nombre_pdv: pdvName,
          contacto,
          telefono,
          contacto_ws: sobreescribirWS ? contactoWs : originalData.contacto_ws,
          whatsapp: sobreescribirWhats ? whatsapp : originalData.whatsapp,
          lat: latitude,
          lng: longitude,
          accuracy,
          created_at: fechaCR,
          agente_id: usuarioDatos.telefono,
        })
        .eq("id", existingVisitId);
      queryError = updateError;
    } else {
      const { error: insertError } = await supabase.from("visitas_pdv").insert([
        {
          agente_id: usuarioDatos.telefono,
          pdv_id: mdnCode.trim(),
          nombre_pdv: pdvName,
          contacto,
          telefono,
          contacto_ws: contactoWs,
          whatsapp,
          lat: latitude,
          lng: longitude,
          accuracy,
          created_at: fechaCR,
          ruta: route,
        },
      ]);
      queryError = insertError;
    }

    setIsSubmitting(false);
    if (queryError) setError("Error al guardar la actualización.");
    else {
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
      setMdnCode("");
      setPdvName("");
      setContacto("");
      setTelefono("");
      setContactoWs("");
      setWhatsapp("");
      setRoute("");
      setExistingVisitId(null);
    }
  };

  if (success)
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 w-[360px] text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">
            ¡Actualización guardada!
          </h2>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center py-8">
      <motion.div
        className="bg-white rounded-3xl shadow-xl border border-gray-200 p-8 w-[380px] text-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-center space-x-6 mb-6">
          <img src="/liberty.png" alt="Liberty" className="w-20 h-20" />
          <img src="/logo_distel.png" alt="Distel" className="w-20 h-20" />
        </div>

        <h1 className="text-xl font-bold text-gray-800 mb-3">
          Actualización Contacto
        </h1>

        <div className="bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 p-3 rounded-xl text-sm mb-5 flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600" />
          Asegúrate de estar físicamente cerca del PDV antes de enviar la actualización
        </div>

        {/* --- Formulario --- */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Código MDN del PDV
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{8}"
              value={mdnCode}
              onChange={(e) => {
                const v = e.target.value;
                if (/^\d{0,8}$/.test(v)) setMdnCode(v);
              }}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-gray-50"
              required
            />
          </div>

          {pdvName && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Nombre del PDV
              </label>
              <input
                type="text"
                value={pdvName}
                onChange={(e) => setPdvName(e.target.value.toUpperCase())}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                placeholder="Nombre del PDV"
              />
            </div>
          )}

          {pdvName && pdvName !== "No encontrado" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Contacto
                </label>
                <input
                  type="text"
                  value={contacto}
                  onChange={(e) => setContacto(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                  placeholder="Nombre del contacto"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Teléfono
                </label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                  placeholder="Ej: 88889999"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Ruta
                </label>
                <select
                  value={route}
                  onChange={(e) => {
                    const newRoute = e.target.value;
                    if (originalData.route_original && newRoute !== originalData.route_original) {
                      const confirmar = window.confirm(
                        `Está cambiando la ruta de este PDV de ${
                          originalData.route_original || "(sin ruta)"
                        } a ${newRoute}. ¿Desea continuar?`
                      );
                      if (confirmar) setRoute(newRoute);
                      else setRoute(originalData.route_original || "");
                    } else {
                      setRoute(newRoute);
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl bg-white"
                  required
                >
                  {route && !routes.includes(route) && (
                    <option value={route}>{route} (actual)</option>
                  )}
                  <option value="">Selecciona una ruta</option>
                  {routes.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Contacto WS
            </label>
            <input
              type="text"
              value={contactoWs}
              onChange={(e) => setContactoWs(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              placeholder="Ej: JUAN PÉREZ"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              WhatsApp
            </label>
            <input
              type="text"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl"
              placeholder="Ej: 88889999"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Ubicación GPS
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

          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-xl p-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" /> {error}
            </p>
          )}

          <motion.button
            type="submit"
            disabled={
              isSubmitting ||
              !mdnCode ||
              !route ||
              !latitude ||
              !longitude ||
              connectionStatus === false
            }
            className="w-full mt-4 flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-green-500 to-blue-600 text-white rounded-xl font-semibold"
          >
            {isSubmitting ? (
              <>
                <Clock className="w-5 h-5 animate-spin" /> Guardando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" /> Guardar Actualización
              </>
            )}
          </motion.button>

          <button
            type="button"
            onClick={() => setVista("menu")}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold"
          >
            ← Volver al Menú
          </button>
        </form>

        <p className="text-xs text-gray-400 mt-6">
          © 2025 Distel — Módulo de Actualización de Contactos
        </p>
      </motion.div>
    </div>
  );
}
