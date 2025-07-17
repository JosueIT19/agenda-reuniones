const express = require('express');
const router = express.Router();

// Ruta de prueba para confirmar que funciona
router.get('/', (req, res) => {
  res.json({ mensaje: '✅ Ruta de reuniones funcionando' });
});

module.exports = router;
