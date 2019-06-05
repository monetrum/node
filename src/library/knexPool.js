'use strict';
const path = require('path');
const fs = require('fs-extra');
const { stc } = registry.get('helpers');
const { migration } = registry.get('consts');
const Knex = require('knex');
const emitter = registry.get('emitter');
const pool = new Map();

//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------//
emitter.on('ADD_DB', data => pool.set(data.name, { name: data.name, knex: Knex({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data', data.name) }, useNullAsDefault: true }) }));
//---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------//

class KnexPool {
    constructor(){
        return new Promise(async (resolve, reject) => {
            let fsok = await stc( async () => {
                if(!(await fs.pathExists(path.join(cwd, 'data')))) await fs.ensureDir(path.join(cwd, 'data'));
                this._knex = Knex({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data', 'main.db') }, useNullAsDefault: true });
                //-------------------------------------------------------------------------------------------------------------------------------------//
                await migration(this._knex, 'dbs');
                await migration(this._knex, 'wallets');
                await migration(this._knex, 'scinfo');
                await migration(this._knex, 'nodes');
                //------------------------------------------------------------------------------------------------------------------------------------//
                let lastdb = 0;
                while(true){
                    let dbs = await this._knex.table('dbs').where('id', '>', lastdb).limit(1000);
                    if(dbs.length === 0) break;
                    lastdb = dbs[ dbs.length - 1 ].id;
                    for(let db of dbs){
                        pool.set(db.name, { name: db.name, knex: Knex({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data', db.name) }, useNullAsDefault: true }) });
                    }
                }

                if(lastdb === 0){
                    pool.set('tx-1-1000000.db',{ name: 'tx-1-1000000.db', knex: Knex({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data', 'tx-1-1000000.db') }, useNullAsDefault: true }) });
                    await migration(pool.get('tx-1-1000000.db').knex, 'tx');
                    await this._knex.table('dbs').insert({ name: 'tx-1-1000000.db', min_seq: 1, max_seq: 1000000 });
                    emitter.emit('ADD_DB', { name: 'tx-1-1000000.db', min_seq: 1, max_seq: 1000000 });
                }

                return true;
            });

            if(fsok instanceof Error) return reject(fsok);
            resolve(this);
        });
    }

    async newTxDb(minSeq, maxSeq){
        pool.set(`tx-${minSeq}-${maxSeq}.db`, { name: `tx-${minSeq}-${maxSeq}.db`, knex: Knex({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data', `tx-${minSeq}-${maxSeq}.db`) }, useNullAsDefault: true }) });
        await this._knex.table('dbs').insert({ name: `tx-${minSeq}-${maxSeq}.db`, min_seq: minSeq, max_seq: maxSeq });
        await migration(pool.get(`tx-${minSeq}-${maxSeq}.db`).knex, 'tx');
        emitter.emit('ADD_DB', { name: `tx-${minSeq}-${maxSeq}.db`, min_seq: minSeq, max_seq: maxSeq });
        return pool.get(`tx-${minSeq}-${maxSeq}.db`);
    }

    knex(){
        return this._knex;
    }

    txpool(){
        return pool;
    }

    async poolMap(cb){
        let promises = [];
        for(let p of pool.values()) promises.push(cb(p));
        let res = await stc(() => Promise.all(promises));
        if(res instanceof Error) throw res;
        return res;
    }
}

module.exports = KnexPool;