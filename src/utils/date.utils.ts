/**
 * Utilidades Centralizadas para Manejo de Zona Horaria de Ecuador (America/Guayaquil, UTC-5)
 * Garantiza consistencia en cualquier entorno de despliegue (AWS, Docker, Linux, VPS, etc.)
 */

export const ECUADOR_TIMEZONE = 'America/Guayaquil';

// Establecer la zona horaria del proceso de Node.js a Ecuador
if (!process.env.TZ) {
  process.env.TZ = ECUADOR_TIMEZONE;
}

/**
 * Obtiene los componentes de fecha y hora actuales en Ecuador
 */
export const getNowEcuadorParts = (): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Domingo, 6=Sábado
} => {
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    weekday: 'short',
    hour12: false
  });

  const parts = dtf.formatToParts(now);
  const getVal = (type: string) => {
    const p = parts.find(x => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  const weekdayStr = parts.find(x => x.type === 'weekday')?.value || '';
  const daysMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    year: getVal('year'),
    month: getVal('month'),
    day: getVal('day'),
    hour: getVal('hour'),
    minute: getVal('minute'),
    second: getVal('second'),
    dayOfWeek: daysMap[weekdayStr] ?? now.getDay()
  };
};

/**
 * Retorna la fecha actual en Ecuador en formato YYYY-MM-DD
 */
export const getFechaHoyEcuador = (): string => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
};

/**
 * Retorna la hora actual en Ecuador en formato HH:mm (24 horas)
 */
export const getHoraActualEcuador = (): string => {
  return new Intl.DateTimeFormat('es-EC', {
    timeZone: ECUADOR_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
};

/**
 * Retorna la fecha y hora actual en Ecuador en formato ISO local: YYYY-MM-DD HH:mm:ss
 */
export const getFechaHoraActualEcuador = (): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(new Date());

  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
  return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
};

/**
 * Formatea cualquier fecha o cadena a formato legible en zona horaria de Ecuador
 */
export const formatearFechaEcuador = (date: Date | string | null | undefined, includeTime = true): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);

  const options: Intl.DateTimeFormatOptions = {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = false;
  }

  return new Intl.DateTimeFormat('es-EC', options).format(d);
};
