const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Ruta absoluta para guardar la base de datos en esta misma carpeta
const dbPath = path.resolve(__dirname, 'reuniones.db');

// Crear conexión
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar con la base de datos:', err.message);
  } else {
    console.log('✅ Base de datos conectada exitosamente.');
  }
});

// Crear tabla si no existe
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS reuniones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      hora TEXT,
      tema TEXT NOT NULL,
      participantes TEXT,
      tipo TEXT,
      lugar TEXT,
      observaciones TEXT
    )
  `);
});

module.exports = db;
