'use strict';
const express = require('express');
const router = express.Router();
const knex = registry.get('knex');
const { stc, queryBuilder, ecdsa } = registry.get('helpers');
const client = registry.get('client');
const { queries } = registry.get('consts');
const validators = require('../../validators/tx');
//--------------------------------------------------------------------------------------------------//

router.get('/last-seq', async (req, res) => {
    let lastTx = await knex.table('tx').select(['seq']).orderBy('seq', 'DESC').limit(1).first();
    res.json(lastTx ? lastTx.seq : 0);
});

//--------------------------------------------------------------------------------------------------//

router.get('/txes', async (req, res) => {
    let from = parseInt(req.query.from || 0);
    let limit = parseInt(req.query.limit || 1000);
    if(limit > 1000){
        limit = 1000;
    }
    
    let txes = [];
    if(from !== NaN  || from !== Infinity){
        txes = await knex.table('tx').where('seq', '>', from).orderBy('seq', 'ASC').limit(limit);
    }

    res.json(txes);
});

//--------------------------------------------------------------------------------------------------//

router.post('/txes', async (req, res) => {
    try {
        let filter = await validators.txes.validate(req.body);
        let filteredKnex =  queryBuilder(knex.table('tx'),  filter);
        let txes = await filteredKnex.limit(1000);
        res.json(txes);
    } catch (e){
        res.json([]);
    }
});

//---------------------------------------------------------------------------------------------------//

router.post('/update-confirm-rate', async (req, res) => {
    let seq = parseInt(req.body.seq || 0);
    if(seq !== NaN || seq !== Infinity){
        let tx = await knex.table('tx').where('seq', seq).limit(1).first();
        if(tx){
            await knex.table('tx').where('seq', seq).update({ confirm_rate: knex.raw('confirm_rate + 1') });
            if(tx.node !== 'masternode'){
                await stc(async () => JSON.parse(await request.post(`${tx.node}/tx/update-confirm-rate`, { json: { seq }})));
                res.json({ status: 'ok' });
                return;
            }
            
            await stc(async () => await client.mutation(queries.updateConfirmRate, { seq }));
        }
    }

    res.json({ status: 'ok' });
});

//------------------------------------------------------------------------------------------------------//

router.post('/send', async (req, res) => {
    try {
        let { from, to, amount, asset, fee_from, desc, data, forms } = req.body;
        let wallet = await knex.table('wallets').select(['id', 'private_key', 'public_key']).where('address', from || 'x').first();
        if(!wallet){
            res.json({ status: 'error', message: 'This wallet is not registered in the local database' });
            return;;
        }

        let nonce = String(new Date().getTime());
        let msg = `${from}__${to}__${0 - Math.abs(amount)}__${asset}__${nonce}`;
        let sign = ecdsa.signing(wallet.private_key, msg);
        let tx = (await client.mutation(queries.send, { from, to, amount, nonce, sign, public_key: wallet.public_key, asset, fee_from, desc, data, forms })).tx.send;
        res.json({ status: 'ok', tx });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});



//-------------------------------------------------------------------------------------------------------//

module.exports = () => router;