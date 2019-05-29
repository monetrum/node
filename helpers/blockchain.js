'use strict';
const crypto = require('crypto');
const requiredProps = ['prevHash', 'from', 'to', 'amount', 'asset', 'nonce'];

function validateProof(lastProof, proof, lastHash){
    let msg = `${lastProof}${proof}${lastHash}`;
    let hex = crypto.createHash('sha256').update(msg).digest().toString('hex');
    return hex.substr(0, 4) === '0000';
}

function proofOfWork(lastProof, lastHash){
    let proof = 0;
    while (!validateProof(lastProof, proof, lastHash)){
        proof++;
    }

    return proof;
}

function createHash(params){
    if(typeof params !== 'object'){
        throw new Error('params can only be object');
    }

    for(let prop of requiredProps){
        if(prop !== 'prevHash' && !(prop in params)){
            throw new Error(prop + ' is required');
        }
    }

    let str = '';
    if(typeof params.prevHash === 'string'){
        str += params.prevHash;
    }

    str += '__' + String(params.from);
    str += '__' + String(params.to);
    str += '__' + String(params.amount);
    str += '__' + String(params.asset);
    str += '__' + String(params.nonce);
    return crypto.createHash('sha256').update(str).digest().toString('hex');
}

module.exports = { validateProof, proofOfWork, createHash };