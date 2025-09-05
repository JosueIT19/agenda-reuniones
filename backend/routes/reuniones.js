// backend/routes/reuniones.js
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { addDays, addWeeks, addMonths, format, isWeekend } = require('date-fns');
const { es } = require('date-fns/locale');
const nodemailer = require('nodemailer');
const cron = require('node-cron');

// ===== Zona horaria del servidor =====
process.env.TZ = 'America/Guatemala';

// ====== Mapa de nombres a correos (ajústalo a tu realidad) ======
const mapaCorreos = {
  'sergio ramirez': 'soporte.it@eco-reprocesos.com',
  'anaby cabrera': 'a.cabrera@eco-reprocesos.com',
  'jaime barona': 'j.barona@eco-reprocesos.com',
  'cristian monterroso': 'C.finanzas@eco-reprocesos.com',
  'heedrick cardenas': 'jefaturalogistica@eco-reprocesos.com',
  'jose giron': 'Coordinadorplantapirolisis@eco-reprocesos.com',
  'laura peralta': 'Coordinadorplantapirolisis@eco-reprocesos.com',
  'nelson mejia': 'nmejia@eco-reprocesos.com',
  'susan hernandez': 'contador.general@eco-reprocesos.com',
  'osman ruano': 'coordinacionprocesos@eco-reprocesos.com',
  'william garcia': 'Coordinadorplanta@eco-reprocesos.com',
  'karoline perez': 'compras@eco-reprocesos.com',
  'silvia sanchez': 'ssanchez@eco-reprocesos.com',
  'muriel de figueroa': 'coordinacionrrhh@eco-reprocesos.com',
};

// Soporta 1 nombre o una lista separada por comas
function resolverDestinatarios(participantes) {
  if (!participantes) return [];
  const partes = String(participantes)
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);

  const correos = [];
  for (const p of partes) {
    if (/\S+@\S+\.\S+/.test(p)) {
      correos.push(p); // ya viene como email
    } else if (mapaCorreos[p]) {
      correos.push(mapaCorreos[p]);
    }
  }
  // quitar duplicados
  return [...new Set(correos)];
}

// ======== TRANSPORTER (correo) ========
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER || 'ecoreprocesos7@gmail.com',
    pass: process.env.SMTP_PASS || 'yeed nnkt bbfa nmox' // usa app password real
  }
});

// ======== Helpers de fechas / plantillas ========
function fechaHumana(d) {
  return format(d, "EEEE d 'de' MMMM yyyy, HH:mm", { locale: es });
}
function addBusinessDays(start, n) {
  let d = new Date(start);
  let added = 0;
  while (added < n) {
    d = addDays(d, 1);
    if (!isWeekend(d)) added++;
  }
  return d;
}
function diasHabilesPorRepeticion(valor) {
  if (!valor) return 0;
  const v = String(valor).toLowerCase();
  if (v.includes('daily_7') || v.includes('1 semana')) return 7;
  if (v.includes('daily_15') || v.includes('15'))      return 15;
  if (v.includes('daily_30') || v.includes('1 mes'))   return 30;
  return 0;
}

function htmlConfirmacion({ titulo, fecha, hora, lugar, observaciones }) {
  return `
  <div style="font-family: Arial, sans-serif; line-height:1.5;">
    <h2 style="color:#004b8d;">📅 Nueva reunión agendada</h2>
    <p><b>Tema:</b> ${titulo}</p>
    <p><b>Fecha:</b> ${fecha}</p>
    <p><b>Hora:</b> ${hora || '—'}</p>
    <p><b>Lugar:</b> ${lugar || 'No especificado'}</p>
    ${observaciones ? `<p><b>Observaciones:</b> ${observaciones}</p>` : ''}
    <hr/>
    <p style="color:#777;font-size:12px;">Este correo fue enviado automáticamente por Eco Reprocesos</p>
  </div>`;
}

function htmlActualizacion({ titulo, fecha, hora, lugar, observaciones }) {
  return `
  <div style="font-family: Arial, sans-serif; line-height:1.5;">
    <h2 style="color:#004b8d;">📌 Reunión actualizada</h2>
    <p><b>Tema:</b> ${titulo}</p>
    <p><b>Fecha:</b> ${fecha}</p>
    <p><b>Hora:</b> ${hora || '—'}</p>
    <p><b>Lugar:</b> ${lugar || 'No especificado'}</p>
    ${observaciones ? `<p><b>Observaciones:</b> ${observaciones}</p>` : ''}
    <hr/>
    <p style="color:#777;font-size:12px;">Este correo fue enviado automáticamente por Eco Reprocesos</p>
  </div>`;
}

