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
 * Parsea de forma segura cualquier entrada de fecha (Date, string ISO, string MySQL)
 * extrayendo sus componentes en la zona horaria de Ecuador (America/Guayaquil, UTC-5).
 * Si la cadena es formato MySQL sin zona horaria ('YYYY-MM-DD HH:mm:ss' o 'YYYY-MM-DD'),
 * se respeta como hora local sin conversiones intermedias que puedan desfasarla.
 */
export const parseEcuadorDateTime = (
  dateVal: Date | string | null | undefined
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null => {
  if (!dateVal) return null;

  if (typeof dateVal === 'string') {
    const trimmed = dateVal.trim();
    const hasTimezone = trimmed.includes('Z') || /[+-]\d{2}(:\d{2})?$/.test(trimmed);

    if (!hasTimezone) {
      const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
      if (match) {
        return {
          year: parseInt(match[1], 10),
          month: parseInt(match[2], 10),
          day: parseInt(match[3], 10),
          hour: match[4] ? parseInt(match[4], 10) : 0,
          minute: match[5] ? parseInt(match[5], 10) : 0,
          second: match[6] ? parseInt(match[6], 10) : 0
        };
      }
    }
  }

  const d = typeof dateVal === 'string' ? new Date(dateVal) : dateVal;
  if (isNaN(d.getTime())) return null;

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ECUADOR_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false
  });

  const parts = dtf.formatToParts(d);
  const getVal = (type: string) => {
    const p = parts.find(x => x.type === type);
    return p ? parseInt(p.value, 10) : 0;
  };

  return {
    year: getVal('year'),
    month: getVal('month'),
    day: getVal('day'),
    hour: getVal('hour'),
    minute: getVal('minute'),
    second: getVal('second')
  };
};

/**
 * Retorna la fecha y hora en formato 'YYYY-MM-DD HH:mm:ss' (o 'YYYY-MM-DD HH:mm')
 * en la zona horaria de Ecuador.
 */
export const formatFechaHoraEcuador = (
  dateVal: Date | string | null | undefined,
  includeSeconds = true
): string => {
  const p = parseEcuadorDateTime(dateVal);
  if (!p) return typeof dateVal === 'string' ? dateVal : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  const base = `${p.year}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}`;
  return includeSeconds ? `${base}:${pad(p.second)}` : base;
};

/**
 * Retorna solo la fecha en formato 'YYYY-MM-DD' en la zona horaria de Ecuador.
 */
export const formatFechaEcuador = (
  dateVal: Date | string | null | undefined
): string => {
  const p = parseEcuadorDateTime(dateVal);
  if (!p) return typeof dateVal === 'string' ? dateVal.split('T')[0] : '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/**
 * Retorna los componentes de fecha en español para actas institucionales en Ecuador.
 * Ejemplo: { diaNum: 16, mesNombre: 'noviembre', anioNum: 2026, textoLargo: 'Quito, 16 de noviembre de 2026' }
 */
export const formatFechaEcuadorSpanish = (
  dateVal: Date | string | null | undefined,
  ciudad = 'Quito'
): {
  diaNum: number;
  mesNombre: string;
  anioNum: number;
  textoLargo: string;
} => {
  const meses = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  const p = parseEcuadorDateTime(dateVal) || {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    day: new Date().getDate(),
    hour: 0,
    minute: 0,
    second: 0
  };

  const diaNum = p.day;
  const mesNombre = meses[Math.max(0, Math.min(11, p.month - 1))];
  const anioNum = p.year;
  const diaPad = String(diaNum).padStart(2, '0');
  const textoLargo = `${ciudad}, ${diaPad} de ${mesNombre} de ${anioNum}`;

  return { diaNum, mesNombre, anioNum, textoLargo };
};

/**
 * Formatea cualquier fecha o cadena a formato legible en zona horaria de Ecuador (DD/MM/YYYY o DD/MM/YYYY, HH:mm)
 */
export const formatearFechaEcuador = (date: Date | string | null | undefined, includeTime = true): string => {
  if (!date) return '-';
  const p = parseEcuadorDateTime(date);
  if (!p) return String(date);

  const pad = (n: number) => String(n).padStart(2, '0');
  const fechaStr = `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  if (includeTime) {
    return `${fechaStr}, ${pad(p.hour)}:${pad(p.minute)}`;
  }
  return fechaStr;
};
