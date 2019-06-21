'use strict';
const express = require('express');
const router = express.Router();
const knexPool = registry.get('knexPool');
const client = registry.get('client');
const { queries } = registry.get('consts');
const { ecdsa, queryBuilder } = registry.get('helpers');
const validators = require('../../validators/wallet');
const env = registry.get('env');

//--------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/save', async (req, res) => {
    try {
        let { account_id, contract_id, wallet_data } = await validators.save.validate(req.body, { allowUnknown: true });
        let { publicKey, address, privateKey } = ecdsa.createWallet();
        let resp = (await client.mutation(queries.save, { account_id, contract_id, wallet_data, public_key: publicKey, address })).wallet.save;
        let insert = { account_id: account_id || env.ACCOUNT_ID, asset: 'MNT', address, insert_time: new Date().getTime(), public_key: publicKey, private_key: privateKey, contract_id };
        let id = (await knexPool.knex().table('wallets').insert(insert)).shift();
        res.json({ status: 'ok', wallet: { id, ...resp, ...insert } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

//-------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/generate', async (req, res) => {
    try {
        let { account_id, contract_id, wallet_data } = await validators.generate.validate(req.body, { allowUnknown: true });
        let { private_key, public_key, address } = (await client.mutation(queries.generate, { account_id: account_id || env.ACCOUNT_ID, contract_id, wallet_data })).wallet.generate;
        let insert = { account_id: account_id || env.ACCOUNT_ID, asset: 'MNT', address, insert_time: new Date().getTime(), public_key, private_key, contract_id };
        let id = (await knexPool.knex().table('wallets').insert(insert)).shift();
        res.json({ status: 'ok', wallet: { id, ...insert } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

//-------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/import', async (req, res) => {
    try {
        let { account_id, private_key, contract_id } = await validators.import.validate(req.body);
        if(!ecdsa.checkPrivateKey(private_key)){
            throw new Error('invalid private_key');
        }

        let public_key = ecdsa.publicKeyFromPrivateKey(private_key);
        let address = ecdsa.addressFromPublicKey(public_key);
        let first = await knexPool.knex().table('wallets').where('address', '=' , address).select(['id']).limit(1).first();
        let id = 0;
        let insert = { account_id: account_id || env.ACCOUNT_ID, asset: 'MNT', address, insert_time: new Date().getTime(), public_key, private_key, contract_id };
        if(!first){
            id = (await knexPool.knex().table('wallets').insert(insert)).shift();
        }

        res.json({ status: 'ok', wallet: { id, ...insert } });
    } catch(e){
        res.json({ status: 'error', message: e.message });
    }
});

router.get('/import', async (req, res) => {
    try {
        let private_key = req.query.private_key || 'x';
        let account_id = req.query.account_id;
        
        if(!ecdsa.checkPrivateKey(private_key)){
            throw new Error('invalid private_key');
        }

        let public_key = ecdsa.publicKeyFromPrivateKey(private_key);
        let address = ecdsa.addressFromPublicKey(public_key);
        let first = await knexPool.knex().table('wallets').where('address', '=' , address).select(['id']).limit(1).first();
        let id = 0;
        let insert = { account_id: account_id || env.ACCOUNT_ID, asset: 'MNT', address, insert_time: new Date().getTime(), public_key, private_key, contract_id: null };
        if(!first){
            id = (await knexPool.knex().table('wallets').insert(insert)).shift();
        }

        res.json({ status: 'ok', wallet: { id, ...insert } });
    } catch(e){
        res.json({ status: 'error', message: e.message });
    }
});

router.get('/export', async(req, res) => {
    let wallet = await knexPool.knex().table('wallets').where('address', req.query.address || 'x').select(['public_key', 'private_key', 'address']).limit(1).first();
    if(!wallet){
        res.json({ status: 'error', message: 'ilgili cüzdan kayıtlı değil' });
        return;
    }

    res.json({ status: 'ok', wallet });
});

//--------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/update', async (req, res) => {
    try {
        let { address, contract_id, wallet_data } = req.body;
        let wallet = await knexPool.knex().table('wallets').select(['id', 'public_key', 'private_key']).where('address', address || '1').limit(1).first();
        if(!wallet){
            res.json({ status: 'error', message: 'This wallet is not registered in the local database' });
            return;
        }
        
        let sign = ecdsa.signing(wallet.private_key, 'OK');
        let resp = (await client.mutation(queries.update, { public_key: wallet.public_key, sign, contract_id, wallet_data })).wallet.update;
        await knexPool.knex().table('wallets').where('address', address).update({ contract_id: contract_id || null });
        res.json({ status: 'error', wallet: { id: wallet.id, ...resp } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

//---------------------------------------------------------------------------------------------------------------------------------------------------------//

router.get('/balance', async (req, res) => {
    try {
        if(!req.query.address || !req.query.asset){
            res.json({ status: 'ok', balance: 0 });
            return;
        }
    
        let balance = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', req.query.address).where('asset', req.query.asset).whereIn('type', [ -2, 1, 2, 3, 4 ]).sum({ balance: 'amount'}).first())).reduce((acc, value) => value ? acc + value.balance : acc, 0);
        res.json({ status: 'ok', balance });
    } catch(e) {
        res.json({ status: 'error', message: e.message });
    }
});

//---------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/wallets', async (req, res) => {
    try {
        let filter = await validators.wallets.validate(req.body);
        let filteredKnex = queryBuilder(knexPool.knex().table('wallets'), filter);
        let wallets = await filteredKnex.limit(1000);
        res.json({ status: 'ok', wallets });
    } catch (e){
        res.json({ status: 'error', message: e.message });
    }
});


router.get('/wallet', async (req, res) => {
    try {
        let address = req.query.address;
        let wallet = knexPool.knex().table('wallet').where('address', address || '1').limit(1).first();
        res.json({ status: 'ok', wallet: wallet || { } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }    
});
//-------------------------------------------------------------------------------------------------------------------------------------------------------//

module.exports = () => router;