/* eslint-disable no-unused-vars */
/* ============================================================================
   AdminToolsPanel.jsx — v1.2.1 Unificado
   - Mantiene opciones 1–7 existentes.
   - Opción 5: File System Access API para borrar .xls/.xlsx en carpeta elegida.
   - Mensajería unificada en POPUPS (sin texto fuera de tarjeta).
   - NUEVO: Opción 8 — “Comparar y Actualizar Maestro Clientes”
       • Carga Excel y normaliza como opción 2.
       • Cruza con Supabase por (id_cliente, tae).
       • Clasifica en: Iguales, Diferentes (diff campo a campo), Nuevos.
       • Permite marcar qué campos actualizar de cada registro diferente.
       • Permite seleccionar qué nuevos insertar.
       • Aplica actualizaciones parciales y altas nuevas.
   ============================================================================ 
   + NUEVO: Opción 9 — “Crear Agente Sellout”
       • Formulario en el mismo flujo de tarjetas (popup unificado visual) del panel.
       • Valida duplicado por teléfono.
       • Genera vendedor_raw, ruta_excel, ruta_normalizada.
       • Cifra clave con bcryptjs.
       • Inserta en tabla `agentes` con campos mínimos funcionales.
   ============================================================================ 
*/

import { useRef, useState, useMemo } from "react";
import supabase from "../../../supabaseAdminClient";
import * as XLSX from "xlsx";
import bcrypt from "bcryptjs";

