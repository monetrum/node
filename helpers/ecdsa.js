'use strict';

const { ec: EC } = require('elliptic');
const ec = new EC('secp256k1');
const RIPEMD160 = require('ripemd160');
const basex = require('base-x');
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const Base58 = basex(alphabet);
// encode = buffer alıp string verir, decode = string alır buffer verir
const crypto = require('crypto');


function createWallet(){
    let keyPair = ec.genKeyPair();
    let privKey = keyPair.getPrivate().toBuffer();
    let pubKey = Buffer.from(keyPair.getPublic().encode('hex'), 'hex');
    if(pubKey.slice(0,1).toString('hex') === '04'){
        pubKey = pubKey.slice(1);
    }

    return {
        publicKey: Base58.encode(pubKey),
        privateKey: Base58.encode(privKey),
        address: generateWalletAddress(pubKey)
    }
}


function checkPrivateKey(privateKey){
    try {
        if(!/^.{42,44}$/g.test(privateKey)){
            return false;
        }

        let hex = Base58.decode(privateKey).toString('hex');
        return /^[0-9A-Fa-f]{62,64}$/g.test(hex);
    } catch (e) {
        return false;
    }
}

function addressFromPublicKey(publicKey){
    return generateWalletAddress(Base58.decode(publicKey));
}

function generateWalletAddress(publicKey) {
    let sha256Digest = crypto.createHash('sha256').update(publicKey).digest();
    let accountId = new RIPEMD160().update(sha256Digest).digest();
    let payload = Buffer.concat([Buffer.from('\x00'), accountId]);
    let digestLevel1 = crypto.createHash('sha256').update(payload).digest();
    let digestLevel2 = crypto.createHash('sha256').update(digestLevel1).digest();
    let checksum = digestLevel2.slice(0, 4);
    let result = Buffer.concat([payload, checksum]);
    return '90x' + Base58.encode(result).toUpperCase();
}

function publicKeyFromPrivateKey(privateKey){
    let decoded = Base58.decode(privateKey);
    let publicKey = Buffer.from(ec.keyFromPrivate(decoded).getPublic().encode('hex'), 'hex');
    if(publicKey.slice(0,1).toString('hex') === '04'){
        publicKey = publicKey.slice(1);
    }

    return Base58.encode(publicKey);
}

function verify(publicKey, msg, signature){
    try {
        if(!(/[0-9A-Fa-f]+/g.test(signature))){
            return false;
        }

        let pub = Base58.decode(publicKey);
        let hash = crypto.createHash('sha256').update(Buffer.from(msg, 'utf8')).digest().toString('hex');
        if(pub.slice(0,1).toString('hex') !== '04'){
            pub = Buffer.concat([Buffer.from('04', 'hex'), pub]);
        }

        return (ec.keyFromPublic(pub, 'hex').verify(hash, signature));

    } catch (e) {
        return false;
    }
}

function signing(privateKey, msg){
    let key = ec.keyFromPrivate(Base58.decode(privateKey), 'hex');
    let hash = crypto.createHash('sha256').update(Buffer.from(msg, 'utf8')).digest().toString('hex');
    let der = key.sign(hash, 'hex', { canonical: true }).toDER();
    return Buffer.from(der).toString('hex');
}

module.exports = {
    createWallet,
    generateWalletAddress,
    publicKeyFromPrivateKey,
    addressFromPublicKey,
    verify,
    signing,
    checkPrivateKey
};