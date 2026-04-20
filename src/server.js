require('dotenv').config();

const { getEnv } = require('./config/env');
const { app, constants, startSchedulers, logStartupConfig } = require('./app');

getEnv();
startSchedulers();

app.listen(constants.PORT, () => {
  logStartupConfig();
});
