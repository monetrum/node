'use strict';
global.registry = require('./core/registry');
global.cwd = require('./core/cwd-resolver')(__dirname);

const env = require('dotenv').config({ path: cwd + '/.env' }).parsed || { };
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

async function init(){
    await validator.env.validate(env);
    let knex = require('knex')({ client: 'sqlite3', connection: { filename: cwd + '/data.db' }, useNullAsDefault: true });
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
    await migration(knex);
    //-----------------------------------------------------------------------------//
    httpServer.listen(parseInt(env.LISTEN_PORT), env.LISTEN_HOST);
    let Sync = require('./workers/sync');
    let sync = await new Sync(client, knex);
    let working = false;
    let intervalcb = async () => {
        if(working === true){
            return;
        }

        working = true;
        await stc(async () => await sync.txSynchronize());
        working = false;
    };

    setInterval(intervalcb, 3000);
}

init().then(() => console.log('node başladı', env.LISTEN_HOST, env.LISTEN_PORT)).catch(e => console.error(e));