// Shared CSV building for export route handlers. Czech Excel convention:
// UTF-8 BOM, ";" column separator, "," decimal separator, "\r\n" line breaks.

export function csvCell(value: string) {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // can be interpreted as a formula by Excel/Sheets when the file is opened.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[";\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function csvNumber(value: number | null) {
  // Czech Excel convention: comma decimal separator, ; column separator.
  return value === null ? "" : value.toFixed(2).replace(".", ",");
}

// Serialize headers + rows into a single BOM-prefixed CSV string. An empty
// `rows` still emits the header line.
export function buildCsvBody(headers: string[], rows: string[][]) {
  const lines = [headers.map(csvCell).join(";")];
  for (const row of rows) {
    lines.push(row.map(csvCell).join(";"));
  }
  // UTF-8 BOM so Excel (cs-CZ) detects encoding correctly.
  return `﻿${lines.join("\r\n")}`;
}

// `filename` must be ASCII so the Content-Disposition header stays valid.
export function csvResponse(filename: string, body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
