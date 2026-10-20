export function toCSV(rows) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const safeValue = value => {
    const text = String(value ?? "");
    return /^[\t\r\n ]*[=+\-@]/.test(text) ? `'${text}` : text;
  };
  const quote = value => `"${safeValue(value).replaceAll('"', '""')}"`;
  return [columns.map(quote).join(","), ...rows.map(row => columns.map(column => quote(row[column])).join(","))].join("\r\n");
}

export function downloadCSV(filename, rows) {
  const blob = new Blob(["\ufeff", toCSV(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
