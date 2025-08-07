const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { addDays, addWeeks, addMonths, format } = require('date-fns');

// ✅ Obtener todas las reuniones
router.get('/', (req, res) => {
  db.all('SELECT * FROM reuniones', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener reuniones' });
    res.json(rows);
  });
});

// ✅ Crear reunión (adaptado a los campos del frontend)
router.post('/', (req, res) => {
  const {
    fecha,
    titulo,
    horaInicio,
    horaFin = '',
    color,
    observaciones = '',
    participantes = '',
    lugar = '',
    repetir = '',
    cantidad = 1
  } = req.body;

  const insertarReunion = (fechaInsertar) => {
    const sql = `
      INSERT INTO reuniones (fecha, hora, tema, participantes, tipo, lugar, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [fechaInsertar, horaInicio, titulo, participantes, color, lugar, observaciones]);
  };

  insertarReunion(fecha);

  if (repetir && cantidad > 1) {
    let nuevaFecha = new Date(fecha);
    for (let i = 1; i < cantidad; i++) {
      if (repetir === 'diario') nuevaFecha = addDays(nuevaFecha, 1);
      else if (repetir === 'semanal') nuevaFecha = addWeeks(nuevaFecha, 1);
      else if (repetir === 'mensual') nuevaFecha = addMonths(nuevaFecha, 1);
      insertarReunion(format(nuevaFecha, 'yyyy-MM-dd'));
    }
  }

  res.json({ mensaje: '✅ Reunión(es) registrada(s) correctamente', id: Date.now() });
});

// ✅ Actualizar una reunión (adaptado a los campos del frontend)
router.put('/:id', (req, res) => {
  const {
    fecha,
    titulo,
    horaInicio,
    color,
    observaciones = '',
    participantes = '',
    lugar = ''
  } = req.body;

  const { id } = req.params;

  const sql = `
    UPDATE reuniones
    SET fecha = ?, hora = ?, tema = ?, participantes = ?, tipo = ?, lugar = ?, observaciones = ?
    WHERE id = ?
  `;

  db.run(sql, [fecha, horaInicio, titulo, participantes, color, lugar, observaciones, id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al actualizar la reunión' });
    res.json({ mensaje: '✅ Reunión actualizada correctamente' });
  });
});

// ✅ Eliminar una reunión
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM reuniones WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar la reunión' });
    res.json({ mensaje: '🗑️ Reunión eliminada correctamente' });
  });
});

// ✅ Exportar a Excel
router.get('/excel', async (req, res) => {
  const { fecha, desde, hasta } = req.query;

  let sql = '';
  let params = [];
  let nombreArchivo = '';

  if (fecha) {
    sql = `SELECT * FROM reuniones WHERE fecha = ?`;
    params = [fecha];
    nombreArchivo = `reuniones_${fecha}.xlsx`;
  } else if (desde && hasta) {
    sql = `SELECT * FROM reuniones WHERE fecha BETWEEN ? AND ? ORDER BY fecha`;
    params = [desde, hasta];
    nombreArchivo = `reuniones_${desde}_a_${hasta}.xlsx`;
  } else {
    return res.status(400).json({ error: 'Debe enviar fecha o desde y hasta' });
  }

  db.all(sql, params, async (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al consultar reuniones' });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reuniones');

    const logoPath = path.join(__dirname, 'assets', 'logo-eco.png');
    if (fs.existsSync(logoPath)) {
      const imageId = workbook.addImage({ filename: logoPath, extension: 'png' });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 150, height: 100 } });
    }

    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);
    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);

    const textoTitulo = fecha
      ? `REPORTE DE REUNIONES DEL ${fecha}`
      : `REPORTE DE REUNIONES DEL ${desde} AL ${hasta}`;

    sheet.mergeCells('C8:I8');
    sheet.getCell('C8').value = textoTitulo;
    sheet.getCell('C8').font = { bold: true, size: 13 };
    sheet.getCell('C8').alignment = { vertical: 'middle', horizontal: 'center' };

    const headers = ['Fecha', 'Hora', 'Tema', 'Participantes', 'Tipo', 'Lugar', 'Observaciones'];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(9);
    headerRow.font = { bold: true };
    headerRow.alignment = { horizontal: 'center' };
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCE5FF' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    rows.forEach(r => {
      sheet.addRow([r.fecha, r.hora, r.tema, r.participantes, r.tipo, r.lugar, r.observaciones]);
    });

    sheet.autoFilter = { from: 'A9', to: 'G9' };
    sheet.columns.forEach(col => col.width = 20);
    sheet.headerFooter.oddFooter = '&C Eco Reprocesos - Reporte generado automáticamente';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
    await workbook.xlsx.write(res);
    res.end();
  });
});

module.exports = router;
