// Heavy libs (exceljs, html2canvas) are dynamically imported inside the
// exported functions to avoid Vite dev-server pre-bundling errors and to keep
// them out of the main bundle / SSR path.
type AnyWorkbook = any;
type AnyWorksheet = any;
type AnyFill = any;
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

function styleSheet(ws: AnyWorksheet, headers: string[], logoId: number) {
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

function applyDataStyles(ws: AnyWorksheet, startRow: number, endRow: number, cols: number) {
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

function autoWidth(ws: AnyWorksheet, headers: string[], rows: any[][]) {
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
  wb: AnyWorkbook,
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

async function addCoverSheet(wb: AnyWorkbook, logoId: number, stats: { table: string; count: number }[]) {
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
    const fill: AnyFill = {
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
  const ExcelJS = (await import("exceljs")).default;
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
  const sheets = wb.worksheets as any[];
  const coverIdx = sheets.findIndex((s: any) => s.name === "Portada");
  if (coverIdx > 0) {
    const [cover] = sheets.splice(coverIdx, 1);
    sheets.unshift(cover);
    sheets.forEach((s: any, i: number) => (s.orderNo = i));
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

export interface DashboardKpi {
  label: string;
  value: string;
  unit?: string;
  icon: "droplet" | "leaf" | "tree" | "file-text";
  accent: string;
}

const ICON_SVG: Record<DashboardKpi["icon"], string> = {
  droplet: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>`,
  leaf: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19.2 2.96c1.4 9.3-1.85 15.85-8.2 17.04"/><path d="M2 21c0-3 1.85-5.36 5.08-6"/></svg>`,
  tree: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-7"/><path d="M9.5 8a2.5 2.5 0 0 1-1.96-4.06 2.5 2.5 0 0 1 2.06-3.94 2.5 2.5 0 0 1 4.8 0 2.5 2.5 0 0 1 2.06 3.94A2.5 2.5 0 0 1 14.5 8Z"/><path d="M12 15c-2 0-3-2-3-4"/><path d="M12 15c2 0 3-2 3-4"/></svg>`,
  "file-text": `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
};

function formatDateEs(d: Date) {
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${dias[d.getDay()]}, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatTimeEs(d: Date) {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "p.m." : "a.m.";
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export async function exportDashboardImage(_element: HTMLElement, kpis: DashboardKpi[] = []) {
  const now = new Date();

  const cardsHtml = kpis.map((k) => `
    <div style="background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.08);border-left:2px solid ${k.accent};padding:18px 20px;">
      <div style="display:flex;align-items:center;gap:6px;color:#6b7280;font-size:11px;font-weight:600;letter-spacing:.5px;text-transform:uppercase;">
        <span style="color:${k.accent};display:inline-flex;">${ICON_SVG[k.icon]}</span>
        <span>${k.label}</span>
      </div>
      <div style="margin-top:8px;display:flex;align-items:baseline;gap:6px;">
        <div style="color:#111827;font-weight:700;font-size:28px;line-height:1;">${k.value}</div>
        ${k.unit ? `<div style="color:#6b7280;font-size:12px;">${k.unit}</div>` : ""}
      </div>
    </div>
  `).join("");

  const wrap = document.createElement("div");
  wrap.style.position = "absolute";
  wrap.style.left = "-9999px";
  wrap.style.top = "0";
  wrap.style.width = "900px";
  wrap.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Inter, Roboto, sans-serif";
  wrap.style.background = "#ffffff";

  wrap.innerHTML = `
    <div style="background:linear-gradient(135deg,#1a4731 0%,#2d6a4f 100%);padding:24px;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <div style="background:#ffffff;border-radius:8px;padding:8px 12px;">
        <img src="${evecaLogo.url}" alt="EVECA" crossorigin="anonymous" style="height:48px;display:block;" />
      </div>
      <div style="flex:1;text-align:center;color:#ffffff;">
        <div style="font-size:22px;font-weight:700;letter-spacing:.3px;">TABLERO DE SOSTENIBILIDAD</div>
        <div style="font-size:13px;color:#a8d5b5;margin-top:4px;">EVECA S.A.S. · Extracción Sostenible</div>
      </div>
      <div style="background:#0f2d1e;border-radius:8px;padding:10px 14px;text-align:right;min-width:200px;">
        <div style="color:#6fcf97;font-size:10px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">CORTE</div>
        <div style="color:#ffffff;font-size:13px;font-weight:700;margin-top:2px;">${formatDateEs(now)}</div>
        <div style="color:#a8d5b5;font-size:11px;margin-top:2px;">Hora: ${formatTimeEs(now)}</div>
      </div>
    </div>
    <div style="background:#ffffff;padding:24px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${cardsHtml}
      </div>
    </div>
    <div style="background:#f0fdf4;border-top:1px solid #d1fae5;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;">
      <div style="color:#374151;font-size:10px;">Generado automáticamente por SostenibilidadPro · EVECA S.A.S.</div>
      <div style="color:#9ca3af;font-size:10px;font-style:italic;">CONFIDENCIAL — Solo para uso interno</div>
    </div>
  `;

  document.body.appendChild(wrap);

  // FIX A: Override theme CSS vars (oklch/lab/lch/oklab) that html2canvas can't parse.
  const styleOverride = document.createElement("style");
  styleOverride.id = "html2canvas-color-fix";
  styleOverride.textContent = `
    * {
      --background: #ffffff !important;
      --foreground: #111827 !important;
      --card: #ffffff !important;
      --card-foreground: #111827 !important;
      --primary: #2d6a4f !important;
      --primary-foreground: #ffffff !important;
      --muted: #f3f4f6 !important;
      --muted-foreground: #6b7280 !important;
      --border: #e5e7eb !important;
      --ring: #2d6a4f !important;
      --accent: #f0fdf4 !important;
      --accent-foreground: #166534 !important;
      --destructive: #ef4444 !important;
      --destructive-foreground: #ffffff !important;
      --secondary: #f3f4f6 !important;
      --secondary-foreground: #111827 !important;
      --popover: #ffffff !important;
      --popover-foreground: #111827 !important;
    }
  `;
  document.head.appendChild(styleOverride);

  try {
    await new Promise((r) => setTimeout(r, 600));
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(wrap, {
      scale: 2,
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      imageTimeout: 15000,
      removeContainer: true,
      scrollX: 0,
      scrollY: -window.scrollY,
      windowWidth: document.documentElement.scrollWidth,
      windowHeight: document.documentElement.scrollHeight,
      onclone: (clonedDoc: Document) => {
        const all = clonedDoc.querySelectorAll<HTMLElement>("*");
        all.forEach((el) => {
          const cs = clonedDoc.defaultView?.getComputedStyle(el);
          if (!cs) return;
          const bg = cs.backgroundColor;
          const fg = cs.color;
          const bc = cs.borderColor;
          const re = /(oklch|oklab|lab|lch)\s*\(/i;
          if (bg && re.test(bg)) el.style.backgroundColor = "#ffffff";
          if (fg && re.test(fg)) el.style.color = "#111827";
          if (bc && re.test(bc)) el.style.borderColor = "#e5e7eb";
        });
      },
    });

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `EVECA_Dashboard_${fmtFileStamp(now)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    document.getElementById("html2canvas-color-fix")?.remove();
    wrap.remove();
  }
}

