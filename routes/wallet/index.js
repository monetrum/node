'use strict';
const express = require('express');
const router = express.Router();
const knex = registry.get('knex');
const client = registry.get('client');
const { queries } = registry.get('consts');
const { ecdsa } = registry.get('helpers');
const validators = require('../../validators/wallet');

//--------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/save', async (req, res) => {
    try {
        let { account_id, contract_id, wallet_data } = await validators.save.validate(req.body, { allowUnknown: true });
        let { publicKey, address, privateKey } = ecdsa.createWallet();
        let resp = (await client.mutation(queries.save, { account_id, contract_id, wallet_data, public_key: publicKey, address })).wallet.save;
        let insert = { account_id, asset: 'MNT', address, insert_time: new Date().getTime(), public_key: publicKey, private_key: privateKey, contract_id };
        let id = (await knex.table('wallets').insert(insert)).shift();
        res.json({ status: 'ok', wallet: { id, ...resp, ...insert } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

//-------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/generate', async (req, res) => {
    try {
        let { account_id, contract_id, wallet_data } = await validators.generate.validate(req.body, { allowUnknown: true });
        let { private_key, public_key, address } = (await client.mutation(queries.generate, { account_id, contract_id, wallet_data })).wallet.generate;
        let insert = { account_id, asset: 'MNT', address, insert_time: new Date().getTime(), public_key, private_key, contract_id };
        let id = (await knex.table('wallets').insert(insert)).shift();
        res.json({ status: 'ok', wallet: { id, ...insert } });
    } catch (e) {
        console.log(e);
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
        let first = await knex.table('wallets').where('address', '=' , address).select(['id']).limit(1).first();
        let id = 0;
        if(!first){
            let insert = { account_id, asset: 'MNT', address, insert_time: new Date().getTime(), public_key, private_key, contract_id };
            id = (await knex.table('wallets').insert(insert)).shift();
        }

        res.json({ status: 'ok', wallet: { id, ...insert} });
    } catch(e){
        res.json({ status: 'error', message: e.message });
    }
});

//--------------------------------------------------------------------------------------------------------------------------------------------------------//

router.post('/update', async (req, res) => {
    try {
        let { address, contract_id, wallet_data } = req.body;
        let wallet = await knex.table('wallets').select(['id', 'public_key']).where('address', address).limit(1).first();
        if(!wallet){
            res.json({ status: 'error', message: 'This wallet is not registered in the local database' });
            return;
        }
        
        let resp = (await client.mutation(queries.update, { public_key: wallet.public_key, contract_id, wallet_data })).wallet.update;
        await knex.table('wallets').where('address', address).update({ contract_id: contract_id || null });
        res.json({ status: 'error', wallet: { id: wallet.id, ...resp } });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

router.get('/balance', async (req, res) => {
    if(!req.query.address || !req.query.asset){
        res.json({ status: 'ok', balance: 0 });
        return;
    }

    let first = await knex.table('tx').where('from', req.query.address).where('asset', req.query.asset).whereIn('type', [ -2, 1, 2, 3, 4 ]).sum({ balance: 'amount'}).first();
    res.json({ status: 'ok', balance: first.balance || 0.00 });
});

//-------------------------------------------------------------------------------------------------------------------------------------------------------//



module.exports = () => router;