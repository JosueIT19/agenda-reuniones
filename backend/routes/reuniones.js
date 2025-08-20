// backend/routes/reuniones.js
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { addDays, addWeeks, addMonths, format } = require('date-fns');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// Asegurar zona horaria
process.env.TZ = 'America/Guatemala';

// Mapa de nombres a correos
const mapaCorreos = {
  'sergio ramirez': 'soporte.it@eco-reprocesos.com',
  'anaby cabrera': 'a.cabrera@eco-reprocesos.com',
  'jaime barona': 'j.barona@eco-reprocesos.com',
  'cristian monterros': 'C.finanzas@eco-reprocesos.com',
  'heedrick cardenas': 'jefaturalogistica@eco-reprocesos.com',
  'jose giron': 'Coordinadorplantapirolisis@eco-reprocesos.com',
  'laura peralta': 'Coordinadorplantapirolisis@eco-reprocesos.com',
  'nelson mejia': 'nmejia@eco-reprocesos.com',
};

function obtenerCorreo(participantes) {
  const nombre = participantes.toLowerCase().trim();
  return mapaCorreos[nombre] || null;
}

// Configuración de nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ecoreprocesos7@gmail.com',
    pass: 'yeed nnkt bbfa nmox' // usa tu app password
  }
});

// Enviar correo (nuevo/actualizado/recordatorio)
const enviarCorreo = (destinatario, datos, esActualizacion = false, esRecordatorio = false) => {
  const { titulo, fecha, horaInicio, horaFin, lugar, observaciones } = datos;

  const tipo = esRecordatorio
    ? '⏰ Recordatorio de reunión'
    : esActualizacion
    ? '📌 Reunión actualizada'
    : '📅 Nueva reunión agendada';

  const contenidoHTML = `
    <div style="font-family: Arial, sans-serif; padding: 10px;">
      <h2 style="color: #004b8d;">${tipo}</h2>
      <p><strong>Tema:</strong> ${titulo}</p>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Hora:</strong> ${horaInicio}${horaFin ? ' - ' + horaFin : ''}</p>
      <p><strong>Lugar:</strong> ${lugar || 'No especificado'}</p>
      <p><strong>Observaciones:</strong> ${observaciones || 'Sin observaciones'}</p>
      <p style="margin-top:20px; font-size:0.9em; color:#888;">Este correo fue enviado automáticamente por Eco Reprocesos</p>
    </div>
  `;

  const asunto = `${tipo} para el ${fecha}`;

  const mailOptions = {
    from: 'Eco Reprocesos <ecoreprocesos7@gmail.com>',
    to: destinatario,
    subject: asunto,
    html: contenidoHTML
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('❌ Error al enviar correo:', error);
    } else {
      console.log('✅ Correo enviado:', info.response);
    }
  });
};

// === Rutas ===

// Obtener todas las reuniones
router.get('/', (req, res) => {
  db.all('SELECT * FROM reuniones', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener reuniones' });
    res.json(rows);
  });
});

// Crear reunión (con nuevas opciones de repetición)
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

    db.run(sql, [fechaInsertar, horaInicio, titulo, participantes, color, lugar, observaciones], function (err) {
      if (err) {
        console.error('❌ Error al insertar reunión:', err.message);
      } else {
        const destinatario = obtenerCorreo(participantes);
        if (destinatario) {
          enviarCorreo(destinatario, {
            titulo,
            fecha: fechaInsertar,
            horaInicio,
            horaFin,
            lugar,
            observaciones
          });
        }
      }
    });
  };

  // --- Insertar según repetición ---
  if (repetir === 'daily_7' || repetir === 'daily_15' || repetir === 'daily_30') {
    let dias = repetir === 'daily_7' ? 7 : repetir === 'daily_15' ? 15 : 30;
    let fechaBase = new Date(fecha);
    for (let i = 0; i < dias; i++) {
      insertarReunion(format(addDays(fechaBase, i), 'yyyy-MM-dd'));
    }
  } else {
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
  }

  res.json({ mensaje: '✅ Reunión(es) registrada(s) correctamente', id: Date.now() });
});

// Actualizar reunión
router.put('/:id', (req, res) => {
  const {
    fecha,
    titulo,
    horaInicio,
    horaFin = '',
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

    const destinatario = obtenerCorreo(participantes);
    if (destinatario) {
      enviarCorreo(destinatario, {
        titulo,
        fecha,
        horaInicio,
        horaFin,
        lugar,
        observaciones
      }, true);
    }

    res.json({ mensaje: '✅ Reunión actualizada correctamente' });
  });
});

// Eliminar reunión
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM reuniones WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al eliminar la reunión' });
    res.json({ mensaje: '🗑️ Reunión eliminada correctamente' });
  });
});

// Exportar reuniones a Excel
router.get('/excel', async (req, res) => {
  const { fecha, desde, hasta } = req.query;
  let sql = '', params = [], nombreArchivo = '';

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

    sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]); sheet.addRow([]);

    const textoTitulo = fecha ? `REPORTE DE REUNIONES DEL ${fecha}` : `REPORTE DE REUNIONES DEL ${desde} AL ${hasta}`;
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

// === CRON: enviar recordatorios cada día a las 07:30 ===
cron.schedule('30 7 * * *', () => {
  const hoy = format(new Date(), 'yyyy-MM-dd');
  const sql = `SELECT * FROM reuniones WHERE fecha = ?`;
  db.all(sql, [hoy], (err, filas) => {
    if (err) {
      console.error('❌ Error consultando reuniones del día:', err);
      return;
    }
    filas.forEach(r => {
      const destinatario = obtenerCorreo(r.participantes);
      if (destinatario) {
        enviarCorreo(destinatario, {
          titulo: r.tema,
          fecha: r.fecha,
          horaInicio: r.hora,
          horaFin: '',
          lugar: r.lugar,
          observaciones: r.observaciones
        }, false, true);
      }
    });
  });
}, { timezone: 'America/Guatemala' });

module.exports = router;
