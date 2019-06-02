'use strict';
const path = require('path');

function cwdResolver(dirname) {
    if(dirname.indexOf('/snapshot') === -1) return dirname;
    let execArr = process.execPath.split(path.sep);
    let cwdArr = execArr.slice(0, execArr.length - 1).map(x => x === '' ? path.sep : x);
    return path.join(...cwdArr);
}

module.exports = cwdResolver;