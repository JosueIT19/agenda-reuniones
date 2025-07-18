import { useState } from 'react';
import {
  addMonths,
  subMonths,
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from './ui/Button.';

export default function Calendario() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [reuniones, setReuniones] = useState([]);

  const start = startOfWeek(startOfMonth(currentMonth), { locale: es });
  const end = endOfWeek(endOfMonth(currentMonth), { locale: es });
  const days = eachDayOfInterval({ start, end });

  const handlePrev = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNext = () => setCurrentMonth(addMonths(currentMonth, 1));

  const handleDateClick = async (day) => {
    setSelectedDate(day);
    const fecha = format(day, 'yyyy-MM-dd');
    try {
      const response = await fetch(`http://localhost:3000/api/reuniones?fecha=${fecha}`);
      const data = await response.json();
      setReuniones(data.reuniones || []);
    } catch (error) {
      console.error('Error al obtener reuniones:', error);
    }
  };

  const descargarExcel = () => {
    const fecha = format(selectedDate, 'yyyy-MM-dd');
    window.open(`http://localhost:3000/api/reuniones/excel?fecha=${fecha}`);
  };

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <Button onClick={handlePrev}>◀</Button>
        <h2 className="text-xl font-bold">
          {format(currentMonth, 'MMMM yyyy', { locale: es })}
        </h2>
        <Button onClick={handleNext}>▶</Button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
          <div key={d} className="text-center font-semibold">{d}</div>
        ))}

        {days.map((day) => (
          <div
            key={day}
            onClick={() => handleDateClick(day)}
            className={`text-center p-2 rounded-lg cursor-pointer border
              ${!isSameMonth(day, currentMonth) ? 'text-gray-400' : ''}
              ${isSameDay(day, selectedDate) ? 'bg-blue-500 text-white' : ''}`}
          >
            {format(day, 'd')}
          </div>
        ))}
      </div>

      {selectedDate && (
        <div className="mt-6">
          <h3 className="font-bold text-lg mb-2">
            Reuniones del {format(selectedDate, 'PPP', { locale: es })}
          </h3>

          {reuniones.length === 0 ? (
            <p className="text-gray-500">No hay reuniones registradas.</p>
          ) : (
            <div className="space-y-3">
              {reuniones.map((r) => (
                <div key={r.id} className="border p-3 rounded-lg shadow">
                  <p><strong>🕐 Hora:</strong> {r.hora}</p>
                  <p><strong>📝 Tema:</strong> {r.tema}</p>
                  <p><strong>👥 Participantes:</strong> {r.participantes}</p>
                  <p><strong>📂 Tipo:</strong> {r.tipo}</p>
                  <p><strong>📍 Lugar:</strong> {r.lugar}</p>
                  <p><strong>🧾 Observaciones:</strong> {r.observaciones}</p>
                </div>
              ))}

              <Button onClick={descargarExcel} className="mt-4">📥 Descargar en Excel</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
