/* ============================================================================
   AppAsistencia.jsx — Control de Asistencia GPS + QR
   Ubicación: C:\Python\distel-app-unificado\app\src\components\Asistencia\AppAsistencia.jsx

   Requisitos:
   - Supabase 17.6 con script: \supabase\sql\supabase_asistencia.sql
   - Dependencia: html5-qrcode
   - Este módulo funciona en 2 modos:
     A) Embebido con usuario (redirigido desde login global): muestra pantalla de escaneo y registro.
     B) Independiente (sin usuario): muestra tarjeta de login con el mismo formato que AppDesabasto.

   Cambios solicitados:
   - Mostrar logos Liberty y Distel arriba del título.
   - Debajo del título: “Agente: <Nombre>”.
   - Mantener GPS y Ubicación actual visibles. No mostrar distancia.
   - Tras escanear QR: mostrar Nombre del PDV y abajo el MDN (TAE).
   - Botón “Cerrar sesión” centrado y con el mismo estilo y tamaño que “Marcar ingreso/salida”.
   - Agregar botón “Marcar salida”. Ingreso y salida SIEMPRE requieren QR válido.
   - Se permiten múltiples ingresos/salidas al día. Cada evento es un INSERT nuevo.
   - Hora local de Costa Rica se guarda en la BD vía defaults (ver SQL).
   - Validar distancia: bloquear si > 510 m del PDV.
   - Margen anti-doble-registro: bloquear cualquier nuevo evento si el último fue hace < 5 minutos.
   - Reemplazar alertas y banners de error por popup modal unificado con botón “Cerrar”.
   ============================================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import bcrypt from "bcryptjs";
import { supabase } from "../../supabaseClient";
import QRScanner from "./components/QRScanner";
import { haversineMeters, isValidLatLng } from "./geo";

const DISTANCIA_MAX = 510;
const LS_KEY = "asistencia_registro_activo_v1";

export default function AppAsistencia({ usuario: usuarioProp, onVolver }) {
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [loading, setLoading] = useState(false);
  const [usuario, setUsuario] = useState(() => {
    if (usuarioProp) return usuarioProp;
    try {
      const stored = localStorage.getItem("usuario_asistencia");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const puedeUsarModulo = Boolean(
    usuario?.modulo_asistencia === true || usuario?.requiere_gps === true
  );

  const [permisoGPS, setPermisoGPS] = useState("unknown");
  const [pos, setPos] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [error, setError] = useState(""); // se mantiene para compatibilidad; UI usa popup
  const [cargando, setCargando] = useState(false);
  const watchIdRef = useRef(null);
  const [mostrarCamara, setMostrarCamara] = useState(false);

  // Popup unificado
  const [popup, setPopup] = useState({ visible: false, mensaje: "", tipo: "info" });

  // Carga registro previo (solo continuidad visual)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj?.qrData) setQrData(obj.qrData);
      }
    } catch {}
  }, []);

  // Permisos GPS
  useEffect(() => {
    async function checkPermission() {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: "geolocation" });
          setPermisoGPS(status.state);
          status.onchange = () => setPermisoGPS(status.state);
        } else setPermisoGPS("unknown");
      } catch {
        setPermisoGPS("unknown");
      }
    }
    checkPermission();
  }, []);

  // Geolocalización continua
  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("Este dispositivo no soporta geolocalización.");
      setPopup({ visible: true, mensaje: "Este dispositivo no soporta geolocalización.", tipo: "error" });
      return;
    }
    const ok = (p) => {
      setPos({ lat: p.coords.latitude, lng: p.coords.longitude, ts: p.timestamp });
    };
    const ko = (e) => {
      const msg = e.message || "No se pudo obtener ubicación.";
      setError(msg);
      setPopup({ visible: true, mensaje: msg, tipo: "error" });
    };
    const options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };
    watchIdRef.current = navigator.geolocation.watchPosition(ok, ko, options);
    return () => {
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // Distancia actual solo para validación. No se muestra en UI.
  const distanciaActual = useMemo(() => {
    if (!pos || !qrData || !isValidLatLng(qrData.lat, qrData.lng)) return null;
    return Math.round(haversineMeters(pos.lat, pos.lng, qrData.lat, qrData.lng));
  }, [pos, qrData]);

  const fueraDeRango = useMemo(() => {
    if (!pos || !qrData || !isValidLatLng(qrData.lat, qrData.lng)) return true;
    const distancia = haversineMeters(pos.lat, pos.lng, qrData.lat, qrData.lng);
    return distancia > 500;
  }, [pos, qrData]);

  // ----------------------------- LOGIN -----------------------------
  const handleLogin = async () => {
    const tel = telefono.trim();
    const pass = clave.trim();
    if (!tel || !pass) {
      setError("Debe ingresar número y clave.");
      setPopup({ visible: true, mensaje: "Debe ingresar número y clave.", tipo: "error" });
      return;
    }
    setLoading(true);

    const { data: agente, error: errAgente } = await supabase
      .from("agentes")
      .select("*")
      .eq("telefono", tel)
      .eq("activo", true)
      .single();

    if (errAgente || !agente) {
      setError("Usuario no encontrado o inactivo.");
      setPopup({ visible: true, mensaje: "Usuario no encontrado o inactivo.", tipo: "error" });
      setLoading(false);
      return;
    }

    const coincide = await bcrypt.compare(pass, agente.clave);
    if (!coincide) {
      setError("Clave incorrecta.");
      setPopup({ visible: true, mensaje: "Clave incorrecta.", tipo: "error" });
      setLoading(false);
      return;
    }

    if (!agente.modulo_asistencia) {
      setError("Este usuario no tiene acceso al módulo de Asistencia.");
      setPopup({ visible: true, mensaje: "Este usuario no tiene acceso al módulo de Asistencia.", tipo: "error" });
      setLoading(false);
      return;
    }

    const usuarioVerificado = {
      id: agente.id,
      nombre: agente.nombre,
      telefono: agente.telefono,
      acceso: agente.acceso,
      tipo: agente.tipo,
      region: agente.region,
      modulo_asistencia: agente.modulo_asistencia === true,
      requiere_gps: agente.requiere_gps === true,
      activo: agente.activo,
    };

    setUsuario(usuarioVerificado);
    try {
      localStorage.setItem("usuario_asistencia", JSON.stringify(usuarioVerificado));
    } catch {}
    setLoading(false);
    setPopup({ visible: true, mensaje: "Inicio de sesión correcto.", tipo: "ok" });
  };

  // ----------------------------- ESCANEO QR -----------------------------
  async function handleQrResult(text) {
    setError("");
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      setError("QR inválido o malformado.");
      setPopup({ visible: true, mensaje: "QR inválido o malformado.", tipo: "error" });
      return;
    }

    const idCliente = Number(parsed.id_cliente);
    const tae = String(parsed.tae || "").trim();

    if (!idCliente || !tae) {
      setError("QR incompleto: faltan id_cliente o TAE.");
      setPopup({ visible: true, mensaje: "QR incompleto: faltan id_cliente o TAE.", tipo: "error" });
      return;
    }

    const { data, error } = await supabase
      .from("clientes")
      .select(
        "id_cliente, tae, pdv, contacto, telefono, whatsapp, geo, provincia, canton, distrito, direccion, nombre_ruta"
      )
      .eq("id_cliente", idCliente)
      .eq("tae", tae)
      .maybeSingle();

    if (error || !data) {
      setError("No se encontró el cliente con esta combinación id_cliente + TAE.");
      setPopup({ visible: true, mensaje: "No se encontró el cliente con esta combinación id_cliente + TAE.", tipo: "error" });
      return;
    }

    if (!data.geo || !data.geo.includes(",")) {
      setError("El campo 'geo' no contiene coordenadas válidas.");
      setPopup({ visible: true, mensaje: "El campo 'geo' no contiene coordenadas válidas.", tipo: "error" });
      return;
    }

    // ---------------------------------------------------------------------------
    // 🔒 Anti-doble-registro: margen mínimo de 5 minutos entre cualquier evento
    // ---------------------------------------------------------------------------
    const { data: ultimoEvento, error: errUlt } = await supabase
      .from("asistencia_registros")
      .select("tipo_evento, created_at")
      .eq("telefono", usuario?.telefono)
      .eq("id_cliente", idCliente)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errUlt) console.error("Error consultando último evento:", errUlt);

    if (ultimoEvento) {
      const ultimaHora = new Date(ultimoEvento.created_at);
      const ahora = new Date();
      const diffMin = (ahora - ultimaHora) / 60000;

      console.log(
        `Último evento: ${ultimoEvento.tipo_evento} — ${ultimaHora.toLocaleString(
          "es-CR"
        )} | Ahora: ${ahora.toLocaleString("es-CR")} | Diferencia: ${diffMin.toFixed(2)} min`
      );

      if (diffMin < 5) {
        setError(`Debe esperar antes de registrar un nuevo evento. Último hace ${diffMin.toFixed(1)} min.`);
        setPopup({
          visible: true,
          mensaje: `Debe esperar antes de registrar un nuevo evento. Último hace ${diffMin.toFixed(1)} min.`,
          tipo: "error",
        });
        return;
      }
    }

    const [latStr, lngStr] = data.geo.split(",");
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);
    if (isNaN(lat) || isNaN(lng)) {
      setError("Coordenadas inválidas en el campo 'geo'.");
      setPopup({ visible: true, mensaje: "Coordenadas inválidas en el campo 'geo'.", tipo: "error" });
      return;
    }

    // 🚫 Validar que la ubicación del dispositivo esté dentro de 500m del PDV
    if (!pos || !isValidLatLng(pos.lat, pos.lng)) {
      setPopup({
        visible: true,
        mensaje: "Ubicación GPS no disponible o inválida. Espere unos segundos y vuelva a escanear.",
        tipo: "error",
      });
      return;
    }

    const distancia = haversineMeters(pos.lat, pos.lng, lat, lng);

    ///MENSAJE PARA MOSTRAR EN EL POPUP AL ESTAR DIFERENTE LA GEO
    if (distancia > 500) {
      setQrData(null);
      try { localStorage.removeItem(LS_KEY); } catch {}
      setPopup({
        visible: true,
        mensaje: `Ubicacion de PDV Invalida Coordenadas no corresponden a PDV`,
        tipo: "error",
      });
      return;
    }

    // ✅ Solo se ejecuta si la distancia es válida
    const payload = {
      id_cliente: data.id_cliente,
      tae: data.tae,
      nombre_pdv: data.pdv || "PDV sin nombre",
      contacto: data.contacto || null,
      telefono: data.telefono || null,
      whatsapp: data.whatsapp || null,
      lat,
      lng,
      provincia: data.provincia || "",
      canton: data.canton || "",
      distrito: data.distrito || "",
      direccion: data.direccion || "",
      nombre_ruta: data.nombre_ruta || "",
    };

    setQrData(payload);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ qrData: payload }));
    } catch {}
    setPopup({
      visible: true,
      mensaje: `Lecura de QR Exitosa. Puedes proceder ` ,
      tipo: "ok",
    });
    return;
}
  // ----------------------------- REGISTROS -----------------------------
  async function registrarEvento(tipo) {
    if (!usuario || !puedeUsarModulo) {
      setError("No tiene permisos para este módulo.");
      setPopup({ visible: true, mensaje: "No tiene permisos para este módulo.", tipo: "error" });
      return;
    }
    if (!qrData) {
      setError("Debe escanear el QR del PDV antes de registrar.");
      setPopup({ visible: true, mensaje: "Debe escanear el QR del PDV antes de registrar.", tipo: "error" });
      return;
    }
    if (!pos) {
      setError("Ubicación no disponible.");
      setPopup({ visible: true, mensaje: "Ubicación no disponible.", tipo: "error" });
      return;
    }
    if (permisoGPS !== "granted") {
      setError("Debe otorgar permiso de GPS.");
      setPopup({ visible: true, mensaje: "Debe otorgar permiso de GPS.", tipo: "error" });
      return;
    }

    // ✅ Restauración de validación estricta de distancia en tiempo de registro
    if (pos && qrData && isValidLatLng(qrData.lat, qrData.lng)) {
      const distancia = haversineMeters(pos.lat, pos.lng, qrData.lat, qrData.lng);
      if (distancia > DISTANCIA_MAX) {
        setError(
          `No estás en el punto de venta. Distancia actual: ${distancia.toFixed(
            1
          )} m (máximo ${DISTANCIA_MAX} m permitido).`
        );
        setPopup({
          visible: true,
          mensaje: `No estás en el punto de venta. Distancia actual: ${distancia.toFixed(
            1
          )} m (máximo ${DISTANCIA_MAX} m permitido).`,
          tipo: "error",
        });
        return;
      }
    } else {
      setError("No se pudo verificar la ubicación GPS o las coordenadas del PDV.");
      setPopup({
        visible: true,
        mensaje: "No se pudo verificar la ubicación GPS o las coordenadas del PDV.",
        tipo: "error",
      });
      return;
    }

    if (fueraDeRango) {
      setError("No estás en el punto de venta. Intenta desde la ubicación correcta.");
      setPopup({ visible: true, mensaje: "No estás en el punto de venta. Intenta desde la ubicación correcta.", tipo: "error" });
      return;
    }

    setCargando(true);
    try {
      // Cada evento es un registro nuevo. La hora local CR se establece en la BD (ver SQL).
      const insertPayload = {
        tipo_evento: tipo, // 'INGRESO' | 'SALIDA'
        agente_id: usuario.id || null,
        telefono: usuario.telefono,
        id_cliente: qrData.id_cliente,
        tae: qrData.tae,
        nombre_pdv: qrData.nombre_pdv || null,
        lat_objetivo: qrData.lat,
        lng_objetivo: qrData.lng,
        lat_dispositivo: pos.lat,
        lng_dispositivo: pos.lng,
        distancia_metros: distanciaActual,
        estado: "REGISTRADO",
      };

      const { data, error: errIns } = await supabase
        .from("asistencia_registros")
        .insert([insertPayload])
        .select("id")
        .single();

      if (errIns) throw errIns;

      const horaLocal = new Date().toLocaleString("es-CR", {
        hour12: false,
        timeZone: "America/Costa_Rica",
      });

      setPopup({
        visible: true,
        mensaje: `${tipo} registrado a las ${horaLocal} (hora local CR).`,
        tipo: "ok",
      });

      setError("");
    } catch (e) {
      const msg = e.message || "Error al registrar evento.";
      setError(msg);
      setPopup({ visible: true, mensaje: msg, tipo: "error" });
    } finally {
      setCargando(false);
    }

    // 🧹 Limpieza automática tras registrar ingreso o salida
    setQrData(null);
    setMostrarCamara(false);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  }
  // ----------------------------- UI LOGIN -----------------------------
  const loginCard = (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center sm:block sm:pt-10">
      <div className="w-full flex items-center justify-center">
        <div
          className="bg-white shadow-lg rounded-3xl p-8 text-center border border-gray-200 animate-fadeIn"
          style={{ width: "360px", maxWidth: "90%" }}
        >
          <div className="flex items-center justify-center space-x-6 mb-6">
            <img src="/liberty.png" alt="Logo Liberty" className="w-24 h-24 object-contain" />
            <img src="/logo_distel.png" alt="Logo Distel" className="w-24 h-24 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Control de Asistencia</h1>
          <p className="text-gray-600 mb-6">Ingrese su usuario y contraseña</p>
          <input
            type="tel"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Ejemplo: 60123456"
            className="border rounded-lg p-3 w-full text-center text-lg mb-3 focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="Clave (4 dígitos)"
            className="border rounded-lg p-3 w-full text-center text-lg mb-3 focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleLogin}
            disabled={loading}
            className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg w-full disabled:opacity-50"
          >
            {loading ? "Verificando..." : "Ingresar"}
          </button>
        </div>
      </div>
    </div>
  );

  // ----------------------------- UI PRINCIPAL -----------------------------
  const asistenciaScreen = (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center sm:block sm:pt-6">
      <div className="w-full flex items-center justify-center">
        <div
          className="bg-white shadow-lg rounded-3xl p-6 text-center border border-gray-200 animate-fadeIn"
          style={{ width: "380px", maxWidth: "92%" }}
        >
          {/* Logos arriba */}
          <div className="flex items-center justify-center space-x-6 mb-4">
            <img src="/liberty.png" alt="Logo Liberty" className="w-20 h-20 object-contain" />
            <img src="/logo_distel.png" alt="Logo Distel" className="w-20 h-20 object-contain" />
          </div>

          {/* Título y Agente */}
          <h1 className="text-xl font-bold text-gray-800">Control de Asistencia</h1>
          <p className="text-sm text-gray-700 mb-3">
            <span className="font-semibold">Agente:</span> {usuario?.nombre || ""}
          </p>

          {/* Estado de GPS y ubicación actual */}
          <div className="p-3 rounded border text-left text-sm mb-3">
            <p>
              <strong>GPS:</strong> {permisoGPS}
            </p>
            <p>
              <strong>Ubicación actual:</strong>{" "}
              {pos ? `${pos.lat.toFixed(6)}, ${pos.lng.toFixed(6)}` : "obteniendo…"}
            </p>
          </div>

          {/* Datos del QR escaneado */}
          <div className="p-3 rounded border text-left text-sm mb-3">
            <p className="font-semibold mb-1">Punto de venta</p>
            <p>
              <strong>Nombre PDV:</strong>{" "}
              {qrData?.nombre_pdv ? qrData.nombre_pdv : "— escanee el QR —"}
            </p>
            <p>
              <strong>MDN (TAE):</strong> {qrData?.tae ? qrData.tae : "—"}
            </p>

            {/* Botón Refrescar */}
            <div className="mt-3 text-center">
              <button
                onClick={() => {
                  setQrData(null);
                  setMostrarCamara(false);
                  try {
                    localStorage.removeItem(LS_KEY);
                  } catch {}
                  setPopup({ visible: true, mensaje: "Formulario reiniciado. Escanee un nuevo QR.", tipo: "info" });
                }}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow"
              >
                🔄 Refrescar
              </button>
            </div>
          </div>

          {/* Escáner QR */}
          {!mostrarCamara ? (
            <button
              onClick={() => setMostrarCamara(true)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-semibold"
            >
              📷 Escanear código QR
            </button>
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <QRScanner
                onResult={(res) => {
                  handleQrResult(res);
                  setMostrarCamara(false);
                }}
                onError={(e) => {
                  const msg = String(e);
                  setError(msg);
                  setPopup({ visible: true, mensaje: msg, tipo: "error" });
                }}
              />
              <button
                onClick={() => setMostrarCamara(false)}
                className="bg-gray-500 hover:bg-gray-600 text-white py-1 px-4 rounded-lg text-sm"
              >
                Cerrar cámara
              </button>
            </div>
          )}

          {/* Botones de acción: habilitados solo con QR+GPS válidos y dentro de rango */}
          <div className="grid grid-cols-1 gap-3 mt-3">
            <button
              onClick={() => registrarEvento("INGRESO")}
              disabled={
                cargando || !usuario || !puedeUsarModulo || !qrData || !pos || permisoGPS !== "granted" || fueraDeRango
              }
              className={`w-full py-3 rounded-lg text-white ${
                cargando ||
                !usuario ||
                !puedeUsarModulo ||
                !qrData ||
                !pos ||
                permisoGPS !== "granted" ||
                fueraDeRango
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              Marcar ingreso
            </button>

            <button
              onClick={() => registrarEvento("SALIDA")}
              disabled={
                cargando || !usuario || !puedeUsarModulo || !qrData || !pos || permisoGPS !== "granted" || fueraDeRango
              }
              className={`w-full py-3 rounded-lg text-white ${
                cargando ||
                !usuario ||
                !puedeUsarModulo ||
                !qrData ||
                !pos ||
                permisoGPS !== "granted" ||
                fueraDeRango
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              Marcar salida
            </button>
          </div>

          {/* Botón Cerrar sesión centrado con el mismo tamaño que los otros */}
          <div className="mt-4 flex justify-center">
            {onVolver ? (
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("usuario_asistencia");
                    localStorage.removeItem(LS_KEY);
                  } catch {}
                  onVolver();
                }}
                className="w-full py-3 rounded-lg text-white bg-blue-600 hover:bg-blue-700 font-semibold"
              >
                🔒 Cerrar sesión
              </button>
            ) : (
              <span />
            )}
          </div>

          <div className="mt-2">
            <span className="text-xs text-gray-400">La validación requiere GPS activo y QR válido.</span>
          </div>
        </div>
      </div>

      {/* Popup unificado */}
      {popup.visible && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 text-center border">
            <p
              className={`text-sm mb-4 ${
                popup.tipo === "error"
                  ? "text-red-600"
                  : popup.tipo === "ok"
                  ? "text-green-600"
                  : "text-gray-700"
              }`}
            >
              {popup.mensaje}
            </p>
            <button
              onClick={() => setPopup({ visible: false, mensaje: "", tipo: "info" })}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ----------------------------- RENDER FINAL -----------------------------
  if (!usuario) return loginCard;

  if (!puedeUsarModulo) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center sm:block sm:pt-10">
        <div className="w-full flex items-center justify-center">
          <div
            className="bg-white shadow-lg rounded-3xl p-8 text-center border border-gray-200 animate-fadeIn"
            style={{ width: "360px", maxWidth: "90%" }}
          >
            <h1 className="text-2xl font-bold text-gray-800 mb-2">Acceso restringido</h1>
            <p className="text-gray-700 mb-4 text-sm">
              Este usuario no tiene habilitado el módulo de Asistencia.
            </p>
            {onVolver && (
              <button
                onClick={() => {
                  try {
                    localStorage.removeItem("usuario_asistencia");
                    localStorage.removeItem(LS_KEY);
                  } catch {}
                  onVolver();
                }}
                className="px-4 py-2 rounded-lg shadow bg-blue-600 hover:bg-blue-700 text-white text-sm"
              >
                🔒 Cerrar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return asistenciaScreen;
}
