/* ============================================================================
   QRScanner.jsx — versión móvil mejorada (html5-qrcode)
   - Corrige detección lenta en Android
   - Añade sonido y barra animada de escaneo
   - Cierra cámara correctamente
   ============================================================================ */

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function QRScanner({ onResult, onError }) {
  const [activo, setActivo] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const qrRef = useRef(null);
  const scannerRef = useRef(null);
  const sonidoRef = useRef(null);

  useEffect(() => {
    sonidoRef.current = new Audio(
      "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg"
    );
    return () => {
      detenerCamara();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const iniciarCamara = async () => {
    if (activo) return;
    setActivo(true);
    setMensaje("📷 Iniciando cámara…");

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Tu navegador no soporta cámara.");
      }

      // Buscar cámara trasera
      const dispositivos = await navigator.mediaDevices.enumerateDevices();
      const camaraTrasera = dispositivos.find(
        (d) => d.kind === "videoinput" && d.label.toLowerCase().includes("back")
      );
      const camId = camaraTrasera ? camaraTrasera.deviceId : "environment";

      const html5QrCode = new Html5Qrcode(qrRef.current.id);
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { deviceId: { exact: camId } },
        {
          fps: 20, // más fotogramas por segundo = mejor detección
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
          formatsToSupport: [0, 1, 2], // QR_CODE, AZTEC, DATA_MATRIX
          disableFlip: false,
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        },
        (decodedText) => {
          setMensaje("✅ Código detectado");
          console.log("✅ QR detectado:", decodedText);
          try {
            sonidoRef.current?.play();
          } catch {}
          detenerCamara();
          onResult?.(decodedText);
        },
        (scanError) => {
          if (scanError && !scanError.message?.includes("No QR code found")) {
            console.warn("QRScanner detectando:", scanError);
          }
        }
      );
    } catch (err) {
      console.error("Error al iniciar cámara:", err);
      setMensaje("⚠️ Error al iniciar cámara");
      onError?.(String(err));
      setActivo(false);
    }
  };

  const detenerCamara = async () => {
    if (!scannerRef.current) return;
    try {
      const s = scannerRef.current;
      scannerRef.current = null;
      await s.stop();
      await new Promise((r) => setTimeout(r, 150));
      await s.clear();
      console.log("📴 Cámara detenida correctamente.");
    } catch (err) {
      console.warn("⚠️ Error deteniendo cámara:", err.message);
    } finally {
      setActivo(false);
    }
  };

  return (
    <div className="flex flex-col items-center space-y-3 w-full">
      {!activo ? (
        <button
          onClick={iniciarCamara}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold"
        >
          Escanear código QR
        </button>
      ) : (
        <div className="flex flex-col items-center space-y-2 relative">
          <div
            id="qr-reader"
            ref={qrRef}
            style={{
              width: "280px",
              height: "280px",
              border: "3px solid #38bdf8",
              borderRadius: "12px",
              backgroundColor: "black",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              className="scanline"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "3px",
                background: "#38bdf8",
                animation: "scanAnim 2s linear infinite",
              }}
            />
          </div>

          <style>
            {`
              @keyframes scanAnim {
                0% { top: 0; opacity: 0.8; }
                50% { top: 95%; opacity: 0.6; }
                100% { top: 0; opacity: 0.8; }
              }
            `}
          </style>

          <p className="text-gray-600 text-sm">
            {mensaje || "Apunta al código QR..."}
          </p>
          <button
            onClick={detenerCamara}
            className="bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg font-semibold"
          >
            Cerrar cámara
          </button>
        </div>
      )}
    </div>
  );
}
