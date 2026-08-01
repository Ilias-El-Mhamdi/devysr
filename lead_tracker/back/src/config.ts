export const config = {
  salesforce: {
    reportId: process.env.SALESFORCE_REPORT_ID ?? '00Ofj00000FxuDdEAJ',
    instanceHost: process.env.SALESFORCE_INSTANCE_HOST ?? 'orgfarm-fec657de9c-dev-ed.develop.my.salesforce.com',
    reportUrl:
      process.env.SALESFORCE_REPORT_URL ?? 'https://orgfarm-fec657de9c-dev-ed.develop.lightning.force.com/lightning/r/Report/00Ofj00000FxuDdEAJ/edit',
  },
  chrome: {
    debugPort: Number(process.env.CHROME_DEBUG_PORT ?? 9222),
    userDataDir: process.env.CHROME_USER_DATA_DIR,
  },
};
