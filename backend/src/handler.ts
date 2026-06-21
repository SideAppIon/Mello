import express from 'express';
import cors from 'cors';
import serverless from 'serverless-http';

import authRouter from './routes/auth';
import companiesRouter from './routes/companies';
import projectsRouter from './routes/projects';
import boardsRouter from './routes/boards';
import columnsRouter from './routes/columns';
import tasksRouter from './routes/tasks';
import calendarRouter from './routes/calendar';
import bookingRouter from './routes/booking';
import { errorHandler, notFound } from './middleware/errors';

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  credentials: true,
}));
app.use(express.json());

app.use('/api/auth', authRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/projects/:projectId/boards', boardsRouter);
app.use('/api/boards/:boardId/columns', columnsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/booking', bookingRouter);

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use(notFound);
app.use(errorHandler);

// Yandex Cloud Functions handler
const appHandler = serverless(app);

module.exports.handler = async (event: any, context: any) => {
  // Yandex Cloud передаёт реальный путь в event.url
  const fixedEvent = {
    ...event,
    path: event.url?.split('?')[0] || '/',
    httpMethod: event.httpMethod,
  };
  return appHandler(fixedEvent, context);
};
