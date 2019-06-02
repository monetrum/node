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

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

async function init(workerId){
    await validator.env.validate(env);
    let knex = require('knex')({ client: 'sqlite3', connection: { filename: path.join(cwd, 'data.db') }, useNullAsDefault: true });
    let proxy = httpProxy.createProxyServer({ });
    
    proxy.on('error', e => console.error(e.message));
    
    registry.set('proxy', proxy);
    registry.set('knex', knex);
    registry.set('app', app);
    registry.set('env', env);
    registry.set('helpers', requireDir(__dirname + '/helpers', { recurse: true }));
    registry.set('consts', requireDir(__dirname + '/consts', { recurse: true }));
    registry.set('IP_WHITE_LIST', env.IP_WHITE_LIST.split(',').map(x => x.trim()));
    //-----------------------------------------------------------------------------//

    let { loader, createClient, stc } = registry.get('helpers');
    let client = await createClient(env.MASTER_NODE_URL);
    registry.set('client', client);
    //------------------------------------------------------------------------------//
    (new loader(app, __dirname + '/middlewares/app-level')).middlewares();
    (new loader(app, __dirname + '/middlewares/router-level')).routers();
    (new loader(app, __dirname + '/routes')).routers();
    //------------------------------------------------------------------------------//
    let { migration } = registry.get('consts');
    //-----------------------------------------------------------------------------//
    httpServer.listen(parseInt(env.LISTEN_PORT), env.LISTEN_HOST);
    
    if(workerId === 1){
        await migration(knex);
        let Sync = require('./workers/sync');
        let sync = await new Sync(client, knex);
        //----------------------------------------------------------------------------//
        let txWorking = false;
        let txIntervalcb = async () => {
            if(txWorking === true){
                return;
            }

            txWorking = true;
            await stc(() => sync.txSynchronize());
            txWorking = false;
        };

        //---------------------------------------------------------------------------//
        let nodesWorking = false;
        let nodesIntervalcb = async () => {
            if(nodesWorking === true){
                return;
            }

            nodesWorking = true;
            await stc(() => sync.nodeSynchronize());
            nodesWorking = false;
        };

        //---------------------------------------------------------------------------//
        console.log('node listesi güncelleniyor');
        await nodesIntervalcb();

        setInterval(txIntervalcb, 30 * 1000);
        setInterval(nodesIntervalcb, 30 * 60 * 1000);
    }

    process.send({ cmd: 'ok' });
}

if(cluster.isMaster){
    let queue = [];
    let threads = env.THREADS ? parseInt(env.THREADS) : 2;
    for (let i = 0; i < threads; i++) {
        if(queue.length === 0){
            queue.push(cluster.fork());
        }

        queue[ queue.length - 1 ].on('message', msg => {
            if (msg.cmd === 'ok' && i !== (threads - 1) ) queue.push(cluster.fork());
        });
    }

    cluster.on('online', worker => console.log('worker ' + worker.process.pid + ' çalıştı'));
    cluster.on('exit',(worker, code) => {
        console.log('worker ' + worker.process.pid + ' şu kod ile durdu: ' + code);
        console.log('yeni worker başlatılıyor');
        cluster.fork();
    });

} else {
    init(cluster.worker.id).then(() => console.log('node başladı', env.LISTEN_HOST, env.LISTEN_PORT, cluster.worker.id)).catch(e => console.error(e));
}

