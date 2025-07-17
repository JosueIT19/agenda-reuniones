const express = require('express');
const cors = require('cors');
const db = require('./db/database'); // Conexión a la base de datos
const reunionesRoutes = require('./routes/reuniones'); // Rutas

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/reuniones', reunionesRoutes);

// Inicio del servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
