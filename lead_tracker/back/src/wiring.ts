import express, { type Express } from 'express';
import { registerExportController } from './infra/http/controllers/export.controller';
import { registerImportController } from './infra/http/controllers/import.controller';
import { registerUpscanController } from './infra/http/controllers/upscan.controller';
import { registerPushController } from './infra/http/controllers/push.controller';
import { registerRunsController } from './infra/http/controllers/runs.controller';
import { registerSalesforceSessionController } from './infra/http/controllers/salesforceSession.controller';
import { registerVerifyController } from './infra/http/controllers/verify.controller';
import { registerVersionController } from './infra/http/controllers/version.controller';
import { createExportToSalesforceUseCase } from './core/usecases/exportToSalesforce.uc';
import { createImportFromSalesforceUseCase } from './core/usecases/importFromSalesforce.uc';
import { createUpscanFromDistributorsUseCase } from './core/usecases/upscanFromDistributors.uc';
import { createPushToSalesforceUseCase } from './core/usecases/pushToSalesforce.uc';
import { createRefreshPushStatusUseCase } from './core/usecases/refreshPushStatus.uc';
import { createApplyUpscanDiffToLeadsUseCase } from './core/usecases/applyUpscanDiffToLeads.uc';
import { createVerifyUseCase } from './core/usecases/verify.uc';
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

  const upscanFromDistributors = createUpscanFromDistributorsUseCase({
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

  const applyUpscanDiffToLeads = createApplyUpscanDiffToLeadsUseCase({
    getAllLeads,
    upsertLead,
  });

  const pushToSalesforce = createPushToSalesforceUseCase({
    hasRunInProgress,
    getUpscanRun: getRun,
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
    applyUpscanDiffToLeads,
    logActivity,
  });

  const refreshPushStatus = createRefreshPushStatusUseCase({
    getRun,
    getUpscanRun: getRun,
    readRunOutputFile,
    patchRunResume,
    getSalesforceSessionCookie,
    toBearerToken,
    fetchReportDescribe,
    fetchLeadFieldsMeta,
    getJobStatus,
    applyUpscanDiffToLeads,
  });

  const checkSalesforceSession = createCheckSalesforceSessionUseCase({
    getSalesforceSessionCookie,
    pingSalesforceSession,
  });

  const verify = createVerifyUseCase({
    hasRunInProgress,
    getExportRun: getRun,
    readRunOutputFile,
    createRun,
    completeRun,
    failRun,
    writeRunOutputFile,
    getAllLeads,
    getSalesforceSessionCookie,
    toBearerToken,
    fetchReportDescribe,
    fetchLeadFieldsMeta,
    logActivity,
  });

  app.use('/api', registerExportController({ exportToSalesforce }));
  app.use('/api', registerImportController({ importFromSalesforce }));
  app.use('/api', registerUpscanController({ upscanFromDistributors }));
  app.use('/api', registerPushController({ pushToSalesforce, refreshPushStatus }));
  app.use('/api', registerRunsController());
  app.use('/api', registerSalesforceSessionController({ checkSalesforceSession }));
  app.use('/api', registerVerifyController({ verify }));
  app.use('/api', registerVersionController());

  return app;
}