function htmlRecordatorio({ titulo, fechaLimiteTxt, lugar, observaciones }) {
  return `
  <div style="font-family: Arial, sans-serif; line-height:1.5;">
    <h2 style="color:#d97706;">⏰ Recordatorio</h2>
    <p>Te recordamos que tienes <b>hasta ${fechaLimiteTxt}</b> para realizar el trabajo relacionado con:</p>
    <p><b>Tema:</b> ${titulo}</p>
    ${lugar ? `<p><b>Lugar:</b> ${lugar}</p>` : ''}
    ${observaciones ? `<p><b>Notas:</b> ${observaciones}</p>` : ''}
    <p style="margin-top:12px;">Si ya completaste la tarea, puedes ignorar este recordatorio.</p>
    <hr/>
    <p style="color:#777;font-size:12px;">Recordatorio automático • Eco Reprocesos</p>
  </div>`;
}

// ======== Tabla 'reminders' (cola) - autocreación ========
db.exec?.(`
  CREATE TABLE IF NOT EXISTS reminders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reunion_id INTEGER,
    email_to TEXT NOT NULL,
    subject TEXT NOT NULL,
    html TEXT NOT NULL,
    send_at TEXT NOT NULL,
    sent INTEGER DEFAULT 0,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_due ON reminders(sent, send_at);
`);

// Genera fechas hábiles a partir de mañana
function fechasHabilesFuturas(cantidad) {
  const out = [];
  let d = addDays(new Date(), 1);
  while (out.length < cantidad) {
    if (!isWeekend(d)) out.push(new Date(d));
    d = addDays(d, 1);
  }
  return out;
}

// Encola recordatorios diarios hábiles para una reunión
function encolarRecordatorios({ reunionId, destinatarios, titulo, lugar, observaciones, diasHabiles }) {
  return new Promise((resolve, reject) => {
    try {
      const fechas = fechasHabilesFuturas(diasHabiles);
      const fechaLimite = addBusinessDays(new Date(), diasHabiles);
      const fechaLimiteTxt = fechaHumana(fechaLimite);

      const subject = `⏰ Recordatorio: ${titulo} • vence ${format(fechaLimite, "dd/MM/yyyy")}`;
      const html = htmlRecordatorio({ titulo, fechaLimiteTxt, lugar, observaciones });

      db.serialize(() => {
        const stmt = db.prepare(
          `INSERT INTO reminders (reunion_id, email_to, subject, html, send_at)
           VALUES (?, ?, ?, ?, ?)`
        );
        destinatarios.forEach(email => {
          fechas.forEach(f => {
            const cuando = new Date(f);
            // fija hora de envío 07:30 GT
            cuando.setHours(7, 30, 0, 0);
            stmt.run(reunionId || null, email, subject, html, cuando.toISOString());
          });
        });
        stmt.finalize(err => {
          if (err) return reject(err);
          resolve({ encolados: fechas.length * destinatarios.length, fechaLimite: fechaLimiteTxt });
        });
      });
    } catch (e) {
      reject(e);
    }
  });
}

// ======== Envío de un correo genérico ========
async function enviarCorreoTo(to, subject, html) {
  try {
    const info = await transporter.sendMail({
      from: `Eco Reprocesos <${process.env.SMTP_USER || 'ecoreprocesos7@gmail.com'}>`,
      to,
      subject,
      html
    });
    console.log('✉️ Enviado:', info.response);
  } catch (e) {
    console.error('❌ Error al enviar correo:', e.message);
  }
}

// ======== RUTAS ========

// Obtener todas las reuniones
router.get('/', (req, res) => {
  db.all('SELECT * FROM reuniones', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Error al obtener reuniones' });
    res.json(rows);
  });
});

