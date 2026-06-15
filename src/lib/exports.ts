import type ExcelJSType from "exceljs";
type ExcelJS = typeof ExcelJSType;
import { supabase } from "@/integrations/supabase/client";
import evecaLogo from "@/assets/eveca-logo.png.asset.json";

const BRAND_GREEN = "FF1F5A3D";
const BRAND_AMBER = "FFE8A33D";
const SOFT_GREEN = "FFEAF2EC";
const SOFT_GRAY = "FFF5F5F2";

function fmtDateTime(d = new Date()) {
  return d.toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function fmtFileStamp(d = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

async function fetchLogoBuffer(): Promise<ArrayBuffer> {
  const res = await fetch(evecaLogo.url);
  return await res.arrayBuffer();
}

function styleSheet(ws: ExcelJS.Worksheet, headers: string[], logoId: number) {
  ws.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 110, height: 60 } });
  ws.getRow(1).height = 50;
  ws.mergeCells(1, 1, 1, Math.max(headers.length, 4));

  ws.mergeCells(2, 1, 2, Math.max(headers.length, 4));
  const title = ws.getCell(2, 1);
  title.value = "EVECA · Extracción Sostenible — Reporte Integral de Sostenibilidad";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: BRAND_GREEN } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(2).height = 24;

  ws.mergeCells(3, 1, 3, Math.max(headers.length, 4));
  const sub = ws.getCell(3, 1);
  sub.value = `Generado: ${fmtDateTime()}`;
  sub.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF666666" } };
  sub.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(3).height = 18;

  // Header row
  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
    c.border = {
      top: { style: "thin", color: { argb: BRAND_GREEN } },
      bottom: { style: "thin", color: { argb: BRAND_GREEN } },
      left: { style: "thin", color: { argb: BRAND_GREEN } },
      right: { style: "thin", color: { argb: BRAND_GREEN } },
    };
  });
  headerRow.height = 28;
  ws.views = [{ state: "frozen", ySplit: 5 }];
}

function applyDataStyles(ws: ExcelJS.Worksheet, startRow: number, endRow: number, cols: number) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    const zebra = (r - startRow) % 2 === 1;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF333333" } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: zebra ? SOFT_GRAY : "FFFFFFFF" },
      };
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
      };
    }
  }
}

function autoWidth(ws: ExcelJS.Worksheet, headers: string[], rows: any[][]) {
  headers.forEach((h, i) => {
    let max = h.length;
    rows.forEach((r) => {
      const v = r[i];
      const len = v == null ? 0 : String(v).length;
      if (len > max) max = len;
    });
    ws.getColumn(i + 1).width = Math.min(Math.max(max + 4, 12), 40);
  });
}

async function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  headers: string[],
  rows: any[][],
  logoId: number,
) {
  const ws = wb.addWorksheet(name, {
    properties: { tabColor: { argb: BRAND_GREEN } },
    pageSetup: { orientation: "landscape", fitToPage: true, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  styleSheet(ws, headers, logoId);
  autoWidth(ws, headers, rows);

  if (rows.length === 0) {
    ws.mergeCells(6, 1, 6, headers.length);
    const c = ws.getCell(6, 1);
    c.value = "Sin registros";
    c.alignment = { horizontal: "center", vertical: "middle" };
    c.font = { italic: true, color: { argb: "FF999999" } };
    return;
  }

  rows.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    r.forEach((v, j) => (row.getCell(j + 1).value = v as any));
  });
  applyDataStyles(ws, 6, 6 + rows.length - 1, headers.length);
}

async function addCoverSheet(wb: ExcelJS.Workbook, logoId: number, stats: { table: string; count: number }[]) {
  const ws = wb.addWorksheet("Portada", { properties: { tabColor: { argb: BRAND_AMBER } } });
  ws.addImage(logoId, { tl: { col: 1, row: 1 }, ext: { width: 220, height: 120 } });
  ws.getColumn(1).width = 4;
  for (let c = 2; c <= 5; c++) ws.getColumn(c).width = 24;

  ws.mergeCells("B9:E9");
  const t = ws.getCell("B9");
  t.value = "Reporte Integral de Sostenibilidad";
  t.font = { name: "Calibri", size: 22, bold: true, color: { argb: BRAND_GREEN } };

  ws.mergeCells("B10:E10");
  const s = ws.getCell("B10");
  s.value = "EVECA · Extracción Sostenible";
  s.font = { name: "Calibri", size: 13, italic: true, color: { argb: "FF555555" } };

  ws.mergeCells("B12:E12");
  const d = ws.getCell("B12");
  d.value = `Fecha de generación: ${fmtDateTime()}`;
  d.font = { name: "Calibri", size: 11, color: { argb: "FF333333" } };

  ws.mergeCells("B14:E14");
  const h = ws.getCell("B14");
  h.value = "Contenido del documento";
  h.font = { name: "Calibri", size: 12, bold: true, color: { argb: "FFFFFFFF" } };
  h.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_GREEN } };
  ws.getRow(14).height = 22;

  stats.forEach((st, i) => {
    const r = 15 + i;
    ws.mergeCells(r, 2, r, 4);
    const a = ws.getCell(r, 2);
    a.value = st.table;
    a.font = { name: "Calibri", size: 11 };
    a.alignment = { indent: 1, vertical: "middle" };
    const b = ws.getCell(r, 5);
    b.value = `${st.count} registros`;
    b.font = { name: "Calibri", size: 11, bold: true, color: { argb: BRAND_GREEN } };
    b.alignment = { horizontal: "right" };
    const fill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i % 2 === 0 ? SOFT_GREEN : "FFFFFFFF" },
    };
    a.fill = fill; b.fill = fill;
    ws.getRow(r).height = 20;
  });

  const footerRow = 15 + stats.length + 2;
  ws.mergeCells(footerRow, 2, footerRow, 5);
  const f = ws.getCell(footerRow, 2);
  f.value = "Documento confidencial · Uso interno EVECA";
  f.font = { italic: true, size: 9, color: { argb: "FF888888" } };
}