// ============================================================================
// ADMINISTRACIÓN DE PLATAFORMA — Panel Web (8 opciones + NUEVA opción 9)
// ============================================================================
export default function AdminToolsPanel({ onVolver }) {
  // ==== Estados generales ====
  const [vista, setVista] = useState("menu");

  // ==== Estados de progreso global (cargas / procesos largos) ====
  const [loading, setLoading] = useState(false);
  const [progreso, setProgreso] = useState(0);
  const [detalleProgreso, setDetalleProgreso] = useState("");
  // ==== Estados comparador maestro ====
  const [diferencias, setDiferencias] = useState([]);
  const [nuevos, setNuevos] = useState([]);
  const [seleccionados, setSeleccionados] = useState({});

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

  // ==== Archivo en memoria para opciones 1 y 2 ====
  const [archivo, setArchivo] = useState(null);

  // ==== NUEVO — Estados Opción 9: Crear Agente Sellout ====
  const [sellTelefono, setSellTelefono] = useState("");
  const [sellNombre, setSellNombre] = useState("");
  const [sellRegion, setSellRegion] = useState("");
  const [sellSupervisor, setSellSupervisor] = useState("");
  const [sellClave, setSellClave] = useState("");
  const [sellClave2, setSellClave2] = useState("");
  const [sellLoading, setSellLoading] = useState(false);

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

  const allowedColumns = [
  "fuente_archivo",
  "mdn_usuario",
  "pdv",
  "saldo",
  "ultimo_uso_de_mis_recargas",
  "promadio_diario",
  "saldo_menor_al_promedio_diario",
  "promedio_semanal",
  "compro_saldo_hoy",
  "monto_comprado",
  "fecha_ultima_compra",
  "vendedor",
  "monto_recargado_este_mes",
  "promedio_recargado_en_los_ultimos_3_meses",
  "canal",
  "agrupacion",
  "jerarquias_n2_region",
  "jerarquias_n3_ruta",
  "id_socio",
  "region_comercial",
  "abastecimiento"
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

      // leer archivo
      const data = await archivo.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const hoja = workbook.SheetNames[0];

      // cabecera usual en fila 3 → range: 2
      const { json: jsonOriginal } = sheetToJsonRobusto(
        workbook.Sheets[hoja],
        { range: 2 }
      );

      // normalización
      const jsonNorm = jsonOriginal.map((row, idx, arr) => {
        if (arr.length > 0 && idx % 50 === 0) {
          const pct = Math.round((idx / arr.length) * 20);
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

      // detectar columna de estado
      const cols = Object.keys(jsonNorm[0]);
      const colSaldo = pickColSaldoMenorPromedio(cols);

      let filtrados = jsonNorm;
      let excluidos = 0;

      // excluir filas con estado "Normal"
      if (colSaldo) {
        filtrados = jsonNorm.filter(
          (r) => String(r[colSaldo] ?? "").trim().toLowerCase() !== "normal"
        );
        excluidos = jsonNorm.length - filtrados.length;
      }

      // construir solo filas con columnas existentes en la tabla
      const procesados = filtrados.map((r) => {
        const soloPermitidos = {};

        // columna obligatoria
        soloPermitidos.fuente_archivo = archivo.name;

        for (const key of Object.keys(r)) {
          if (allowedColumns.includes(key)) {
            soloPermitidos[key] =
              r[key] === "" || r[key] === "NaN" || r[key] === "nan"
                ? null
                : r[key];
          }
        }

        // NO agregamos fecha_carga ni fecha_carga_cr → lo hace el trigger
        return soloPermitidos;
      });

      console.log("=== allowedColumns ===");
      console.log(allowedColumns);

      console.log("=== Primer registro procesado ===");
      console.log(procesados[0]);

      const total = procesados.length;
      if (total === 0) {
        setProgressDetalle("Sin filas válidas");
        setProgressPct(100);
        setProgressTerminado(true);
        notify("No hay filas válidas para insertar.");
        return;
      }

      // insertar por lotes
      const lote = 500;
      let insertados = 0;

      for (let i = 0; i < total; i += lote) {
        const subset = procesados.slice(i, i + lote);
        if (subset.length === 0) continue;

        const { error } = await supabase
          .from("desabasto_registros")
          .insert(subset);

        if (error) throw error;

        insertados += subset.length;
        const pct = Math.round(20 + (insertados / total) * 80);
        setProgreso(Math.round((insertados / total) * 100));
        setDetalleProgreso(`${insertados}/${total}`);
        setProgressPct(pct);
        setProgressDetalle(
          `Insertando lote ${(i / lote) + 1}/${Math.ceil(total / lote)}`
        );
      }

      setProgressDetalle("Completado");
      setProgressPct(100);
      setProgressTerminado(true);

      const msgBase = `Registros insertados desde ${archivo.name}: ${insertados}`;
      const msgExtra =
        excluidos > 0 ? ` (excluidos ${excluidos} con estado 'Normal')` : "";
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
        </div>

        {/* === Selector de archivo corregido === */}
        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInput1Ref}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setArchivo(file);
              if (file) notify(`Archivo seleccionado: ${file.name}`);
            }}
          />
          <div className="flex items-center border border-gray-300 rounded-lg p-2 bg-white">
            <span className="flex-1 text-gray-700 truncate">
              {archivo ? archivo.name : "No file chosen"}
            </span>
            <button
              type="button"
              onClick={() => fileInput1Ref.current?.click()}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm"
            >
              Elegir
            </button>
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

  // ==== Vistas Opción 2: Cargar Maestro Clientes (upsert only new, ignore duplicates) ====
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
        </div>

        {/* === Selector de archivo corregido === */}
        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInput1Ref}
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0] || null;
              setArchivo(file);
              if (file) notify(`Archivo seleccionado: ${file.name}`);
            }}
          />
          <div className="flex items-center border border-gray-300 rounded-lg p-2 bg-white">
            <span className="flex-1 text-gray-700 truncate">
              {archivo ? archivo.name : "No file chosen"}
            </span>
            <button
              type="button"
              onClick={() => fileInput1Ref.current?.click()}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm"
            >
              Elegir
            </button>
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

              const mapa = EXCEL_TO_CLIENTES_MAP;
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

              normalizarDiasSemana(datos);
              normalizarFechasExcel(datos, ["fecha_ingreso", "cumpleanos"]);

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
                `✅ Maestro actualizado (solo nuevos, duplicados ignorados).\nTotal: ${c.total}\nActivos: ${c.activos}\nInactivos: ${c.inactivos}`
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
  // ==== Opción 5: Borrar archivos Excel en carpeta elegida (File System Access API) ====
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
  };

  const pickDownloadsDir = async () => {
    try {
      if (!isFSASupported) {
        notify("El navegador no permite acceso directo a carpetas. Haga la limpieza manual.");
        return;
      }
      // Sugerir Downloads si el navegador lo permite; puede fallar en carpetas protegidas.
      let handle = null;
      try {
        handle = await window.showDirectoryPicker({ startIn: "downloads" });
      } catch (e) {
        if (e?.name === "AbortError") return; // cancelado
        // fallback sin startIn
        handle = await window.showDirectoryPicker();
      }
      if (!handle) {
        notify("No se seleccionó ninguna carpeta.");
        return;
      }

      const perm = await handle.requestPermission({ mode: "readwrite" });
      if (perm !== "granted") {
        notify("Permiso denegado. No se puede listar ni eliminar archivos.");
        return;
      }

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
            const subArchivos = await leerArchivosRecursivo(
              entry,
              basePath ? `${basePath}/${name}` : name
            );
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

      if (files.length === 0)
        notify("No se encontraron archivos .xls o .xlsx en la carpeta seleccionada.");
      else notify(`Se encontraron ${files.length} archivos Excel en la carpeta seleccionada.`);
    } catch (e) {
      if (e && (e.name === "AbortError" || e.name === "NotAllowedError" || e.name === "SecurityError")) {
        notify(
          "El navegador bloqueó la carpeta. Cree una subcarpeta (por ejemplo, 'ExcelDistel') dentro de Descargas y selecciónela."
        );
        return;
      }
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
        notify("Primero seleccione la carpeta.");
        return;
      }
      const toDelete = excelFiles.filter((f) => selected[f.name]);
      if (toDelete.length === 0) {
        notify("No hay archivos seleccionados para eliminar.");
        return;
      }
      if (!window.confirm(`¿Eliminar ${toDelete.length} archivo(s) seleccionado(s)?`)) return;

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

      const remaining = excelFiles.filter((f) => !selected[f.name]);
      setExcelFiles(remaining);
      const sel = {};
      remaining.forEach((f) => (sel[f.name] = false));
      setSelected(sel);
      setSelectAll(false);

      if (fail === 0) notify(`✅ Eliminados ${ok} archivo(s).`);
      else notify(`⚠️ Eliminados ${ok}. Fallaron ${fail}. Verifique permisos o bloqueos.`);
    } catch (e) {
      notify(`❌ Error al eliminar: ${e.message}`);
    }
  };

  const borrarArchivosView = (
    <Card title="Borrar archivos .xlsx/.xls en carpeta elegida">
      <div className="space-y-3 text-left">
        {!isFSASupported && (
          <p className="text-sm text-gray-700">
            Este navegador no soporta acceso directo al sistema de archivos. Borre manualmente los Excel.
          </p>
        )}

        <Button onClick={pickDownloadsDir} className="bg-orange-500 hover:bg-orange-600 text-white">
          Seleccionar carpeta
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
                    <span className="text-sm text-gray-800 truncate max-w-[12rem]" title={f.name}>
                      {f.name}
                    </span>
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
  // ========================================================================
  // Opción 8: Comparar y Actualizar Maestro Clientes (diff + upsert selectivo)
  // ========================================================================
  const EXCEL_TO_CLIENTES_MAP = {
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

  // Estados de comparación
  const [cmpArchivo, setCmpArchivo] = useState(null);
  const [cmpIguales, setCmpIguales] = useState([]); // [{id_cliente, tae}]
  const [cmpDiferentes, setCmpDiferentes] = useState([]); // [{key, id_cliente, tae, diffs: {campo:{db,excel,selected}}}]
  const [cmpNuevos, setCmpNuevos] = useState([]); // [{rowExcel}]
  const [cmpSeleccionNuevos, setCmpSeleccionNuevos] = useState({}); // key -> boolean
  const [cmpTab, setCmpTab] = useState("diferentes"); // 'diferentes' | 'nuevos' | 'iguales'

  const keyOf = (id_cliente, tae) => `${String(id_cliente)}::${String(tae)}`;

  const normalizarDiasSemana = (datos) => {
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
  };

  const toYYYYMMDD = (x) => {
    if (!x) return null;
    const dt = new Date(x);
    if (isNaN(dt.getTime())) return null;
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  const normalizarFechasExcel = (arr, campos) => {
    for (const row of arr) {
      for (const c of campos) {
        if (c in row) row[c] = toYYYYMMDD(row[c]);
      }
    }
  };

  // Campos comparables por defecto
  const CAMPOS_COMPARABLES = useMemo(
    () => [
      "id_cliente",
      "tae",
      "id_ruta",
      "nombre_ruta",
      "id_sede",
      "nombre_sede",
      "tipo_cliente",
      "pdv",
      "direccion",
      "provincia",
      "canton",
      "distrito",
      "contacto",
      "cedula",
      "telefono",
      "correo",
      "visita",
      "geo",
      "lunes",
      "martes",
      "miercoles",
      "jueves",
      "viernes",
      "sabado",
      "domingo",
      "fecha_ingreso",
      "credito",
      "dias",
      "id_punto",
      "tipo_punto",
      "barrio",
      "cumpleanos",
      "id_rdt",
      "estatus",
    ],
    []
  );

  const [cmpLoading, setCmpLoading] = useState(false);

  const cargarYCompararMaestro = async (archivoExcel) => {
    try {
      setCmpLoading(true);
      setProgressTitulo("Comparando Maestro Clientes");
      setProgressPct(0);
      setProgressDetalle("Leyendo Excel...");
      setProgressTerminado(false);
      setMostrarProgress(true);

      const data = await archivoExcel.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const hoja = workbook.SheetNames[0];
      const { json } = sheetToJsonRobusto(workbook.Sheets[hoja], { defval: null });

      // Normalizar columnas usando el mapa
      const datosExcel = json.map((r) => {
        const limpio = {};
        for (const [k, v] of Object.entries(r)) {
          const destino = EXCEL_TO_CLIENTES_MAP[k] || null;
          if (!destino) continue;
          if (typeof v === "string") {
            const t = v.trim();
            limpio[destino] = t === "" || t.toLowerCase() === "nan" ? null : t;
          } else {
            limpio[destino] = v;
          }
        }
        return limpio;
      });

      normalizarDiasSemana(datosExcel);
      normalizarFechasExcel(datosExcel, ["fecha_ingreso", "cumpleanos"]);

      const excelValidos = datosExcel.filter((r) => r.id_cliente != null && r.tae != null);
      if (excelValidos.length === 0) {
        setProgressDetalle("Sin registros válidos");
        setProgressPct(100);
        setProgressTerminado(true);
        notify("El archivo no contiene filas con id_cliente y tae.");
        return;
      }

      // Construir set de id_cliente para limitar query
      const ids = Array.from(new Set(excelValidos.map((r) => String(r.id_cliente))));
      const lote = 300;
      const existentes = [];
      for (let i = 0; i < ids.length; i += lote) {
        const sub = ids.slice(i, i + lote);
        setProgressDetalle(`Consultando Supabase (${i + 1}-${Math.min(i + lote, ids.length)}/${ids.length})`);
        setProgressPct(10 + Math.round(((i + sub.length) / ids.length) * 40)); // 10-50%
        // Traemos varios campos relevantes
        const { data, error } = await supabase
          .from("clientes")
          .select(
            [
              "id_cliente",
              "tae",
              "id_ruta",
              "nombre_ruta",
              "id_sede",
              "nombre_sede",
              "tipo_cliente",
              "pdv",
              "direccion",
              "provincia",
              "canton",
              "distrito",
              "contacto",
              "cedula",
              "telefono",
              "correo",
              "visita",
              "geo",
              "lunes",
              "martes",
              "miercoles",
              "jueves",
              "viernes",
              "sabado",
              "domingo",
              "fecha_ingreso",
              "credito",
              "dias",
              "id_punto",
              "tipo_punto",
              "barrio",
              "cumpleanos",
              "id_rdt",
              "estatus",
            ].join(",")
          )
          .in("id_cliente", sub);
        if (error) throw error;
        if (Array.isArray(data)) existentes.push(...data);
      }

      // Indexar existentes por (id_cliente, tae)
      const mapExistentes = new Map();
      for (const r of existentes) mapExistentes.set(keyOf(r.id_cliente, r.tae), r);

      // Comparar
      const iguales = [];
      const diferentes = [];
      const nuevos = [];

      excelValidos.forEach((exRow, idx) => {
        if (idx % 50 === 0) {
          setProgressDetalle(`Comparando ${idx + 1}/${excelValidos.length}`);
          setProgressPct(50 + Math.round((idx / excelValidos.length) * 40)); // 50-90%
        }
        const k = keyOf(exRow.id_cliente, exRow.tae);
        const dbRow = mapExistentes.get(k);
        if (!dbRow) {
          nuevos.push({ key: k, rowExcel: exRow });
          return;
        }
        // comparar campo a campo
        const diffs = {};
        let tieneDiff = false;
        for (const campo of CAMPOS_COMPARABLES) {
          if (campo === "id_cliente" || campo === "tae") continue;
          const vDB = dbRow[campo] ?? null;
          const vXLS = exRow[campo] ?? null;
          // Normalizar a string para comparar fechas y números simples
          const norm = (v) => (v === null || v === undefined ? null : String(v));
          if (norm(vDB) !== norm(vXLS)) {
            tieneDiff = true;
            diffs[campo] = { db: vDB, excel: vXLS, selected: false };
          }
        }
        if (tieneDiff) {
          diferentes.push({ key: k, id_cliente: exRow.id_cliente, tae: exRow.tae, diffs });
        } else {
          iguales.push({ id_cliente: exRow.id_cliente, tae: exRow.tae });
        }
      });

      setCmpArchivo(archivoExcel.name);
      setCmpIguales(iguales);
      setCmpDiferentes(diferentes);
      setCmpNuevos(nuevos);
      const selN = {};
      nuevos.forEach((n) => (selN[n.key] = false));
      setCmpSeleccionNuevos(selN);
      setCmpTab(diferentes.length > 0 ? "diferentes" : nuevos.length > 0 ? "nuevos" : "iguales");

      setProgressDetalle("Listo");
      setProgressPct(100);
      setProgressTerminado(true);
      notify(
        `✅ Comparación lista.\nIguales: ${iguales.length}\nDiferentes: ${diferentes.length}\nNuevos: ${nuevos.length}`
      );
    } catch (e) {
      setProgressDetalle("Error");
      setProgressPct(100);
      setProgressTerminado(true);
      notify(`❌ Error en comparación: ${e.message}`);
    } finally {
      setCmpLoading(false);
    }
  };

  const aplicarCambiosSeleccionados = async () => {
    try {
      // Recolectar updates
      const updates = [];
      for (const item of cmpDiferentes) {
        const payload = {};
        for (const [campo, info] of Object.entries(item.diffs)) {
          if (info.selected) payload[campo] = info.excel;
        }
        if (Object.keys(payload).length > 0) {
          updates.push({ id_cliente: item.id_cliente, tae: item.tae, payload });
        }
      }

      // Recolectar inserts
      const inserts = cmpNuevos
        .filter((n) => cmpSeleccionNuevos[n.key])
        .map((n) => {
          const row = { ...n.rowExcel };
          if (!row["fecha_creacion"]) row["fecha_creacion"] = ahoraCostaRica();
          return row;
        });

      if (updates.length === 0 && inserts.length === 0) {
        notify("No hay cambios seleccionados para aplicar.");
        return;
      }

      setProgressTitulo("Aplicando cambios en Supabase");
      setProgressPct(0);
      setProgressDetalle("Preparando...");
      setProgressTerminado(false);
      setMostrarProgress(true);

      // Aplicar updates uno por uno o en pequeños lotes
      let done = 0;
      const totalOps = updates.length + inserts.length;
      for (const u of updates) {
        const { error } = await supabase
          .from("clientes")
          .update(u.payload)
          .eq("id_cliente", u.id_cliente)
          .eq("tae", u.tae);
        if (error) throw error;
        done++;
        setProgressDetalle(`Actualizando ${done}/${totalOps}`);
        setProgressPct(Math.min(95, Math.round((done / totalOps) * 95)));
      }

      // Aplicar inserts en lotes
      if (inserts.length > 0) {
        const lote = 500;
        for (let i = 0; i < inserts.length; i += lote) {
          const subset = inserts.slice(i, i + lote);
          const { error } = await supabase.from("clientes").insert(subset);
          if (error) throw error;
          done += subset.length;
          setProgressDetalle(`Insertando ${done}/${totalOps}`);
          setProgressPct(Math.min(95, Math.round((done / totalOps) * 95)));
        }
      }

      setProgressDetalle("Completado");
      setProgressPct(100);
      setProgressTerminado(true);
      notify(
        `✅ Cambios aplicados.\nActualizados: ${updates.length}\nInsertados: ${inserts.length}`
      );
    } catch (e) {
      setProgressDetalle("Error");
      setProgressPct(100);
      setProgressTerminado(true);
      notify(`❌ Error aplicando cambios: ${e.message}`);
    }
  };

  const DiffRow = ({ item }) => {
    // item: { key, id_cliente, tae, diffs: {campo:{db,excel,selected}} }
    const campos = Object.keys(item.diffs);
    return (
      <div className="border rounded-lg p-3 mb-3 text-left">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-gray-800">
            ID: {item.id_cliente} — TAE: {item.tae}
          </div>
          <div className="flex gap-2">
            <button
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={() => {
                const nuevo = {};
                for (const c of campos) nuevo[c] = { ...item.diffs[c], selected: true };
                // set state in place
                setCmpDiferentes((prev) =>
                  prev.map((x) => (x.key === item.key ? { ...x, diffs: nuevo } : x))
                );
              }}
            >
              Seleccionar todos
            </button>
            <button
              className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={() => {
                const nuevo = {};
                for (const c of campos) nuevo[c] = { ...item.diffs[c], selected: false };
                setCmpDiferentes((prev) =>
                  prev.map((x) => (x.key === item.key ? { ...x, diffs: nuevo } : x))
                );
              }}
            >
              Limpiar selección
            </button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-600">
                <th className="py-1 pr-2">Campo</th>
                <th className="py-1 px-2">Supabase</th>
                <th className="py-1 px-2">Excel</th>
                <th className="py-1 pl-2">Actualizar</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => {
                const info = item.diffs[campo];
                return (
                  <tr key={campo} className="border-t">
                    <td className="py-1 pr-2 font-medium text-gray-800">{campo}</td>
                    <td className="py-1 px-2 text-gray-700">{String(info.db ?? "")}</td>
                    <td className="py-1 px-2 text-red-700">{String(info.excel ?? "")}</td>
                    <td className="py-1 pl-2">
                      <input
                        type="checkbox"
                        checked={!!info.selected}
                        onChange={(e) => {
                          const v = e.target.checked;
                          setCmpDiferentes((prev) =>
                            prev.map((x) =>
                              x.key === item.key
                                ? {
                                    ...x,
                                    diffs: {
                                      ...x.diffs,
                                      [campo]: { ...x.diffs[campo], selected: v },
                                    },
                                  }
                                : x
                            )
                          );
                        }}
                        className="w-4 h-4"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const cmpView = (
    <Card title="8️⃣ Comparar y Actualizar Maestro Clientes">
      <div className="space-y-3 text-left">
        <div className="text-sm text-gray-700">
          Cargue un Excel con columnas del Maestro de Clientes. Se comparará contra Supabase y podrá
          aplicar cambios campo a campo o insertar nuevos.
        </div>

        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              await cargarYCompararMaestro(file);
            }}
            className="absolute inset-0 opacity-0 cursor-pointer z-10"
          />
        </div>

        {/* === Selector de archivo funcional (opción 8) === */}
        <div className="relative w-full">
          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInput2Ref}
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              setArchivo(file);
              notify(`Archivo seleccionado: ${file.name}`);
              await cargarYCompararMaestro(file); // <-- ejecuta la comparación inmediatamente
            }}
          />
          <div className="flex items-center border border-gray-300 rounded-lg p-2 bg-white">
            <span className="flex-1 text-gray-700 truncate">
              {archivo ? archivo.name : "No file chosen"}
            </span>
            <button
              type="button"
              onClick={() => fileInput2Ref.current?.click()}
              className="ml-2 px-3 py-1 bg-blue-600 text-white rounded-md cursor-pointer hover:bg-blue-700 text-sm"
            >
              Elegir y comparar
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <button
            className={`px-3 py-1 rounded text-sm ${
              cmpTab === "diferentes" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setCmpTab("diferentes")}
          >
            Diferentes ({cmpDiferentes.length})
          </button>
          <button
            className={`px-3 py-1 rounded text-sm ${
              cmpTab === "nuevos" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setCmpTab("nuevos")}
          >
            Nuevos ({cmpNuevos.length})
          </button>
          <button
            className={`px-3 py-1 rounded text-sm ${
              cmpTab === "iguales" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
            }`}
            onClick={() => setCmpTab("iguales")}
          >
            Iguales ({cmpIguales.length})
          </button>
        </div>

        <div className="max-h-[50vh] overflow-auto mt-1">
          {cmpTab === "diferentes" && (
            <>
              {cmpDiferentes.length === 0 ? (
                <p className="text-sm text-gray-600">No hay diferencias para mostrar.</p>
              ) : (
                cmpDiferentes.map((item) => <DiffRow key={item.key} item={item} />)
              )}
            </>
          )}

          {cmpTab === "nuevos" && (
            <>
              {cmpNuevos.length === 0 ? (
                <p className="text-sm text-gray-600">No hay nuevos para insertar.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <button
                      className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() => {
                        const all = {};
                        cmpNuevos.forEach((n) => (all[n.key] = true));
                        setCmpSeleccionNuevos(all);
                      }}
                    >
                      Seleccionar todos
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
                      onClick={() => {
                        const none = {};
                        cmpNuevos.forEach((n) => (none[n.key] = false));
                        setCmpSeleccionNuevos(none);
                      }}
                    >
                      Limpiar selección
                    </button>
                  </div>
                  {cmpNuevos.map((n) => (
                    <div key={n.key} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-800">
                          ID: {n.rowExcel.id_cliente} — TAE: {n.rowExcel.tae}
                        </div>
                        <input
                          type="checkbox"
                          checked={!!cmpSeleccionNuevos[n.key]}
                          onChange={(e) =>
                            setCmpSeleccionNuevos((prev) => ({ ...prev, [n.key]: e.target.checked }))
                          }
                          className="w-4 h-4"
                        />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
                        {CAMPOS_COMPARABLES.filter((c) => c !== "id_cliente" && c !== "tae").map((c) => (
                          <div key={c} className="bg-gray-50 rounded p-2">
                            <span className="font-medium">{c}:</span>{" "}
                            <span>{String(n.rowExcel[c] ?? "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {cmpTab === "iguales" && (
            <>
              {cmpIguales.length === 0 ? (
                <p className="text-sm text-gray-600">No hay registros idénticos.</p>
              ) : (
                <ul className="space-y-1 text-sm text-gray-700">
                  {cmpIguales.map((g, i) => (
                    <li key={`${g.id_cliente}-${g.tae}-${i}`} className="border rounded px-2 py-1">
                      ID: {g.id_cliente} — TAE: {g.tae}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={aplicarCambiosSeleccionados}
            className="bg-green-600 hover:bg-green-700 text-white"
            disabled={cmpLoading || (!cmpDiferentes.length && !cmpNuevos.length)}
          >
            Aplicar cambios seleccionados
          </Button>
          <Button onClick={() => setVista("menu")} className="bg-gray-700 hover:bg-gray-800 text-white">
            ← Volver al menú
          </Button>
        </div>
      </div>
    </Card>
  );
  // ===========================
  // NUEVO — Opción 9: Sellout
  // ===========================
  async function getNextSellCode(regionUpper) {
    const { data, error } = await supabase
      .from("agentes")
      .select("vendedor_raw, region, tipo")
      .eq("tipo", "sellout")
      .eq("region", regionUpper)
      .limit(1000);
    if (error) throw new Error("Error consultando códigos SELL: " + error.message);

    let maxNum = 0;
    for (const r of data || []) {
      const m = typeof r.vendedor_raw === "string" && r.vendedor_raw.match(/^SELL(\d+)-([A-Z0-9_ -]+)$/i);
      if (m && m[2]?.toUpperCase() === regionUpper) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    const next = maxNum + 1;
    const padded = next < 10 ? `0${next}` : `${next}`;
    return `SELL${padded}-${regionUpper}`;
  }

  async function handleCrearAgenteSellout() {
  try {
    const tel = sellTelefono.trim();
    const nom = sellNombre.trim();
    const reg = sellRegion.trim().toUpperCase();
    const sup = sellSupervisor.trim();
    const pass1 = sellClave;
    const pass2 = sellClave2;

    if (!/^\d{8,12}$/.test(tel)) {
      notify("Teléfono inválido. Use 8–12 dígitos.");
      return;
    }
    if (!nom) {
      notify("Nombre requerido.");
      return;
    }
    if (!reg) {
      notify("Región requerida.");
      return;
    }
    if (!sup) {
      notify("Supervisor requerido.");
      return;
    }
    if (!pass1 || pass1.length < 4) {
      notify("Clave mínima de 4 caracteres.");
      return;
    }
    if (pass1 !== pass2) {
      notify("Las claves no coinciden.");
      return;
    }

    setSellLoading(true);

    // Duplicado por teléfono
    const { data: dup, error: eDup } = await supabase
      .from("agentes")
      .select("id, telefono")
      .eq("telefono", tel)
      .limit(1)
      .maybeSingle();
    if (eDup) throw new Error("Error verificando duplicado: " + eDup.message);
    if (dup) {
      notify("Ya existe un agente con ese teléfono.");
      setSellLoading(false);
      return;
    }

    const hash = bcrypt.hashSync(pass1, 10);
    const { data, error } = await supabase.rpc("crear_agente_sellout", {
      p_telefono: tel,
      p_nombre: nom,
      p_region: reg,
      p_supervisor: sup,
      p_clave: hash,
    });

    if (error) notify("❌ Error creando agente SELL: " + error.message);
    else notify("✅ Agente Sellout creado exitosamente.");

    // limpiar campos
    setSellTelefono("");
    setSellNombre("");
    setSellRegion("");
    setSellSupervisor("");
    setSellClave("");
    setSellClave2("");
  } catch (err) {
    notify(`❌ Error: ${err.message || String(err)}`);
  } finally {
    setSellLoading(false);
  }
}
  const crearSelloutView = (
    <Card title="Crear Agente Sellout">
      <div className="space-y-3 text-left">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col">
            <span className="text-sm">Teléfono</span>
            <input
              type="text"
              className="mt-1 rounded-md border px-3 py-2"
              defaultValue={sellTelefono}
              onInput={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                e.target.value = digits;
              }}
              onBlur={(e) => setSellTelefono(e.target.value.replace(/\D/g, ""))}
              placeholder="88881234"
              maxLength={12}
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Nombre</span>
            <input
              type="text"
              className="mt-1 rounded-md border px-3 py-2"
              defaultValue={sellNombre}
              onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
              onBlur={(e) => setSellNombre(e.target.value.trim().toUpperCase())}
              placeholder="Vendedor Sellout GAM"
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Región</span>
            <input
              type="text"
              className="mt-1 rounded-md border px-3 py-2 uppercase"
              defaultValue={sellRegion}
              onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
              onBlur={(e) => setSellRegion(e.target.value.trim().toUpperCase())}
              placeholder="GAM"
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Supervisor</span>
            <input
              type="text"
              className="mt-1 rounded-md border px-3 py-2"
              defaultValue={sellSupervisor}
              onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
              onBlur={(e) => setSellSupervisor(e.target.value.trim().toUpperCase())}
              placeholder="Roger Bonilla"
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Clave inicial</span>
            <input
              type="password"
              className="mt-1 rounded-md border px-3 py-2"
              defaultValue={sellClave}
              onInput={(e) => { e.target.value = e.target.value.trim(); }}
              onBlur={(e) => setSellClave(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              required
            />
          </label>

          <label className="flex flex-col">
            <span className="text-sm">Confirmar clave</span>
            <input
              type="password"
              className="mt-1 rounded-md border px-3 py-2"
              defaultValue={sellClave2}
              onInput={(e) => { e.target.value = e.target.value.trim(); }}
              onBlur={(e) => setSellClave2(e.target.value)}
              placeholder="Repite la clave"
              required
            />

          </label>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={sellLoading}
            onClick={handleCrearAgenteSellout}
            className="px-4 py-2 rounded-md bg-black text-white disabled:opacity-60 w-full"
          >
            {sellLoading ? "Creando..." : "Crear"}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md border w-full"
            onClick={() => {
              setSellTelefono("");
              setSellNombre("");
              setSellRegion("");
              setSellSupervisor("");
              setSellClave("");
              setSellClave2("");
              setVista("menu");
            }}
          >
            Cancelar
          </button>
        </div>
        <div className="flex justify-center mt-4">
          <button
            onClick={() => setVista("menu")}
            className="bg-gray-700 hover:bg-gray-900 text-white px-6 py-3 rounded-2xl font-semibold shadow-md transition-transform transform hover:scale-105"
          >
            ← Volver al Menú de Herramientas
          </button>
        </div>
        
      </div>
    </Card>
  );

  // ==== MENÚ PRINCIPAL (8 opciones + NUEVA 9) ====
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
        <Button onClick={() => setVista("cmpMaestro")} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          8️⃣ Comparar y Actualizar Maestro Clientes
        </Button>
        {/* NUEVO botón opción 9 */}
        <Button onClick={() => setVista("crearSellout")} className="bg-black hover:bg-gray-900 text-white">
          9️⃣ Crear Agente Sellout
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
      {vista === "cmpMaestro" && cmpView}
      {vista === "crearSellout" && crearSelloutView}

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