// Crear reunión
router.post('/', (req, res) => {
  const {
    fecha,             // 'yyyy-MM-dd'
    titulo,
    horaInicio,
    horaFin = '',
    color,
    observaciones = '',
    participantes = '',
    lugar = '',
    repetir = '',      // 'daily_7' | 'daily_15' | 'daily_30' | 'diario' | 'semanal' | 'mensual' | ''
    cantidad = 1
  } = req.body;

  const correos = resolverDestinatarios(participantes);

  // Inserta una sola reunión
  const insertarUna = (fechaInsertar, enviarConfirmacion = true) => {
    const sql = `
      INSERT INTO reuniones (fecha, hora, tema, participantes, tipo, lugar, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    db.run(sql, [fechaInsertar, horaInicio, titulo, participantes, color, lugar, observaciones], function (err) {
      if (err) {
        console.error('❌ Error al insertar reunión:', err.message);
      } else if (enviarConfirmacion && correos.length) {
        const fechaTxt = format(new Date(fechaInsertar + 'T00:00:00'), 'dd/MM/yyyy', { locale: es });
        enviarCorreoTo(
          correos.join(','),
          `📅 Nueva reunión: ${titulo} (${fechaTxt})`,
          htmlConfirmacion({ titulo, fecha: fechaTxt, hora: horaInicio + (horaFin ? ' - ' + horaFin : ''), lugar, observaciones })
        );
      }
    });
  };

  // Lógica:
  // - Para daily_7/15/30: insertamos SOLO la fecha base y encolamos recordatorios (no generamos 7/15/30 reuniones).
  // - Para diario/semanal/mensual con cantidad: sí generamos N reuniones.
  if (['daily_7', 'daily_15', 'daily_30'].includes(repetir)) {
    insertarUna(fecha, true);
    const dias = repetir === 'daily_7' ? 7 : repetir === 'daily_15' ? 15 : 30;
    if (correos.length && dias > 0) {
      encolarRecordatorios({
        reunionId: null, // si quieres enlazar al id recién creado, puedes obtener this.lastID arriba
        destinatarios: correos,
        titulo,
        lugar,
        observaciones,
        diasHabiles: dias
      }).then(r => {
        console.log(`🗓️ Recordatorios encolados: ${r.encolados}. Fecha límite: ${r.fechaLimite}`);
      }).catch(e => console.error('Error encolando recordatorios:', e.message));
    }
  } else {
    // Insertar la primera
    insertarUna(fecha, true);

    // Repeticiones clásicas (eventos)
    if (repetir && cantidad > 1) {
      let f = new Date(fecha);
      for (let i = 1; i < cantidad; i++) {
        if (repetir === 'diario')   f = addDays(f, 1);
        else if (repetir === 'semanal') f = addWeeks(f, 1);
        else if (repetir === 'mensual') f = addMonths(f, 1);
        insertarUna(format(f, 'yyyy-MM-dd'), false); // sin reenviar confirmación cada vez
      }
    }
  }

  res.json({ mensaje: '✅ Reunión(es) registrada(s) correctamente' });
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

  const correos = resolverDestinatarios(participantes);

  const sql = `
    UPDATE reuniones
    SET fecha = ?, hora = ?, tema = ?, participantes = ?, tipo = ?, lugar = ?, observaciones = ?
    WHERE id = ?
  `;
  db.run(sql, [fecha, horaInicio, titulo, participantes, color, lugar, observaciones, id], function (err) {
    if (err) return res.status(500).json({ error: 'Error al actualizar la reunión' });

    if (correos.length) {
      const fechaTxt = format(new Date(fecha + 'T00:00:00'), 'dd/MM/yyyy', { locale: es });
      enviarCorreoTo(
        correos.join(','),
        `📌 Reunión actualizada: ${titulo} (${fechaTxt})`,
        htmlActualizacion({ titulo, fecha: fechaTxt, hora: horaInicio + (horaFin ? ' - ' + horaFin : ''), lugar, observaciones })
      );
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

    // margen superior
    for (let i = 0; i < 7; i++) sheet.addRow([]);

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
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
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

// ====== CRON: procesar recordatorios pendientes cada 5 minutos ======
cron.schedule('*/5 * * * *', () => {
  const ahora = new Date().toISOString();
  db.all(
    `SELECT * FROM reminders
     WHERE sent = 0 AND send_at <= ?
     ORDER BY send_at ASC
     LIMIT 100`,
    [ahora],
    async (err, rows) => {
      if (err) {
        console.error('❌ Error leyendo reminders:', err.message);
        return;
      }
      if (!rows || !rows.length) return;

      for (const r of rows) {
        try {
          await enviarCorreoTo(r.email_to, r.subject, r.html);
          db.run(`UPDATE reminders SET sent = 1, sent_at = ? WHERE id = ?`,
            [new Date().toISOString(), r.id]);
        } catch (e) {
          console.error('❌ Error enviando reminder', r.id, e.message);
        }
      }
    }
  );
}, { timezone: 'America/Guatemala' });

module.exports = router;
