import app from './app';
import { config } from './core/config';
import { startRecurrentSupportCron } from './services/recurrencia.service';

app.listen(config.PORT, () => {
  console.log(`\n🚀 IT CORE SYSTEM API corriendo en http://localhost:${config.PORT}`);
  console.log(`📚 Swagger Docs:           http://localhost:${config.PORT}/docs`);
  console.log(`🔑 API Base:               http://localhost:${config.PORT}${config.API_V1_STR}\n`);
  
  // Iniciar Cron de Soportes Recurrentes
  startRecurrentSupportCron();
});
