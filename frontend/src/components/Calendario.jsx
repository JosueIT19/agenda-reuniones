import React, { useState, useEffect } from 'react';
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  format,
  isSameMonth,
  addDays,
  addMonths
} from 'date-fns';
import { es } from 'date-fns/locale';
import './ui/Calendario.css';

function getLocalDateFixed(year, month, day = 1) {
  const date = new Date(Date.UTC(year, month, day, 12));
  return new Date(date.toLocaleString('en-US', { timeZone: 'America/Guatemala' }));
}

export default function Calendario() {
  const hoy = getLocalDateFixed(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [currentYear, setCurrentYear] = useState(hoy.getFullYear());
  const [eventos, setEventos] = useState({});
  const [modalAbierto, setModalAbierto] = useState(false);
  const [fechaSeleccionada, setFechaSeleccionada] = useState('');
  const [titulo, setTitulo] = useState('');
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');
  const [color, setColor] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [repeticion, setRepeticion] = useState('');
  const [fechaUnica, setFechaUnica] = useState('');
  const [rangoInicio, setRangoInicio] = useState('');
  const [rangoFin, setRangoFin] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modoEdicion, setModoEdicion] = useState(false);
  const [eventoEditando, setEventoEditando] = useState(null);

  useEffect(() => {
    fetch(`http://localhost:3000/api/reuniones`)
      .then((res) => res.json())
      .then((data) => {
        const eventosCargados = {};
        data.forEach((evento) => {
          if (!eventosCargados[evento.fecha]) eventosCargados[evento.fecha] = [];
          eventosCargados[evento.fecha].push({
            id: evento.id,
            titulo: evento.tema,
            horaInicio: evento.hora,
            horaFin: '',
            color: evento.tipo,
            observaciones: evento.observaciones || ''
          });
        });
        setEventos(eventosCargados);
      });
  }, []);

  const mesesDelAnio = Array.from({ length: 12 }, (_, i) => i);

  const generarDiasDelMes = (date) => {
    const start = startOfWeek(startOfMonth(date), { locale: es, weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(date), { locale: es, weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  };

  const abrirFormulario = (fecha) => {
    setFechaSeleccionada(fecha);
    setTitulo('');
    setHoraInicio('');
    setHoraFin('');
    setColor('');
    setObservaciones('');
    setRepeticion('');
    setEventoEditando(null);
    setModoEdicion(false);
    setModalAbierto(true);
  };

  const guardarEvento = async () => {
    const fechasAInsertar = [fechaSeleccionada];

    if (modoEdicion && eventoEditando) {
      try {
        await fetch(`http://localhost:3000/api/reuniones/${eventoEditando.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fecha: fechaSeleccionada,
            titulo,
            horaInicio,
            color,
            observaciones
          })
        });

        setEventos((prev) => {
          const copia = { ...prev };
          copia[fechaSeleccionada] = copia[fechaSeleccionada].map((ev) =>
            ev.id === eventoEditando.id ? { ...ev, titulo, horaInicio, color, observaciones } : ev
          );
          return copia;
        });

        setModalAbierto(false);
        return;
      } catch (error) {
        console.error('Error al actualizar reunión:', error);
        return;
      }
    }

    if (repeticion === 'lunes') {
      let fecha = new Date(fechaSeleccionada);
      while (fecha.getMonth() === new Date(fechaSeleccionada).getMonth()) {
        if (fecha.getDay() === 1 && format(fecha, 'yyyy-MM-dd') !== fechaSeleccionada) {
          fechasAInsertar.push(format(fecha, 'yyyy-MM-dd'));
        }
        fecha = addDays(fecha, 1);
      }
    } else if (repeticion === 'quincenal') {
      let fecha = new Date(fechaSeleccionada);
      for (let i = 1; i <= 2; i++) {
        fecha = addDays(fecha, 15);
        fechasAInsertar.push(format(fecha, 'yyyy-MM-dd'));
      }
    } else if (repeticion === 'mensual') {
      let fecha = new Date(fechaSeleccionada);
      for (let i = 1; i <= 2; i++) {
        fecha = addMonths(fecha, 1);
        fechasAInsertar.push(format(fecha, 'yyyy-MM-dd'));
      }
    }

    for (const fecha of fechasAInsertar) {
      const nuevoEvento = {
        fecha,
        titulo,
        horaInicio,
        horaFin,
        color,
        observaciones
      };

      try {
        const res = await fetch('http://localhost:3000/api/reuniones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(nuevoEvento)
        });

        const data = await res.json();
        const idGenerado = data.id || Date.now();

        setEventos((prev) => ({
          ...prev,
          [fecha]: [...(prev[fecha] || []), { id: idGenerado, titulo, horaInicio, horaFin, color, observaciones }]
        }));
      } catch (error) {
        console.error('Error al guardar reunión:', error);
      }
    }

    setModalAbierto(false);
  };

  const eliminarEvento = async (id, fecha) => {
    try {
      await fetch(`http://localhost:3000/api/reuniones/${id}`, {
        method: 'DELETE'
      });

      setEventos((prev) => {
        const copia = { ...prev };
        copia[fecha] = copia[fecha].filter((ev) => ev.id !== id);
        return copia;
      });
    } catch (error) {
      console.error('Error al eliminar reunión:', error);
    }
  };

  const exportarExcelConFiltro = async () => {
    try {
      let url = 'http://localhost:3000/api/reuniones/excel';

      if (fechaUnica) {
        url += `?fecha=${fechaUnica}`;
      } else if (rangoInicio && rangoFin) {
        url += `?desde=${rangoInicio}&hasta=${rangoFin}`;
      } else {
        alert('❌ Selecciona una fecha o un rango válido');
        return;
      }

      const response = await fetch(url);
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = `reporte_reuniones.xlsx`;
      a.click();
      window.URL.revokeObjectURL(urlBlob);
    } catch (error) {
      alert('❌ Error al descargar el Excel');
      console.error(error);
    }
  };

  return (
    <div className="contenedor">
      <div className="cabecera-logo">
        <img src="/logo-eco.png" alt="Logo Eco Reprocesos" className="logo-eco" />
        <h1>CALENDARIO ECO</h1>
      </div>

      <div className="selector-ano">
        <label>AÑO:&nbsp;</label>
        <select value={currentYear} onChange={(e) => setCurrentYear(Number(e.target.value))}>
          {Array.from({ length: 30 }, (_, i) => 2025 + i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      <div className="selector-tipo">
        <label>Filtrar por tipo:&nbsp;</label>
        <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)}>
          <option value="">-- Mostrar todos --</option>
          <option value="rojo">Pago de Planilla</option>
          <option value="morado">Pago Extra</option>
          <option value="amarillo">Corte Final</option>
          <option value="cyan">Corte Inicio</option>
          <option value="naranja">Recepción Documentos</option>
          <option value="verde">Evento Especial</option>
        </select>
      </div>

      <div className="seccion-exportar">
        <label>Fecha única:</label>
        <input type="date" value={fechaUnica} onChange={(e) => setFechaUnica(e.target.value)} />

        <label>Desde:</label>
        <input type="date" value={rangoInicio} onChange={(e) => setRangoInicio(e.target.value)} />
        <label>Hasta:</label>
        <input type="date" value={rangoFin} onChange={(e) => setRangoFin(e.target.value)} />

        <button className="btn-exportar" onClick={exportarExcelConFiltro}>
          📥 Exportar Excel empresarial
        </button>
      </div>

      <div className="grid-meses">
        {mesesDelAnio.map((mesIndex) => {
          const mesFecha = getLocalDateFixed(currentYear, mesIndex);
          const dias = generarDiasDelMes(mesFecha);
          const mesNombre = format(mesFecha, 'MMMM - yyyy', { locale: es });

          return (
            <div key={mesIndex} className="mes">
              <h3>{mesNombre}</h3>
              <div className="dias-semana">
                <div>Lun</div><div>Mar</div><div>Mié</div><div>Jue</div><div>Vie</div><div>Sáb</div><div>Dom</div>
              </div> 
              <div className="cuadro-dias">
                {dias.map((day, index) => {
                  const esDelMes = isSameMonth(day, mesFecha);
                  const fechaStr = format(day, 'yyyy-MM-dd');
                  const eventosDelDia = eventos[fechaStr] || [];
                  const eventosFiltrados = filtroTipo
                    ? eventosDelDia.filter(ev => ev.color === filtroTipo)
                    : eventosDelDia;
                  const tooltip = eventosFiltrados.map(ev => `${ev.horaInicio} - ${ev.titulo}`).join('\n');
                  const esHoy = fechaStr === format(hoy, 'yyyy-MM-dd');

                  return (
                    <div
                      key={index}
                      className={`dia ${esDelMes ? '' : 'fuera-mes'} ${esHoy ? 'hoy' : ''} ${eventosFiltrados[0]?.color || ''}`}
                      onClick={() => abrirFormulario(fechaStr)}
                      title={tooltip}
                    >
                      {format(day, 'd')}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="leyenda">
        <h4>Leyenda:</h4>
        <div><span className="cuadro-color rojo"></span>Pago de Planilla</div>
        <div><span className="cuadro-color morado"></span>Pago Extra</div>
        <div><span className="cuadro-color amarillo"></span>Corte Final</div>
        <div><span className="cuadro-color cyan"></span>Corte Inicio</div>
        <div><span className="cuadro-color naranja"></span>Recepción Documentos</div>
        <div><span className="cuadro-color verde"></span>Evento Especial</div>
      </div>

      {modalAbierto && (
        <div className="modal">
          <div className="modal-contenido">
            <h3>{modoEdicion ? 'Editar' : 'Agregar'} reunión para {fechaSeleccionada}</h3>

            {eventos[fechaSeleccionada]?.map((ev, i) => (
  <li key={i}>
    🕒 {ev.horaInicio} | {ev.titulo} ({ev.color})
    
    {ev.observaciones && (
      <button
        onClick={() => alert(`📄 Observación:\n${ev.observaciones}`)}
        title="Ver observación"
        style={{ marginLeft: '10px' }}
      >
        📄 Ver observación
      </button>
    )}

    <button
      onClick={() => {
        setModoEdicion(true);
        setEventoEditando(ev);
        setTitulo(ev.titulo);
        setHoraInicio(ev.horaInicio);
        setColor(ev.color);
        setObservaciones(ev.observaciones);
      }}
      title="Editar"
    >
      ✏️
    </button>

    <button
      onClick={() => eliminarEvento(ev.id, fechaSeleccionada)}
      title="Eliminar"
    >
      🗑️
    </button>
  </li>
))}
            <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Título" />
            <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
            <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Observaciones" />
            <select value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">Sin color</option>
              <option value="rojo">Rojo</option>
              <option value="morado">Morado</option>
              <option value="amarillo">Amarillo</option>
              <option value="cyan">Cyan</option>
              <option value="naranja">Naranja</option>
              <option value="verde">Verde</option>
            </select>

            <select value={repeticion} onChange={(e) => setRepeticion(e.target.value)}>
              <option value="">No repetir</option>
              <option value="lunes">Todos los lunes del mes</option>
              <option value="quincenal">Cada 15 días</option>
              <option value="mensual">Mensualmente</option>
            </select>

            <div className="modal-botones">
              <button onClick={guardarEvento}>{modoEdicion ? 'Actualizar' : 'Guardar'}</button>
              <button onClick={() => setModalAbierto(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
