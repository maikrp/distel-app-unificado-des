/* eslint-disable no-unused-vars */
/* ============================================================================
   AdminToolsPanel.jsx — v1.1.3
   - Mantiene orden y opciones 1–7.
   - Opción 5 actualizada: listar y borrar .xls/.xlsx en Descargas usando
     File System Access API (Chrome/Edge/Android). Fallback informativo.
   - Mensajería unificada en POPUPS modales; no se muestra texto fuera de tarjeta.
   - Progreso global conservado para cargas Excel (opciones 1 y 2).
   ============================================================================
*/

import { useRef, useState } from "react";
import { supabase } from "../../../supabaseClient";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

// ============================================================================
// ADMINISTRACIÓN DE PLATAFORMA — Panel Web (7 opciones)
// ============================================================================
export default function AdminToolsPanel({ onVolver }) {
  // ==== Estados generales ====
  const [vista, setVista] = useState("menu");

  // ==== Estados de progreso global (cargas) ====
  const [loading, setLoading] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [detalleProgreso, setDetalleProgreso] = useState("");

  // ==== Popups unificados ====
  const [mostrarPopupInfo, setMostrarPopupInfo] = useState(false);
  const [textoPopupInfo, setTextoPopupInfo] = useState("");

  // ==== Modal de progreso global ====
  const [mostrarProgress, setMostrarProgress] = useState(false);
  const [progressTitulo, setProgressTitulo] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const [progressDetalle, setProgressDetalle] = useState("");
  const [progressTerminado, setProgressTerminado] = useState(false);

  // ==== Referencias de inputs de archivo ====
  const fileInput1Ref = useRef(null); // opción 1 (Desabasto)
  const fileInput2Ref = useRef(null); // opción 2 (Maestro)

  // ==== Estados específicos ====
  const [fechaBorrar, setFechaBorrar] = useState("");
  const [telefonoSupervisor, setTelefonoSupervisor] = useState("");
  const [telefonoReset, setTelefonoReset] = useState("");
  const [nombre, setNombre] = useState("");
  const [acceso, setAcceso] = useState("regional");
  const [region, setRegion] = useState("");

  // ==== Archivo en memoria ====
  const [archivo, setArchivo] = useState(null);

  // ==== Utilidades UI ====
  const Button = ({ children, onClick, className, disabled }) => (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`w-full py-2 px-4 rounded-lg font-semibold transition-colors ${className} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      {children}
    </button>
  );

  const Input = ({ placeholder, value, onChange, type = "text" }) => (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 focus:ring-2 focus:ring-blue-500"
    />
  );

  const Card = ({ title, children }) => (
    <div className="bg-white rounded-3xl shadow-lg p-6 w-full max-w-md text-center">
      <div className="flex items-center justify-center space-x-6 mb-4">
        <img src="/liberty.png" alt="Logo Liberty" className="w-20 h-20 object-contain" />
        <img src="/logo_distel.png" alt="Logo Distel" className="w-20 h-20 object-contain" />
      </div>
      <h2 className="text-xl font-bold text-gray-800 mb-4">{title}</h2>
      {children}
    </div>
  );

  const ProgressModal = () =>
    !mostrarProgress ? null : (
      <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
        <div className="bg-white p-6 rounded-2xl shadow-xl text-center max-w-sm w-[90%]">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">{progressTitulo}</h3>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
            <div
              className="h-3 bg-blue-600 transition-all"
              style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }}
            />
          </div>
          <p className="text-sm text-gray-700 mb-4">
            {progressPct}% {progressDetalle ? `· ${progressDetalle}` : ""}
          </p>
          <Button
            onClick={() => setMostrarProgress(false)}
            className={`${
              progressTerminado ? "bg-green-600 hover:bg-green-700" : "bg-gray-600 hover:bg-gray-700"
            } text-white`}
            disabled={!progressTerminado}
          >
            {progressTerminado ? "Cerrar" : "Procesando..."}
          </Button>
        </div>
      </div>
    );

  // ==== Helpers ====
  const notify = (msg) => {
    setTextoPopupInfo(msg);
    setMostrarPopupInfo(true);
  };

  const normalizeCol = (col) =>
    String(col || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();

  const ahoraCostaRica = () => {
    const cr = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Costa_Rica" }));
    const pad = (n) => String(n).padStart(2, "0");
    const yyyy = cr.getFullYear();
    const mm = pad(cr.getMonth() + 1);
    const dd = pad(cr.getDate());
    const hh = pad(cr.getHours());
    const mi = pad(cr.getMinutes());
    const ss = pad(cr.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}-06`;
  };

  const sheetToJsonRobusto = (sheet, opts = {}) => {
    const json = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false, ...opts });
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return { json, csv };
  };

  const getConteoDesabasto = async () => {
    const total = await supabase.from("desabasto_registros").select("id", { count: "exact" });
    return { total: total.count || 0 };
  };

  const getConteosClientes = async () => {
    const total = await supabase.from("clientes").select("id_cliente", { count: "exact" });
    const activos = await supabase
      .from("clientes")
      .select("id_cliente", { count: "exact" })
      .eq("estatus", "Activo");
    const inactivos = await supabase
      .from("clientes")
      .select("id_cliente", { count: "exact" })
      .eq("estatus", "Inactivo");
    return {
      total: total.count || 0,
      activos: activos.count || 0,
      inactivos: inactivos.count || 0,
    };
  };

  // ==== Renombres para formatos nuevos → nombres de desabasto_registros ====
  const RENAME_MAP = {
    mdn: "mdn_usuario",
    saldo_menor_promedio_diario: "saldo_menor_al_promedio_diario",
    promedio_recaudo_diario: "promadio_diario",
    promedio_recaudo_semana: "promedio_semanal",
    recaudo_mes_actual: "monto_recargado_este_mes",
    promedio_recaudo_trimestral: "promedio_recargado_en_los_ultimos_3_meses",
    padre_vendedor: "vendedor",
    jerarquia_n2: "jerarquias_n2_region",
    jerarquia_n3: "jerarquias_n3_ruta",
    fecha_ultima_combra: "fecha_ultima_compra",
    ultimo_uso_mr: "ultimo_uso_de_mis_recargas",
  };

  // ==== Detección robusta de columna "saldo_menor_al_promedio_diario" ====
  const pickColSaldoMenorPromedio = (cols) => {
    const candidatos = [
      "saldo_menor_al_promedio_diario",
      "saldo_menor_promedio_diario",
      "saldo_menor_promedio",
      "saldo_menor",
    ];
    for (const c of candidatos) if (cols.includes(c)) return c;
    return cols.find(
      (c) =>
        c.includes("saldo") &&
        c.includes("promedio") &&
        (c.includes("diario") || c.includes("promedio_diario"))
    );
  };

  // ==== Deduplicación local por id_cliente ====
  const dedupLocalPorId = (rows) => {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const key = r?.id_cliente ?? null;
      if (key == null) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  };

  // ==== Limpieza automática de archivo y progreso ====
  const limpiarArchivoYProgreso = (ref) => {
    setArchivo(null);
    setProgreso(0);
    setDetalleProgreso("");
    if (ref && ref.current) ref.current.value = "";
  };

  // ==== Columnas válidas desabasto ====
  const allowedColumns = [
    "fuente_archivo",
    "fecha_carga",
    "mdn_usuario",
    "pdv",
    "saldo",
    "ultimo_uso_de_mis_recargas",
    "estado",
    "promadio_diario",
    "saldo_menor_al_promedio_diario",
    "promedio_semanal",
    "saldo_menor_al_promedio_semanal",
    "compro_saldo_hoy",
    "monto_comprado",
    "fecha_ultima_compra",
    "vendedor",
    "monto_recargado_este_mes",
    "promedio_recargado_en_los_ultimos_3_meses",
    "canal",
    "subcanal",
    "agrupacion",
    "nivel_socio",
    "jerarquias_n2_region",
    "jerarquias_n3_ruta",
    "id_socio",
    "region_comercial",
    "abastecimiento",
  ];

  // ==== Opción 1: Cargar Desabasto desde Excel ====
  const manejarCarga = async () => {
    try {
      if (!archivo) {
        notify("Debe seleccionar un archivo .xls o .xlsx primero.");
        return;
      }
      setLoading(true);
      setProgreso(0);
      setDetalleProgreso("");
      setProgressTitulo("Cargando desabasto desde Excel");
      setProgressPct(0);
      setProgressDetalle("Preparando archivo...");
      setProgressTerminado(false);
      setMostrarProgress(true);

      const data = await archivo.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const hoja = workbook.SheetNames[0];

      // En reportes de desabasto, cabecera usual en fila 3 ⇒ range: 2
      const { json: jsonOriginal } = sheetToJsonRobusto(workbook.Sheets[hoja], { range: 2 });

      const jsonNorm = jsonOriginal.map((row, idx, arr) => {
        if (arr.length > 0 && idx % 50 === 0) {
          const pct = Math.round((idx / arr.length) * 20); // hasta 20% durante normalización
          setProgressPct(pct);
          setProgressDetalle(`Normalizando filas ${idx}/${arr.length}`);
        }
        const nuevo = {};
        for (const k of Object.keys(row)) {
          const nk = normalizeCol(k);
          if (!nk || nk.startsWith("unnamed")) continue;
          const destino = RENAME_MAP[nk] || nk;
          const val = row[k];
          if (typeof val === "string") {
            const t = val.trim();
            nuevo[destino] = t === "" || t.toLowerCase() === "nan" ? null : t;
          } else {
            nuevo[destino] = val;
          }
        }
        return nuevo;
      });

      if (jsonNorm.length === 0) {
        setProgressDetalle("Sin filas");
        setProgressPct(100);
        setProgressTerminado(true);
        notify("El archivo no tiene filas de datos.");
        return;
      }

      const cols = Object.keys(jsonNorm[0]);
      const colSaldo = pickColSaldoMenorPromedio(cols);
      let filtrados = jsonNorm;
      let excluidos = 0;

      if (colSaldo) {
        filtrados = jsonNorm.filter(
          (r) => String(r[colSaldo] ?? "").trim().toLowerCase() !== "normal"
        );
        excluidos = jsonNorm.length - filtrados.length;
      } else {
        // continua, pero avisa
        // no detener proceso si no hay columna
      }

      const fechaCR = ahoraCostaRica();
      const procesados = filtrados.map((r) => {
        const soloPermitidos = {};
        for (const key of Object.keys(r)) {
          if (allowedColumns.includes(key)) {
            soloPermitidos[key] =
              r[key] === "" || r[key] === "NaN" || r[key] === "nan" ? null : r[key];
          }
        }
        soloPermitidos.fuente_archivo = archivo.name;
        soloPermitidos.fecha_carga = fechaCR;
        return soloPermitidos;
      });

      const total = procesados.length;
      if (total === 0) {
        setProgressDetalle("Sin filas válidas");
        setProgressPct(100);
        setProgressTerminado(true);
        notify("No hay filas válidas para insertar.");
        return;
      }

      const lote = 500;
      let insertados = 0;
      for (let i = 0; i < total; i += lote) {
        const subset = procesados.slice(i, i + lote);
        if (subset.length === 0) continue;
        const { error } = await supabase.from("desabasto_registros").insert(subset);
        if (error) throw error;
        insertados += subset.length;
        const pct = Math.round(20 + (insertados / total) * 80); // 20→100% durante inserts
        setProgreso(Math.round((insertados / total) * 100));
        setDetalleProgreso(`${insertados}/${total}`);
        setProgressPct(pct);
        setProgressDetalle(`Insertando lote ${(i / lote) + 1}/${Math.ceil(total / lote)}`);
      }

      setProgressDetalle("Completado");
      setProgressPct(100);
      setProgressTerminado(true);
      const msgBase = `Registros insertados desde ${archivo.name}: ${insertados}`;
      const msgExtra = excluidos > 0 ? ` (excluidos ${excluidos} con estado 'Normal')` : "";
      notify(`✅ ${msgBase}${msgExtra}`);
    } catch (e) {
      setProgressDetalle("Error");
      setProgressPct(100);
      setProgressTerminado(true);
      notify(`❌ Error en carga: ${e.message}`);
    } finally {
      setLoading(false);
      limpiarArchivoYProgreso(fileInput1Ref);
    }
  };

  // ==== Vistas Opción 1 ====
  const cargarArchivoView = (
    <Card title="Actualizar Base Desabasto (.xls/.xlsx)">
      <div className="space-y-4">
        <div className="flex justify-center">
          <Button
            onClick={async () => {
              try {
                const c = await getConteoDesabasto();
                notify(`📊 DESABASTO_REGISTROS\n\n• Total de registros: ${c.total}`);
              } catch (err) {
                notify(`❌ Error al consultar: ${err.message}`);
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white w-60"
          >
            🔍 Conteo actual
          </Button>
        </div>

        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInput1Ref}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setArchivo(file);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
          <div className="flex items-center border border-gray-300 rounded-lg p-2 bg-white">
            <span className="flex-1 text-gray-700 truncate">
              {archivo ? archivo.name : "No file chosen"}
            </span>
            <label className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm">
              Elegir
            </label>
          </div>
        </div>

        <Button
          onClick={manejarCarga}
          disabled={loading || !archivo}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? "Subiendo..." : "Subir archivo"}
        </Button>

        {progreso > 0 && (
          <p className="text-sm text-gray-700">
            ⏳ Progreso: {progreso}% {detalleProgreso && `(${detalleProgreso})`}
          </p>
        )}

        <Button
          onClick={() => {
            setVista("menu");
            setProgreso(0);
            setDetalleProgreso("");
            limpiarArchivoYProgreso(fileInput1Ref);
          }}
          className="bg-gray-700 hover:bg-gray-800 text-white"
        >
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Vistas Opción 2: Cargar Maestro Clientes ====
  const cargaMaestroView = (
    <Card title="Actualizar Maestro Clientes (.xls/.xlsx)">
      <div className="space-y-4">
        <div className="flex justify-center">
          <Button
            onClick={async () => {
              try {
                const c = await getConteosClientes();
                notify(`📊 CLIENTES\n\n• Total: ${c.total}\n• Activos: ${c.activos}\n• Inactivos: ${c.inactivos}`);
              } catch (err) {
                notify(`❌ Error al consultar: ${err.message}`);
              }
            }}
            className="bg-blue-600 hover:bg-blue-700 text-white w-60"
          >
            🔍 Conteo actual
          </Button>
        </div>

        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInput2Ref}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setArchivo(file);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
          <div className="flex items-center border border-gray-300 rounded-lg p-2 bg-white">
            <span className="flex-1 text-gray-700 truncate">
              {archivo ? archivo.name : "No file chosen"}
            </span>
            <label className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm">
              Elegir
            </label>
          </div>
        </div>

        <Button
          onClick={async () => {
            try {
              if (!archivo) {
                notify("Debe seleccionar un archivo .xls o .xlsx primero.");
                return;
              }
              setLoading(true);
              setProgreso(0);
              setDetalleProgreso("");
              setProgressTitulo("Cargando Maestro de Clientes");
              setProgressPct(0);
              setProgressDetalle("Preparando archivo...");
              setProgressTerminado(false);
              setMostrarProgress(true);

              const data = await archivo.arrayBuffer();
              const workbook = XLSX.read(data, { type: "array" });
              const hoja = workbook.SheetNames[0];
              const { json } = sheetToJsonRobusto(workbook.Sheets[hoja], { defval: null });

              const mapa = {
                "ID Cliente": "id_cliente",
                "Codigo Tercero Recarga (TAE)": "tae",
                "ID Ruta": "id_ruta",
                "Nombre Ruta": "nombre_ruta",
                "ID Sede": "id_sede",
                "Nombre Sede": "nombre_sede",
                "Tipo Cliente": "tipo_cliente",
                "Nombre del Punto de venta": "pdv",
                "Dirección": "direccion",
                "Provincia": "provincia",
                "Cantón": "canton",
                "Distrito": "distrito",
                "Contacto o Propietario del PDV": "contacto",
                "Cédula Física o Jurídica": "cedula",
                "Teléfono": "telefono",
                "Dirección Electrónica": "correo",
                "Frecuencia de Visita": "visita",
                "Georeferenciación": "geo",
                "Lunes": "lunes",
                "Martes": "martes",
                "Miércoles": "miercoles",
                "Jueves": "jueves",
                "Viernes": "viernes",
                "Sábado": "sabado",
                "Domingo": "domingo",
                "Fecha Ingreso": "fecha_ingreso",
                "Monto Crédito": "credito",
                "Días Crédito": "dias",
                "ID Tipo Punto": "id_punto",
                "Nombre Tipo Punto": "tipo_punto",
                "Barrio": "barrio",
                "Fecha Cumpleaños": "cumpleanos",
                "ID_RDT": "id_rdt",
                "Activo/Inactivo": "estatus",
              };

              const datos = json.map((r, idx, arr) => {
                if (arr.length > 0 && idx % 100 === 0) {
                  const pct = Math.min(25, Math.round((idx / arr.length) * 25));
                  setProgressPct(pct);
                  setProgressDetalle(`Normalizando filas ${idx}/${arr.length}`);
                }
                const limpio = {};
                for (const [k, v] of Object.entries(r)) {
                  const destino = mapa[k] || null;
                  if (!destino) continue;
                  if (typeof v === "string") {
                    const t = v.trim();
                    limpio[destino] = t === "" || t.toLowerCase() === "nan" ? null : t;
                  } else {
                    limpio[destino] = v;
                  }
                }
                if (!limpio["fecha_creacion"]) limpio["fecha_creacion"] = ahoraCostaRica();
                return limpio;
              });

              const dias = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
              for (const d of dias) {
                for (const row of datos) {
                  if (d in row) {
                    const val = row[d];
                    if (typeof val === "string" && val.trim().toUpperCase() === "X") row[d] = 1;
                    else if (typeof val === "string" && /^\d+$/.test(val.trim()))
                      row[d] = parseInt(val.trim(), 10);
                    else if (val === "" || val === null) row[d] = null;
                  }
                }
              }

              const parseFecha = (x) => {
                if (!x) return null;
                const dt = new Date(x);
                if (isNaN(dt.getTime())) return null;
                const yyyy = dt.getFullYear();
                const mm = String(dt.getMonth() + 1).padStart(2, "0");
                const dd = String(dt.getDate()).padStart(2, "0");
                return `${yyyy}-${mm}-${dd}`;
              };
              for (const row of datos) {
                if ("fecha_ingreso" in row) row["fecha_ingreso"] = parseFecha(row["fecha_ingreso"]);
                if ("cumpleanos" in row) row["cumpleanos"] = parseFecha(row["cumpleanos"]);
              }

              const datosConClave = datos.filter((r) => r.id_cliente != null && r.tae != null);
              const dedupLocal = dedupLocalPorId(datosConClave);

              const total = dedupLocal.length;
              let procesados = 0;
              const lote = 500;
              for (let i = 0; i < total; i += lote) {
                const subset = dedupLocal.slice(i, i + lote);
                const { error } = await supabase
                  .from("clientes")
                  .upsert(subset, { onConflict: ["id_cliente", "tae"], ignoreDuplicates: true });
                if (error) throw error;
                procesados += subset.length;
                const pct = Math.round(25 + (procesados / total) * 75); // 25→100%
                setProgreso(Math.round((procesados / total) * 100));
                setDetalleProgreso(`${procesados}/${total}`);
                setProgressPct(pct);
                setProgressDetalle(`Insertando lote ${(i / lote) + 1}/${Math.ceil(total / lote)}`);
              }

              setProgressDetalle("Completado");
              setProgressPct(100);
              setProgressTerminado(true);

              const c = await getConteosClientes();
              notify(
                `✅ Maestro actualizado.\nTotal: ${c.total}\nActivos: ${c.activos}\nInactivos: ${c.inactivos}`
              );
            } catch (err) {
              setProgressDetalle("Error");
              setProgressPct(100);
              setProgressTerminado(true);
              notify(`❌ Error en carga: ${err.message}`);
            } finally {
              setLoading(false);
              limpiarArchivoYProgreso(fileInput2Ref);
            }
          }}
          disabled={loading || !archivo}
          className="bg-teal-600 hover:bg-teal-700 text-white"
        >
          {loading ? "Subiendo..." : "Subir Maestro"}
        </Button>

        {progreso > 0 && (
          <p className="text-sm text-gray-700">
            ⏳ Progreso: {progreso}% {detalleProgreso && `(${detalleProgreso})`}
          </p>
        )}

        <Button
          onClick={() => {
            setVista("menu");
            setProgreso(0);
            setDetalleProgreso("");
            limpiarArchivoYProgreso(fileInput2Ref);
          }}
          className="bg-gray-700 hover:bg-gray-800 text-white"
        >
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Vistas Opción 3: Borrar por fecha ====
  const borrarFechaView = (
    <Card title="Borrar registros por fecha">
      <div className="space-y-3">
        <Input type="date" value={fechaBorrar} onChange={(e) => setFechaBorrar(e.target.value)} />
        <Button
          onClick={async () => {
            try {
              if (!fechaBorrar) {
                notify("Debe ingresar una fecha (YYYY-MM-DD).");
                return;
              }
              const desde = `${fechaBorrar} 00:00:00`;
              const hasta = `${fechaBorrar} 23:59:59`;
              const { error } = await supabase
                .from("desabasto_registros")
                .delete()
                .gte("fecha_carga", desde)
                .lte("fecha_carga", hasta);
              if (error) throw error;
              notify(`✅ Registros del ${fechaBorrar} eliminados.`);
            } catch (e) {
              notify(`❌ Error: ${e.message}`);
            }
          }}
          className="bg-red-600 hover:bg-red-700 text-white"
        >
          Borrar registros
        </Button>
        <Button onClick={() => setVista("menu")} className="bg-gray-700 hover:bg-gray-800 text-white">
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Vistas Opción 4: Borrar TODOS ====
  const borrarTodoView = (
    <Card title="Borrar todos los registros de Desabasto">
      <div className="space-y-3">
        <p className="text-gray-700">
          Esta acción eliminará <b>todos</b> los registros de <code>desabasto_registros</code>. Proceda con precaución.
        </p>
        <Button
          onClick={async () => {
            try {
              if (!window.confirm("¿Seguro que desea eliminar todos los registros de DESABASTO?")) return;
              const { error } = await supabase.from("desabasto_registros").delete().neq("id", 0);
              if (error) throw error;
              notify("✅ Todos los registros de Desabasto fueron eliminados.");
            } catch (e) {
              notify(`❌ Error: ${e.message}`);
            }
          }}
          className="bg-red-700 hover:bg-red-800 text-white"
        >
          Borrar todos los registros
        </Button>
        <Button onClick={() => setVista("menu")} className="bg-gray-700 hover:bg-gray-800 text-white">
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Opción 5: Borrar archivos Excel en Descargas (File System Access API) ====
  const isFSASupported = typeof window !== "undefined" && "showDirectoryPicker" in window;
  const [dirHandle, setDirHandle] = useState(null);
  const [excelFiles, setExcelFiles] = useState([]); // [{name,size,lastModified,handle}]
  const [selected, setSelected] = useState({}); // name -> boolean
  const [selectAll, setSelectAll] = useState(false);

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    let n = bytes;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n.toFixed(1)} ${units[i]}`;
    }

 // ==== NUEVA FUNCIÓN CORREGIDA ====
  const pickDownloadsDir = async () => {
    try {
      if (!isFSASupported) {
        notify("El navegador no permite acceso directo a carpetas. Haga la limpieza manual en Descargas.");
        return;
      }

      const handle = await window.showDirectoryPicker();
      if (!handle) {
        notify("No se seleccionó ninguna carpeta.");
        return;
      }

      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        notify("Permiso denegado. No se puede listar ni eliminar archivos.");
        return;
      }

      // ==== Función recursiva para leer archivos en subcarpetas ====
      async function leerArchivosRecursivo(dirHandle, basePath = "") {
        const archivos = [];
        for await (const [name, entry] of dirHandle.entries()) {
          if (entry.kind === "file" && /\.(xls|xlsx)$/i.test(name)) {
            try {
              const file = await entry.getFile();
              archivos.push({
                name: basePath ? `${basePath}/${name}` : name,
                size: file.size,
                lastModified: file.lastModified,
                handle: entry,
              });
            } catch {
              // Ignorar errores de lectura individual
            }
          } else if (entry.kind === "directory") {
            const subArchivos = await leerArchivosRecursivo(entry, basePath ? `${basePath}/${name}` : name);
            archivos.push(...subArchivos);
          }
        }
        return archivos;
      }

      const files = await leerArchivosRecursivo(handle);
      files.sort((a, b) => a.name.localeCompare(b.name));

      setDirHandle(handle);
      setExcelFiles(files);

      const sel = {};
      files.forEach((f) => (sel[f.name] = false));
      setSelected(sel);
      setSelectAll(false);

      if (files.length === 0) notify("No se encontraron archivos .xls o .xlsx en la carpeta seleccionada.");
      else notify(`Se encontraron ${files.length} archivos Excel en la carpeta seleccionada.`);
    } catch (e) {
      // Ignorar abortos del diálogo
      if (e && e.name === "AbortError") return;
      notify(`❌ Error al abrir carpeta: ${e.message}`);
    }
  };

  const toggleSelectAll = () => {
    const nuevo = {};
    const nuevoValor = !selectAll;
    excelFiles.forEach((f) => (nuevo[f.name] = nuevoValor));
    setSelected(nuevo);
    setSelectAll(nuevoValor);
  };

  const deleteSelectedFiles = async () => {
    try {
      if (!dirHandle) {
        notify("Primero seleccione la carpeta de Descargas.");
        return;
      }
      const toDelete = excelFiles.filter((f) => selected[f.name]);
      if (toDelete.length === 0) {
        notify("No hay archivos seleccionados para eliminar.");
        return;
      }
      if (!window.confirm(`¿Eliminar ${toDelete.length} archivo(s) seleccionado(s)?`)) return;

      // Confirmar permiso de escritura antes de operar
      const perm = await dirHandle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        notify("Permiso de escritura denegado. No es posible eliminar archivos.");
        return;
      }

      let ok = 0;
      let fail = 0;
      for (const f of toDelete) {
        try {
          await dirHandle.removeEntry(f.name);
          ok++;
        } catch {
          fail++;
        }
      }

      // Actualizar listado
      const remaining = excelFiles.filter((f) => !selected[f.name]);
      setExcelFiles(remaining);
      const sel = {};
      remaining.forEach((f) => (sel[f.name] = false));
      setSelected(sel);
      setSelectAll(false);

      if (fail === 0) notify(`✅ Eliminados ${ok} archivo(s).`);
      else notify(`⚠️ Eliminados ${ok}. Fallaron ${fail}. Verifique permisos o bloqueos del sistema.`);
    } catch (e) {
      notify(`❌ Error al eliminar: ${e.message}`);
    }
  };

  const borrarArchivosView = (
    <Card title="Borrar archivos .xlsx/.xls en Descargas">
      <div className="space-y-3 text-left">
        {!isFSASupported && (
          <p className="text-sm text-gray-700">
            Este navegador no soporta acceso directo al sistema de archivos. Borre manualmente los Excel desde Descargas.
          </p>
        )}

        <Button
          onClick={pickDownloadsDir}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          Seleccionar carpeta Descargas
        </Button>

        {excelFiles.length > 0 && (
          <div className="border rounded-lg p-3 max-h-72 overflow-auto">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={toggleSelectAll}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-800 font-semibold">Seleccionar todo</span>
              </label>
              <span className="text-sm text-gray-600">
                {Object.values(selected).filter(Boolean).length} seleccionados
              </span>
            </div>
            <ul className="space-y-2">
              {excelFiles.map((f) => (
                <li key={f.name} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={!!selected[f.name]}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setSelected((prev) => ({ ...prev, [f.name]: v }));
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-gray-800 truncate max-w-[12rem]" title={f.name}>{f.name}</span>
                  </label>
                  <div className="text-xs text-gray-600 flex flex-col items-end">
                    <span>{formatBytes(f.size)}</span>
                    <span>
                      {new Date(f.lastModified).toLocaleString("es-CR", {
                        hour12: false,
                      })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={deleteSelectedFiles}
            className="bg-red-600 hover:bg-red-700 text-white"
            disabled={!dirHandle || excelFiles.length === 0}
          >
            🗑️ Eliminar seleccionados
          </Button>
          <Button
            onClick={() => {
              setDirHandle(null);
              setExcelFiles([]);
              setSelected({});
              setSelectAll(false);
              notify("Limpieza de selección realizada.");
            }}
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            Limpiar selección
          </Button>
        </div>

        <Button onClick={() => setVista("menu")} className="bg-gray-700 hover:bg-gray-800 text-white">
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Opción 6: Resetear clave (popup unificado) ====
  const resetClaveView = (
    <Card title="Resetear clave de usuario">
      <div className="space-y-3">
        <input
          type="tel"
          placeholder="Teléfono del usuario"
          value={telefonoReset}
          onChange={(e) => {
            const val = e.target.value.replace(/[^0-9]/g, "");
            setTelefonoReset(val);
          }}
          className="w-full border border-gray-300 rounded-lg p-2 text-gray-800 focus:ring-2 focus:ring-yellow-500"
          autoFocus
        />

        <Button
          onClick={async () => {
            try {
              if (!telefonoReset) {
                notify("⚠️ Debe ingresar un número válido.");
                return;
              }

              const { data: agenteData, error: errorAgente } = await supabase
                .from("agentes")
                .select("telefono")
                .eq("telefono", telefonoReset);

              if (errorAgente) throw errorAgente;
              if (!agenteData || agenteData.length === 0) {
                notify("⚠️ Usuario no encontrado.");
                return;
              }

              const { error: updateError } = await supabase
                .from("agentes")
                .update({
                  clave: bcrypt.hashSync("1234", 10),
                  clave_temporal: true,
                })
                .eq("telefono", telefonoReset);

              if (updateError) throw updateError;

              notify("✅ Clave restablecida a '1234'.");
            } catch (e) {
              notify(`❌ Error: ${e.message}`);
            }
          }}
          className="bg-yellow-500 hover:bg-yellow-600 text-white"
        >
          Resetear clave
        </Button>

        <Button
          onClick={() => setVista("menu")}
          className="bg-gray-700 hover:bg-gray-800 text-white"
        >
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== Opción 7: Crear supervisor ====
  const crearSupervisorView = (
    <Card title="Crear supervisor (clave cifrada)">
      <div className="space-y-3">
        <Input
          placeholder="Teléfono"
          value={telefonoSupervisor}
          onChange={(e) => setTelefonoSupervisor(e.target.value)}
        />
        <Input
          placeholder="Nombre completo"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
        <select
          value={acceso}
          onChange={(e) => setAcceso(e.target.value)}
          className="w-full border rounded-lg p-2 text-gray-800"
        >
          <option value="regional">Regional</option>
          <option value="global">Global</option>
        </select>
        {acceso === "regional" && (
          <Input
            placeholder="Región"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        )}
        <Button
          onClick={async () => {
            try {
              if (!telefonoSupervisor || !nombre) {
                notify("Debe ingresar teléfono y nombre.");
                return;
              }

              const claveTemporal = "1234";
              const { error } = await supabase.from("agentes").insert([
                {
                  telefono: telefonoSupervisor,
                  nombre,
                  vendedor_raw: nombre,
                  region: acceso === "global" ? null : region || null,
                  supervisor: "supervisor",
                  activo: true,
                  tipo: "supervisor",
                  acceso,
                  clave_temporal: true,
                },
              ]);
              if (error) throw error;
              notify(`✅ Supervisor creado (${acceso}) con clave temporal '${claveTemporal}'.`);
            } catch (e) {
              notify(`❌ Error: ${e.message}`);
            }
          }}
          className="bg-blue-500 hover:bg-blue-600 text-white"
        >
          Crear supervisor
        </Button>
        <Button
          onClick={() => setVista("menu")}
          className="bg-gray-700 hover:bg-gray-800 text-white"
        >
          ← Volver al menú
        </Button>
      </div>
    </Card>
  );

  // ==== MENÚ PRINCIPAL (7 opciones) ====
  const menuPrincipal = (
    <Card title="Administración de Plataforma">
      <div className="space-y-3">
        <Button onClick={() => setVista("cargarArchivo")} className="bg-blue-600 hover:bg-blue-700 text-white">
          1️⃣ Actualizar Base Desabasto
        </Button>
        <Button onClick={() => setVista("cargaMaestro")} className="bg-teal-600 hover:bg-teal-700 text-white">
          2️⃣ Actualizar Maestro Clientes
        </Button>
        <Button onClick={() => setVista("borrarFecha")} className="bg-red-600 hover:bg-red-700 text-white">
          3️⃣ Borrar registros por fecha (Desabasto)
        </Button>
        <Button onClick={() => setVista("borrarTodo")} className="bg-red-700 hover:bg-red-800 text-white">
          4️⃣ Borrar todos los registros (Desabasto)
        </Button>
        <Button onClick={() => setVista("borrarArchivos")} className="bg-orange-500 hover:bg-orange-600 text-white">
          5️⃣ Borrar archivos Excel Descargas
        </Button>
        <Button onClick={() => setVista("resetClave")} className="bg-yellow-500 hover:bg-yellow-600 text-white">
          6️⃣ Reset clave de usuario
        </Button>
        <Button onClick={() => setVista("crearSupervisor")} className="bg-blue-500 hover:bg-blue-600 text-white">
          7️⃣ Crear supervisor
        </Button>

        <Button onClick={onVolver} className="bg-gray-700 hover:bg-gray-800 text-white mt-2">
          🔙 Salir / Volver al menú principal
        </Button>
      </div>
    </Card>
  );

  // ==== Render principal ====
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-6 overflow-y-auto">
      {vista === "menu" && menuPrincipal}
      {vista === "cargarArchivo" && cargarArchivoView}
      {vista === "cargaMaestro" && cargaMaestroView}
      {vista === "borrarFecha" && borrarFechaView}
      {vista === "borrarTodo" && borrarTodoView}
      {vista === "borrarArchivos" && borrarArchivosView}
      {vista === "resetClave" && resetClaveView}
      {vista === "crearSupervisor" && crearSupervisorView}

      {/* Modal de progreso global */}
      {<ProgressModal />}

      {/* Popup de información unificado */}
      {mostrarPopupInfo && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl text-center max-w-sm w-[90%]">
            <p className="text-gray-800 text-lg font-medium mb-4 whitespace-pre-line">
              {textoPopupInfo}
            </p>
            <Button
              onClick={() => setMostrarPopupInfo(false)}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              Cerrar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
