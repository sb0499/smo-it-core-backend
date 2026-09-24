process.env.TZ = 'America/Guayaquil';

import app from './app';
import { config } from './core/config';
import { startRecurrentSupportCron } from './services/recurrencia.service';
import { startHostingDominioCron } from './services/hosting-dominio.service';
import { startReporteDiarioTicketsCron } from './services/reporte-diario-tickets.service';

app.listen(config.PORT, () => {
  console.log(`\nIT CORE SYSTEM API corriendo en http://localhost:${config.PORT}`);
  console.log(`Swagger Docs:           http://localhost:${config.PORT}/docs`);
  startRecurrentSupportCron();
  startHostingDominioCron();
  startReporteDiarioTicketsCron();
});
