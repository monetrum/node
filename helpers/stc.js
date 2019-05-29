'use strict';

async function stc(callback){
    try {
        return await callback();
    } catch (e) {
        return e;
    }
}

module.exports = stc;