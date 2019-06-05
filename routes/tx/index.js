'use strict';
const express = require('express');
const router = express.Router();
const knexPool = registry.get('knexPool');
const { stc, queryBuilder, ecdsa } = registry.get('helpers');
const client = registry.get('client');
const { queries } = registry.get('consts');
const validators = require('../../validators/tx');
//--------------------------------------------------------------------------------------------------//

router.get('/last-seq', async (req, res) => {
    let dbinfo = await knexPool.knex().table('dbs').select('name').orderBy('max_seq', 'DESC').limit(1).first();
    let finded = knexPool.txpool().get(dbinfo.name);
    if(!finded) return res.json({ status: 'ok', seq: 0 });
    let last = await finded.knex.table('tx').select(['seq']).orderBy('seq', 'DESC').limit(1).first();
    res.json({ status: 'ok', seq: last ? last.seq : 0 });
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
        let remaining = limit;
        let dbs = await knexPool.knex().table('dbs').where('min_seq', '>=', from).select('name').orderBy('min_seq', 'ASC');
        for(let db of dbs){
            let dbtxes = await knexPool.txpool().get(db.name).knex.table('tx').where('seq', '>', from).orderBy('seq', 'ASC').limit(remaining);
            txes = [...txes, ...dbtxes];
            remaining -= dbtxes.length;
            if(remaining === 0) break;
        }
    }

    res.json({ status: 'ok', txes });
});

router.get('/tx', async (req, res) => {
    try {
        if(!req.query.hash && !req.query.seq){
            res.json({ status: 'error', message: 'seq or hash required' });
            return;
        }
    
        let tx = {};
        if(req.query.hash){
            tx = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('hash', req.query.hash).limit(1).first()).find(x => x !== undefined));
        }
    
        if(req.query.seq){
            tx = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('seq', req.query.seq).limit(1).first())).find(x => x !== undefined);
        }
        
        res.json({ status: 'ok', tx });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

//--------------------------------------------------------------------------------------------------//

router.post('/txes', async (req, res) => {
    try {
        let filter = await validators.txes.validate(req.body);
        let remaining = 1000;
        let txes = [];
        for(let db of knexPool.txpool().values()){
            let dbtxes = await queryBuilder(db.knex.table('tx'),  filter).orderBy('seq', 'ASC').limit(remaining);
            txes = [...txes, ...dbtxes];
            remaining -= dbtxes.length;
            if(remaining === 0) break;
        }

        res.json({ status: 'ok', txes });
    } catch (e){
        res.json({ status: 'error', message: e.message });
    }
});

//---------------------------------------------------------------------------------------------------//

router.post('/update-confirm-rate', async (req, res) => {
    let seq = parseInt(req.body.seq || 0);
    if(seq !== NaN || seq !== Infinity){
        let dbinfo = knexPool.knex().table('dbs').where('max_seq', '>=', seq).where('min_seq', '<=', seq).limit(1).first();
        if(dbinfo){
            let connection = knexPool.txpool().get(dbinfo.name);
            let tx = await connection.knex.table('tx').where('seq', seq).limit(1).first();
            if(tx){
                await connection.knex.table('tx').where('seq', seq).update({ confirm_rate: knex.raw('confirm_rate + 1') });
                if(tx.node !== 'masternode'){
                    await stc(async () => JSON.parse(await request.post(`${tx.node}/tx/update-confirm-rate`, { json: { seq }})));
                    res.json({ status: 'ok' });
                    return;
                }
                
                await stc(async () => await client.mutation(queries.updateConfirmRate, { seq })); 
            }
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
            return;
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