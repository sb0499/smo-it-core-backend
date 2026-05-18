import app from './app';
import { config } from './core/config';

app.listen(config.PORT, () => {
  console.log(`\n🚀 IT CORE SYSTEM API corriendo en http://localhost:${config.PORT}`);
  console.log(`📚 Swagger Docs:           http://localhost:${config.PORT}/docs`);
  console.log(`🔑 API Base:               http://localhost:${config.PORT}${config.API_V1_STR}\n`);
});
