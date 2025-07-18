const express = require('express');
const router = express.Router();
const db = require('../db/database');

// ✅ Ruta GET de prueba
router.get('/', (req, res) => {
  res.json({ mensaje: '✅ Ruta de reuniones funcionando' });
});

// ✅ Ruta POST para guardar una reunión
router.post('/', (req, res) => {
  const { fecha, hora, tema, participantes, tipo, lugar, observaciones } = req.body;

  const sql = `
    INSERT INTO reuniones (fecha, hora, tema, participantes, tipo, lugar, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(sql, [fecha, hora, tema, participantes, tipo, lugar, observaciones], function (err) {
    if (err) {
      console.error('❌ Error al insertar reunión:', err.message);
      return res.status(500).json({ error: 'Error al guardar la reunión' });
    }
    res.json({ mensaje: '✅ Reunión registrada correctamente', id: this.lastID });
  });
});

module.exports = router;

// ✅ Ruta GET para obtener reuniones por fecha
router.get('/', (req, res) => {
  const { fecha } = req.query;

  if (!fecha) {
    return res.status(400).json({ error: 'La fecha es requerida' });
  }

  const sql = `SELECT * FROM reuniones WHERE fecha = ?`;

  db.all(sql, [fecha], (err, rows) => {
    if (err) {
      console.error('❌ Error al consultar reuniones:', err.message);
      return res.status(500).json({ error: 'Error al obtener reuniones' });
    }
    res.json({ reuniones: rows });
  });
});

const ExcelJS = require('exceljs');

router.get('/excel', (req, res) => {
  const { fecha } = req.query;
  if (!fecha) return res.status(400).json({ error: 'La fecha es requerida' });

  const sql = `SELECT * FROM reuniones WHERE fecha = ?`;
  db.all(sql, [fecha], async (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al generar Excel' });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte Airtable');

    // Título
    sheet.mergeCells('A1:F1');
    const title = sheet.getCell('A1');
    title.value = `📋 REUNIONES DEL ${fecha}`;
    title.font = { size: 16, bold: true, name: 'Segoe UI', color: { argb: 'FFFFFFFF' } };
    title.alignment = { horizontal: 'center', vertical: 'middle' };
    title.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2F75B5' },
    };

    // Columnas
    sheet.columns = [
      { header: '⏰ Hora', key: 'hora', width: 12 },
      { header: '📝 Tema', key: 'tema', width: 35 },
      { header: '👥 Participantes', key: 'participantes', width: 30 },
      { header: '📂 Tipo', key: 'tipo', width: 20 },
      { header: '📍 Lugar', key: 'lugar', width: 20 },
      { header: '🧾 Observaciones', key: 'observaciones', width: 45 }
    ];

    // Encabezado (fila 2)
    sheet.getRow(2).eachCell(cell => {
      cell.font = { bold: true, name: 'Segoe UI', color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4F81BD' },
      };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Función para dar color según tipo
    const getColorByTipo = (tipo) => {
      switch (tipo?.toLowerCase()) {
        case 'junta directiva': return 'FFDDEBF7'; // azul claro
        case 'seguimiento':     return 'FFE2EFDA'; // verde claro
        case 'técnica':         return 'FFFFF2CC'; // amarillo
        default:                return 'FFF2F2F2'; // gris claro
      }
    };

    // Agregar filas
    rows.forEach((reunion) => {
      const row = sheet.addRow({
        hora: reunion.hora,
        tema: reunion.tema,
        participantes: reunion.participantes,
        tipo: reunion.tipo,
        lugar: reunion.lugar,
        observaciones: reunion.observaciones
      });

      const fillColor = getColorByTipo(reunion.tipo);
      row.eachCell((cell, colNumber) => {
        cell.font = { name: 'Segoe UI', size: 11 };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: fillColor }
        };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    });

    // Activar filtros como Airtable
    sheet.autoFilter = {
      from: 'A2',
      to: 'F2'
    };

    // Descargar archivo
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=airtable_reuniones_${fecha}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  });
});
