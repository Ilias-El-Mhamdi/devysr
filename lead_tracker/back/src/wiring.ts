import express, { type Express } from 'express';
import { registerExportController } from './infra/http/controllers/export.controller';
import { registerImportController } from './infra/http/controllers/import.controller';
import { registerUpsyncController } from './infra/http/controllers/upsync.controller';
import { registerPushController } from './infra/http/controllers/push.controller';
import { registerRunsController } from './infra/http/controllers/runs.controller';
import { registerSalesforceSessionController } from './infra/http/controllers/salesforceSession.controller';
import { createExportToSalesforceUseCase } from './core/usecases/exportToSalesforce.uc';
import { createImportFromSalesforceUseCase } from './core/usecases/importFromSalesforce.uc';
import { createUpsyncFromDistributorsUseCase } from './core/usecases/upsyncFromDistributors.uc';
import { createPushToSalesforceUseCase } from './core/usecases/pushToSalesforce.uc';
import { createRefreshPushStatusUseCase } from './core/usecases/refreshPushStatus.uc';
import { createCheckSalesforceSessionUseCase } from './core/usecases/checkSalesforceSession.uc';
import {
  completeRun,
  createRun,
  failRun,
  getRun,
  hasRunInProgress,
  outputFilePath,
  patchRunResume,
  readRunOutputFile,
  writeRunOutputFile,
} from './infra/store/runs.store';
import { getAllLeads, upsertLead } from './infra/store/leads.store';
import { getAllDistributeurs, saveDistributeur } from './infra/store/distributeurs.store';
import { logActivity } from './infra/store/observability.store';
import { runExportJob } from './infra/salesforce/exportJob';
import { getSalesforceSessionCookie } from './infra/salesforce/puppeteerSession';
import { pingSalesforceSession } from './infra/salesforce/sessionCheck';
import { toBearerToken } from './infra/salesforce/sidToken';
import { fetchLeadFieldsMeta } from './infra/salesforce/leadFieldMeta';
import { fetchReportDescribe } from './infra/salesforce/reportDescribe';
import { appendLeadsToDistributorWorkbook, listDistributorNames, readDistributorLeadsSheet } from './infra/excel/distributorWorkbook';
import { createIngestJob, uploadJobData, closeJob, getJobStatus } from './infra/salesforce/bulkApi';
import { config } from './config';

export function buildApp(): Express {
  const app = express();
  app.use(express.json());

  const exportToSalesforce = createExportToSalesforceUseCase({
    reportId: config.salesforce.reportId,
    reportUrl: config.salesforce.reportUrl,
    hasRunInProgress,
    createRun,
    completeRun,
    failRun,
    outputFilePath,
    getAllLeads,
    runExportJob,
    logActivity,
  });

  const importFromSalesforce = createImportFromSalesforceUseCase({
    hasRunInProgress,
    getExportRun: getRun,
    readRunOutputFile,
    createRun,
    completeRun,
    failRun,
    getAllLeads,
    upsertLead,
    getAllDistributeurs,
    saveDistributeur,
    getSalesforceSessionCookie,
    toBearerToken,
    fetchReportDescribe,
    fetchLeadFieldsMeta,
    appendLeadsToDistributorWorkbook,
    logActivity,
  });

  const upsyncFromDistributors = createUpsyncFromDistributorsUseCase({
    hasRunInProgress,
    createRun,
    completeRun,
    failRun,
    writeRunOutputFile,
    getAllLeads,
    getSalesforceSessionCookie,
    toBearerToken,
    fetchReportDescribe,
    fetchLeadFieldsMeta,
    listDistributorNames,
    readDistributorLeadsSheet,
    logActivity,
  });

  const pushToSalesforce = createPushToSalesforceUseCase({
    hasRunInProgress,
    getUpsyncRun: getRun,
    readRunOutputFile,
    createRun,
    completeRun,
    failRun,
    getSalesforceSessionCookie,
    toBearerToken,
    fetchReportDescribe,
    fetchLeadFieldsMeta,
    createIngestJob,
    uploadJobData,
    closeJob,
    getJobStatus,
    logActivity,
  });

  const refreshPushStatus = createRefreshPushStatusUseCase({
    getRun,
    patchRunResume,
    getSalesforceSessionCookie,
    toBearerToken,
    getJobStatus,
  });

  const checkSalesforceSession = createCheckSalesforceSessionUseCase({
    getSalesforceSessionCookie,
    pingSalesforceSession,
  });

  app.use('/api', registerExportController({ exportToSalesforce }));
  app.use('/api', registerImportController({ importFromSalesforce }));
  app.use('/api', registerUpsyncController({ upsyncFromDistributors }));
  app.use('/api', registerPushController({ pushToSalesforce, refreshPushStatus }));
  app.use('/api', registerRunsController());
  app.use('/api', registerSalesforceSessionController({ checkSalesforceSession }));

  return app;
}
