'use strict';
const _ = require('lodash');

function deleteProperties(object, properties = []){
    let tmp = _.cloneDeep(object);
    for(let key in tmp){
        if(properties.includes(key)){
            delete tmp[key];
        }
    }

    return tmp;
}

module.exports = deleteProperties;