const TABLES: { table: string; sheet: string }[] = [
  { table: "registros_efluentes", sheet: "Efluentes" },
  { table: "registros_ambiental", sheet: "Gestión Ambiental" },
  { table: "registros_zonas_verdes", sheet: "Zonas Verdes" },
  { table: "reportes", sheet: "Reportes" },
  { table: "profiles", sheet: "Usuarios" },
  { table: "notificaciones", sheet: "Notificaciones" },
];

export async function exportFullDatabaseExcel() {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EVECA Sostenibilidad";
  wb.created = new Date();

  const logoBuf = await fetchLogoBuffer();
  const logoId = wb.addImage({ buffer: logoBuf as any, extension: "png" });

  const stats: { table: string; count: number }[] = [];

  for (const t of TABLES) {
    const { data, error } = await supabase.from(t.table as any).select("*");
    if (error) {
      stats.push({ table: t.sheet, count: 0 });
      await addTableSheet(wb, t.sheet, ["Error"], [[error.message]], logoId);
      continue;
    }
    const rows = (data ?? []) as Record<string, any>[];
    const headers = rows.length > 0 ? Object.keys(rows[0]) : ["(sin columnas)"];
    const matrix = rows.map((r) =>
      headers.map((h) => {
        const v = r[h];
        if (v == null) return "";
        if (typeof v === "object") return JSON.stringify(v);
        return v;
      }),
    );
    stats.push({ table: t.sheet, count: rows.length });
    await addTableSheet(wb, t.sheet, headers, matrix, logoId);
  }

  await addCoverSheet(wb, logoId, stats);
  // Move cover first
  const sheets = wb.worksheets;
  const coverIdx = sheets.findIndex((s) => s.name === "Portada");
  if (coverIdx > 0) {
    const [cover] = sheets.splice(coverIdx, 1);
    sheets.unshift(cover);
    sheets.forEach((s, i) => ((s as any).orderNo = i));
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `EVECA_Reporte_Sostenibilidad_${fmtFileStamp()}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function exportDashboardImage(element: HTMLElement) {
  // Build a wrapper with branded header + footer around a clone of the dashboard
  const now = new Date();
  const wrap = document.createElement("div");
  wrap.style.position = "fixed";
  wrap.style.left = "-99999px";
  wrap.style.top = "0";
  wrap.style.width = `${Math.max(element.scrollWidth, 1280)}px`;
  wrap.style.background = "#f7faf6";
  wrap.style.padding = "32px";
  wrap.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

  wrap.innerHTML = `
    <div style="background:#fff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,.06);overflow:hidden;border:1px solid #e7ece4;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:20px 28px;background:linear-gradient(90deg,#1f5a3d 0%,#2d7a52 100%);color:#fff;">
        <div style="display:flex;align-items:center;gap:16px;">
          <div style="background:#fff;border-radius:10px;padding:6px 10px;">
            <img src="${evecaLogo.url}" alt="EVECA" style="height:48px;display:block;" crossorigin="anonymous" />
          </div>
          <div>
            <div style="font-size:20px;font-weight:700;letter-spacing:.3px;">EVECA · Extracción Sostenible</div>
            <div style="font-size:12px;opacity:.85;text-transform:uppercase;letter-spacing:1.5px;">Tablero de Indicadores de Sostenibilidad</div>
          </div>
        </div>
        <div style="text-align:right;font-size:12px;opacity:.95;">
          <div style="font-weight:600;">Descargado</div>
          <div>${fmtDateTime(now)}</div>
        </div>
      </div>
      <div id="__dash-clone" style="padding:24px;background:#f7faf6;"></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 28px;background:#1f5a3d;color:#fff;font-size:11px;letter-spacing:.5px;">
        <div>Documento generado automáticamente · Uso interno</div>
        <div>© ${now.getFullYear()} EVECA · Confidencial</div>
      </div>
    </div>
  `;

  const clone = element.cloneNode(true) as HTMLElement;
  wrap.querySelector("#__dash-clone")!.appendChild(clone);
  document.body.appendChild(wrap);

  // Wait a tick for layout
  await new Promise((r) => setTimeout(r, 200));

  try {
    const canvas = await html2canvas(wrap, {
      backgroundColor: "#f7faf6",
      scale: 2,
      useCORS: true,
      logging: false,
    });
    const blob: Blob = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/png", 1),
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EVECA_Dashboard_${fmtFileStamp(now)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } finally {
    wrap.remove();
  }
}
