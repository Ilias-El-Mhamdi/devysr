import express, { type Express } from 'express';
import { registerHelloController } from './infra/http/controllers/hello.controller';
import { registerExportController } from './infra/http/controllers/export.controller';
import { registerSalesforceSessionController } from './infra/http/controllers/salesforceSession.controller';
import { createExportToSalesforceUseCase } from './core/usecases/exportToSalesforce.uc';
import { createCheckSalesforceSessionUseCase } from './core/usecases/checkSalesforceSession.uc';
import { completeRun, createRun, failRun, hasRunInProgress, outputFilePath } from './infra/store/runs.store';
import { logActivity } from './infra/store/observability.store';
import { runExportJob } from './infra/salesforce/exportJob';
import { getSalesforceSessionCookie } from './infra/salesforce/puppeteerSession';
import { pingSalesforceSession } from './infra/salesforce/sessionCheck';
import { config } from './config';

export function buildApp(): Express {
  const app = express();

  const exportToSalesforce = createExportToSalesforceUseCase({
    reportId: config.salesforce.reportId,
    reportUrl: config.salesforce.reportUrl,
    hasRunInProgress,
    createRun,
    completeRun,
    failRun,
    outputFilePath,
    runExportJob,
    logActivity,
  });

  const checkSalesforceSession = createCheckSalesforceSessionUseCase({
    getSalesforceSessionCookie,
    pingSalesforceSession,
  });

  app.use('/api', registerHelloController());
  app.use('/api', registerExportController({ exportToSalesforce }));
  app.use('/api', registerSalesforceSessionController({ checkSalesforceSession }));

  return app;
}
