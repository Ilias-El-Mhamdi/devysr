import express, { type Express } from 'express';
import { registerHelloController } from './infra/http/controllers/hello.controller';

export function buildApp(): Express {
  const app = express();

  app.use('/api', registerHelloController());

  return app;
}
