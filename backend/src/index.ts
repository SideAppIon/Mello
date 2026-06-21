import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import authRouter from './routes/auth';
import companiesRouter from './routes/companies';
import projectsRouter from './routes/projects';
import boardsRouter from './routes/boards';
import columnsRouter from './routes/columns';
import tasksRouter from './routes/tasks';
import calendarRouter from './routes/calendar';
import bookingRouter from './routes/booking';
import notificationsRouter from './routes/notifications';
import { errorHandler, notFound } from './middleware/errors';

const app = express();
const PORT = process.env.PORT || 3001;

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
app.use('/api/notifications', notificationsRouter);

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Mello API running on port ${PORT}`);
});
