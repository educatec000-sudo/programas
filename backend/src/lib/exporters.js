import PDFDocument from 'pdfkit';
import XLSX from 'xlsx';

/**
 * Exportadores de relatórios — CSV (pt-BR), XLSX e PDF.
 * columns: [{ key, label, format?: 'int'|'number'|'percent'|'score' }]
 */

export function formatCell(value, format) {
  if (value === null || value === undefined || value === '') return '';
  if (format === 'int') {
    // sem agrupamento p/ anos (2025) e ids; com agrupamento p/ grandes totais
    const opts = Math.abs(value) >= 10000 ? {} : { useGrouping: false };
    return new Intl.NumberFormat('pt-BR', opts).format(Math.round(value));
  }
  if (format === 'number' || format === 'score') {
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value);
  }
  if (format === 'percent') {
    return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%`;
  }
  return String(value);
}

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCSV(columns, rows) {
  const lines = [columns.map((c) => csvEscape(c.label)).join(';')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(formatCell(row[c.key], c.format))).join(';'));
  }
  return Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8');
}

export function toXLSX(columns, rows, { sheetName = 'Dados' } = {}) {
  const aoa = [columns.map((c) => c.label)];
  for (const row of rows) aoa.push(columns.map((c) => row[c.key] ?? ''));
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  sheet['!cols'] = columns.map((c) => ({ wch: Math.max(12, c.label.length + 4) }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 30));
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

function toPDFBuffer({ title, subtitle, columns, rows, meta }) {
  return new Promise((resolve, reject) => {
    const landscape = columns.length > 6;
    const doc = new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margins: { top: 56, bottom: 56, left: 40, right: 40 },
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const marginX = 40;
    const tableWidth = pageWidth - marginX * 2;

    // Cabeçalho
    const brand = 'CPE — Controle de Programas Educacionais';
    doc.rect(0, 0, pageWidth, 6).fill('#1d4ed8');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(13).text(brand, marginX, 24);
    doc.font('Helvetica-Bold').fontSize(15).fillColor('#1d4ed8').text(title, marginX, 46);
    let y = 66;
    if (subtitle) {
      doc.font('Helvetica').fontSize(9.5).fillColor('#475569').text(subtitle, marginX, y, { width: tableWidth });
      y = doc.y + 4;
    }
    const generated = `Gerado em ${new Date().toLocaleString('pt-BR')}${meta?.user ? ` por ${meta.user}` : ''}`;
    doc.font('Helvetica').fontSize(8.5).fillColor('#64748b').text(generated, marginX, y, { width: tableWidth, align: 'right' });
    y = doc.y + 10;

    // Larguras proporcionais
    const weights = columns.map((c) => Math.max(10, c.label.length + 4));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const colWidths = weights.map((w) => Math.floor((w / totalWeight) * tableWidth));
    colWidths[colWidths.length - 1] += tableWidth - colWidths.reduce((a, b) => a + b, 0);

    const rowHeight = 20;

    const drawHeader = () => {
      doc.rect(marginX, y, tableWidth, rowHeight).fill('#1e3a5f');
      let x = marginX;
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8.5);
      columns.forEach((c, i) => {
        doc.text(c.label, x + 5, y + 6, { width: colWidths[i] - 10, ellipsis: true, lineBreak: false });
        x += colWidths[i];
      });
      y += rowHeight;
    };

    drawHeader();

    doc.font('Helvetica').fontSize(8.5);
    rows.forEach((row, idx) => {
      if (y + rowHeight > doc.page.height - 60) {
        doc.addPage();
        y = 56;
        drawHeader();
        doc.font('Helvetica').fontSize(8.5);
      }
      if (idx % 2 === 0) doc.rect(marginX, y, tableWidth, rowHeight).fill('#f1f5f9');
      let x = marginX;
      columns.forEach((c, i) => {
        const isNumber = ['int', 'number', 'percent', 'score'].includes(c.format);
        doc.fillColor('#1e293b');
        doc.text(formatCell(row[c.key], c.format), x + 5, y + 6, {
          width: colWidths[i] - 10,
          ellipsis: true,
          lineBreak: false,
          align: isNumber ? 'right' : 'left',
        });
        x += colWidths[i];
      });
      y += rowHeight;
    });

    // Bordas da tabela
    if (rows.length) {
      doc.rect(marginX, y - rows.length * rowHeight - rowHeight, tableWidth, rows.length * rowHeight + rowHeight).stroke('#cbd5e1');
    }

    // Rodapé com paginação
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.font('Helvetica').fontSize(8).fillColor('#94a3b8').text(
        `Página ${i + 1} de ${range.count} · CPE`,
        marginX,
        doc.page.height - 40,
        { width: tableWidth, align: 'center' },
      );
    }
    doc.end();
  });
}

export async function buildExport({ title, subtitle, columns, rows, format, meta }) {
  if (format === 'csv') {
    return { body: toCSV(columns, rows), contentType: 'text/csv; charset=utf-8', ext: 'csv' };
  }
  if (format === 'xlsx') {
    return {
      body: toXLSX(columns, rows, { sheetName: title }),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ext: 'xlsx',
    };
  }
  const body = await toPDFBuffer({ title, subtitle, columns, rows, meta });
  return { body, contentType: 'application/pdf', ext: 'pdf' };
}

export function exportFilename(prefix, ext) {
  const date = new Date().toISOString().slice(0, 10);
  return `CPE_${prefix}_${date}.${ext}`;
}
