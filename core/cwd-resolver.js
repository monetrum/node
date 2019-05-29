'use strict';
const path = require('path');
const cwdarr = process.execPath.split('/');
cwdarr.splice(cwdarr.length - 1, 1);

module.exports = dirname => dirname.indexOf('/snapshot') !== -1 ? path.join('/', ...cwdarr) : dirname;