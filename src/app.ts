import express from 'express';
import cors from 'cors';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { config } from './core/config';

import { authRouter } from './routes/auth.routes';
import { usuariosRouter } from './routes/usuarios.routes';
import { ticketsRouter } from './routes/tickets.routes';
import { inventariosRouter } from './routes/inventarios.routes';
import { proyectosRouter } from './routes/proyectos.routes';
import chatsRouter from './routes/chats.routes';
import { guardiasRouter } from './routes/guardias.routes';
import { personasRouter } from './routes/personas.routes';
import { consumiblesRouter } from './routes/consumibles.routes';
import { plantillasRouter } from './routes/plantillas.routes';
import { proveedoresRouter } from './routes/proveedores.routes';
import { empresasRouter } from './routes/empresas.routes';
import reportesRouter from './routes/reportes.routes';
import path from 'path';

const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Habilitar descargas estáticas físicas de la carpeta de uploads
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: config.PROJECT_NAME,
      version: config.VERSION,
      description: 'API REST del sistema IT CORE de SMO'
    },
    servers: [{ url: `http://localhost:${config.PORT}`, description: 'Servidor de desarrollo' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  },
  apis: ['./src/routes/*.ts']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.17.14/swagger-ui.min.css',
  swaggerOptions: { persistAuthorization: true }
}));
app.get('/docs-json', (_req, res) => res.json(swaggerSpec));

// Routes
const API = config.API_V1_STR;
app.use(`${API}/auth`, authRouter);
app.use(`${API}/usuarios`, usuariosRouter);
app.use(`${API}/tickets`, ticketsRouter);
app.use(`${API}/reportes`, reportesRouter);
app.use(`${API}/inventarios`, inventariosRouter);
app.use(`${API}/proyectos`, proyectosRouter);
app.use(`${API}/chats`, chatsRouter);
app.use(`${API}/guardias`, guardiasRouter);
app.use(`${API}/personas`, personasRouter);
app.use(`${API}/consumibles`, consumiblesRouter);
app.use(`${API}/plantillas`, plantillasRouter);
app.use(`${API}/proveedores`, proveedoresRouter);
app.use(`${API}/empresas`, empresasRouter);

// Root health check
app.get('/', (_req, res) => {
  res.json({ message: 'IT CORE SYSTEM API is running on Node.js + Express + TypeScript' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ detail: 'Error interno del servidor', error: err.message });
});

export default app;
