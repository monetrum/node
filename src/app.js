'use strict';
global.registry = require('./core/registry');
global.cwd = require('./core/cwd-resolver')(__dirname);

const path = require('path');
const cluster = require('cluster');
const env = require('dotenv').config({ path: path.join(cwd, '.env') }).parsed || { };
const express = require('express');
const app = express();
const http = require('http');
const httpServer = http.createServer(app);
const bodyParser = require('body-parser');
const requireDir = require('require-dir');
const httpProxy = require('http-proxy');
const validator = require('./validators/env');
const { EventEmitter } = require('cluster-events');

app.use('/tx', bodyParser.urlencoded({ extended: false }), bodyParser.json());
app.use('/wallet', bodyParser.urlencoded({ extended: false }), bodyParser.json());

async function init(workerId, emitter){
    await validator.env.validate(env);
    //---------------------------------------------------------------------------//
    let proxy = httpProxy.createProxyServer({ });
    proxy.on('error', e => console.error(e.message));
    //--------------------------------------------------------------------------//

    registry.set('emitter', emitter);
    registry.set('proxy', proxy);
    registry.set('app', app);
    registry.set('env', env);
    registry.set('helpers', requireDir(__dirname + '/helpers', { recurse: true }));
    registry.set('consts', requireDir(__dirname + '/consts', { recurse: true }));
    registry.set('IP_WHITE_LIST', env.IP_WHITE_LIST.split(',').map(x => x.trim()));
    registry.set('workerId', workerId);
    //-----------------------------------------------------------------------------//
    
    let { loader, createClient, stc } = registry.get('helpers');
    let client = await createClient(env.MASTER_NODE_URL);
    registry.set('client', client);
    
    //------------------------------------------------------------------------------//
    
    let KnexPool = require('./library/knexPool');
    let knexPool = await new KnexPool();
    registry.set('knexPool', knexPool);
    
    //------------------------------------------------------------------------------//
    (new loader(app, __dirname + '/middlewares/app-level')).middlewares();
    (new loader(app, __dirname + '/middlewares/router-level')).routers();
    (new loader(app, __dirname + '/routes')).routers();
    //------------------------------------------------------------------------------//
    // let { migration } = registry.get('consts');
    //-----------------------------------------------------------------------------//
    httpServer.listen(parseInt(env.LISTEN_PORT), env.LISTEN_HOST);
    if(workerId === 1){
        let Sync = require('./workers/sync');
        let sync = await new Sync(client);
        //----------------------------------------------------------------------------//
        let txWorking = false;
        let txIntervalcb = async () => {
            if(txWorking === true) return;
            txWorking = true;
            let res = await stc(() => sync.txSynchronize());
            if(res instanceof Error) console.error(res);
            txWorking = false;
        };

        //---------------------------------------------------------------------------//
        
        let nodesWorking = false;
        let nodesIntervalcb = async () => {
            if(nodesWorking === true) return;
            nodesWorking = true;
            let res = await stc(() => sync.nodeSynchronize());
            if(res instanceof Error) console.error(res);
            nodesWorking = false;
        };

        //--------------------------------------------------------------------------//
        
        let vacuumWorking = false;
        let vacuumIntervalcb = async () => {
            if(vacuumWorking === true) return;
            vacuumWorking = true;
            let res = await stc(async () => {
                await knexPool.knex().raw('VACUUM');
                console.log('main.db vakumlandı');
                for(let connection of knexPool.txpool().values()){
                    await connection.knex.raw('VACUUM');
                    console.log(connection.name, 'vakumlandı');
                }
            });

            if(res instanceof Error) console.error(res);
            vacuumWorking = false;
        };
        
        //---------------------------------------------------------------------------//
        
        console.log('node listesi güncelleniyor');
        await nodesIntervalcb();
        setInterval(txIntervalcb, 30 * 1000);
        //setInterval(txIntervalcb, 1000);
        setInterval(nodesIntervalcb, 30 * 60 * 1000);
        setInterval(vacuumIntervalcb, 60 * 60 * 1000);
    }

    process.send({ cmd: 'ok' });
}

if(cluster.isMaster){
    let threads = env.THREADS ? parseInt(env.THREADS) : 2;
    let firstWorker = null;
    for (let i = 0; i < threads; i++) {
        if(!firstWorker){
            firstWorker = cluster.fork();
        }

        firstWorker.on('message', msg => {
            if (msg.cmd === 'ok' && i !== (threads - 1)) cluster.fork();
        });
    }

    cluster.on('online', worker => console.log('worker ' + worker.process.pid + ' çalıştı'));
    cluster.on('exit',(worker, code) => {
        console.log('worker ' + worker.process.pid + ' şu kod ile durdu: ' + code);
        console.log('yeni worker başlatılıyor');
        cluster.fork();
    });

} else {
    let emitter = new EventEmitter('nodes');
    init(cluster.worker.id, emitter).then(() => console.log('worker başladı', env.LISTEN_HOST, env.LISTEN_PORT, cluster.worker.id)).catch(e => console.error(e));
}

