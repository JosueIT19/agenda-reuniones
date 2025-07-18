import React from 'react';
import './ui/CalendarioECO.css';

const meses = [
  'enero', 'febrero', 'marzo', 'abril',
  'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const CalendarioECO = () => {
  return (
    <div>
      <h1 style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '28px' }}>
        CALENDARIO ECO
      </h1>

      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        <label htmlFor="anio" style={{ fontWeight: 'bold' }}>AÑO:</label>
        <select id="anio" style={{ marginLeft: '10px', padding: '5px' }}>
          <option>2023</option>
          <option>2024</option>
          <option>2025</option>
        </select>
      </div>

      <div className="contenedor-calendario">
        {meses.map((mes, i) => (
          <div key={mes} className="mes-box">
            <h3>{mes} - 2025</h3>
            <table className="tabla-mes">
              <thead>
                <tr>
                  <th>Dom</th><th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th>
                </tr>
              </thead>
              <tbody>
                {/* Aquí se insertarán días estáticos solo como vista previa */}
                <tr><td colSpan="7" style={{ textAlign: 'center' }}>[Días aquí]</td></tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CalendarioECO;
