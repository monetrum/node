'use strict';
const { queries } = registry.get('consts');
const request = require('request-promise-native');
const { stc, ecdsa, blockchain, sleep, systeminfo } = registry.get('helpers');
const env = registry.get('env');
const knexPool = registry.get('knexPool');

async function formatter(callback, field = undefined){
    try {
        let res = await callback();
        let jsonres = typeof res === 'object' ? res : JSON.parse(res);
        if(jsonres.status === 'error') throw new Error(jsonres.message);
        return field ? jsonres[field] : jsonres;
    } catch (e) {
        return e; 
    }
}


class Sync {
    constructor(client){
        return new Promise( async (resolve, reject) => {
            console.log('sistem bilgileriniz ve internet hızınız hesaplanıyor');
            this.client = client;
            //---------------------------------------------------------------------------------------------------------------------------------------------------------------//            
            let sendinfo = await stc(async () => await this.client.mutation(queries.addNode, { info: { ... await systeminfo(), port: parseInt(env.LISTEN_PORT), ssl: env.SSL === '1' }}));
            if(sendinfo instanceof Error) {
                reject(sendinfo);
                return;
            }
            //---------------------------------------------------------------------------------------------------------------------------------------------------------------//
            let scinfo = await stc(() => this.client.query(queries.scinfo, {}));
            if(scinfo instanceof Error) {
                reject(scinfo);
                return;
            }

            let { address, public_key } = scinfo.smartContractInfo;
            let exists = await knexPool.knex().table('scinfo').where('address', address).where('public_key', public_key).limit(1).first();
            if(!exists){
                await knexPool.knex().table('scinfo').insert({ address, public_key });
            }
            //---------------------------------------------------------------------------------------------------------------------------------------------------------------//
            let defautWallet = await knexPool.knex().table('wallets').where('default', true).limit(1).first();
            if(!defautWallet){
                let { publicKey, address, privateKey } = ecdsa.createWallet();
                let saved = await stc(() => this.client.mutation(queries.save, { account_id: env.ACCOUNT_ID, contract_id: null, wallet_data: { }, public_key: publicKey, address }));
                if(saved instanceof Error) return reject(new Error('Ana cüzdan kayıt edilemedi'));
                let insert = { account_id: env.ACCOUNT_ID, asset: 'MNT', address, insert_time: new Date().getTime(), public_key: publicKey, private_key: privateKey, contract_id: null, default: true };
                await knexPool.knex().table('wallets').insert(insert);
            }
            //---------------------------------------------------------------------------------------------------------------------------------------------------------------//
            resolve(this);
        });
    }

    async getBalance(address, asset){
        return (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', address).where('asset', asset).whereIn('type', [ -2, 1, 2, 3, 4 ]).sum({ balance: 'amount'}).first())).reduce((acc, value) => value ? acc + value.balance : balance, 0);
    }

    async *nodesIterator(){
        let lastId = 0;
        while(true){
            let nodes = await knexPool.knex().table('nodes').where('id', '>', lastId).limit(1000);
            if(nodes.length === 0){
                break;
            }

            lastId = nodes[ nodes.length -1 ].id;
            for(let node of nodes){
                yield node;
            }
        }
    }

    async checkNodeSeq(ip, port, ssl = false){
        return await formatter(() => request.get(`${ssl == true ? 'https' : 'http:'}//${ip}:${port}/tx/last-seq`), 'seq');
    }

    async reportConfirmRate(ip, port, ssl = false, seq){
        return await formatter(() => request.post(`${ssl == true ? 'https' : 'http:'}//${ip}:${port}/tx/update-confirm-rate`, { json: { seq }}));
    }

    async lastSeq(){
        let dbinfo = await knexPool.knex().table('dbs').select('name').orderBy('max_seq', 'DESC').limit(1).first();
        let finded = knexPool.txpool().get(dbinfo.name);
        if(!finded) return 0;
        let last = await finded.knex.table('tx').select(['seq']).orderBy('seq', 'DESC').limit(1).first();
        return last ? last.seq : 0;
    }

    async *nodeTxIterator(ip, port, from = 0, ssl = false){
        let lastSeq = from;
        while(true){
            let txes = await formatter(() => request.get(`${ssl == true ? 'https:' : 'http:'}//${ip}:${port}/tx/txes?from=${lastSeq}&limit=1000`), 'txes');
            if(txes instanceof Error){
                yield new Error('tx çekme başarısız');
                return;
            }

            if(txes.length === 0){
                break;
            }

            if(txes.find(tx => tx.type === -1 || tx.type === -2 )){
                yield new Error('txes not completed');
                return;
            }

            lastSeq = txes[ txes.length -1 ].seq;
            for(let tx of txes){
                yield tx;
            }
        }
    }

    async *mnTxIterator(seq){
        let cursor = null;
        while(true){
            let resp = await stc(() => (this.client.query(queries.getTxList, { filters: { seq: { gt: seq } }, sorting: { _id: 'ASC', seq: 'ASC' }, limit: 100, cursor })));
            if(resp instanceof Error){
                yield new Error('tx çekme başarısız');
                return;
            }

            if(resp.tx.getTxList.transactions.length === 0){
                break;
            }

            if(resp.tx.getTxList.transactions.find(tx => tx.type === -1 || tx.type === -2 )){
                console.log('okokokokok')
                await sleep(2000);
                continue;
            }

            cursor = resp.tx.getTxList.next_cursor;
            for(let tx of resp.tx.getTxList.transactions){
                delete tx.__typename;
                tx.data = JSON.stringify(tx.data);
                yield tx;
            }
        }
    }


    async nodeSynchronize(){
        let cursor = null;
        while(true){
            let resp = await stc(() => this.client.query(queries.getNodes, { filters: { }, sorting: { _id: 'ASC' }, limit: 1000, cursor }));
            if(resp instanceof Error){
                console.log('node listesi çekme başarısız', resp.message);
                return;
            }

            cursor = resp.nodes.getNodes.next_cursor;
            if(resp.nodes.getNodes.nodes.length === 0){
                break;
            }

            for(let node of resp.nodes.getNodes.nodes){
                delete node.__typename;
                if(!(node.ip === env.LISTEN_HOST && node.port === parseInt(env.LISTEN_PORT))){
                    let localNode = await knexPool.knex().table('nodes').where('ip', node.ip).where('port', node.port).first();
                    if(localNode && node.accessible_service === false){
                        await knexPool.knex().table('nodes').where('id', localNode.id).delete();
                        continue;
                    }

                    if(!localNode && node.accessible_service === true){
                        await knexPool.knex().table('nodes').insert({ ip: node.ip, port: node.port, ssl: node.ssl });
                        continue;
                    }
                }
            }
        }
    }

    async txSynchronize(){
        let sync = false;
        let localSeq = await this.lastSeq();
        //console.log('localde bulunan son tx sequence numarası', localSeq);
        nodesfor:
        for await (let node of this.nodesIterator()){
            let nodeLastSeq = await this.checkNodeSeq(node.ip, node.port, node.ssl);
            if(nodeLastSeq instanceof Error){
                console.log(node.ip, node.port, 'node`una erişilemedi. Başka node deneniyor');
                continue;
            }

            if(nodeLastSeq <= localSeq){
                console.log(node.ip, node.port, 'node`u', nodeLastSeq, 'sequence numarasına sahip. Localdeki sequence nmarası ', localSeq , ' Başka node deneniyor');
                continue;
            }

            let seq = await this.lastSeq();
            txfor:
            for await (let tx of this.nodeTxIterator(node.ip, node.port, seq, node.ssl)){
                if(tx instanceof Error){
                    console.log(node.ip, node.port, 'node`undan tx çekme başarısız başka node`a geçiliyor');
                    sync = false;
                    break txfor;
                }
                
                if(tx.type === 1){
                    let balance = await this.getBalance(tx.from, tx.asset);
                    if(balance < Math.abs(tx.amount)){
                        console.log(tx.from, 'bakiyesi yetersiz. Bu işlem illegal');
                        sync = false;
                        break txfor;
                    }

                    if(!ecdsa.verify(tx.public_key, `${tx.from}__${tx.to}__${tx.amount}__${tx.asset}__${tx.nonce}`, tx.sign)){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        break txfor;
                    }

<<<<<<< HEAD:workers/sync.js
                    if(tx.contract_wallet && ecdsa.addressFromPublicKey(tx.public_key) !== tx.contract_wallet){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        break txfor;
=======
                    if(tx.contract_wallet){
                        if(ecdsa.addressFromPublicKey(tx.public_key) !== tx.contract_wallet){
                            console.log('contract server adına illegal işlem', tx.seq, tx.hash);
                            sync = false;
                            break txfor;
                        }

                        let exists = await knexPool.knex().table('scinfo').where('public_key', tx.public_key).where('address', tx.contract_wallet).limit(1).first();
                        if(!exists){
                            console.log('contract server adına illegal işlem', tx.seq, tx.hash);
                            sync = false;
                            break txfor;
                        }
>>>>>>> development:src/workers/sync.js
                    }

                    if(!tx.contract_wallet && ecdsa.addressFromPublicKey(tx.public_key) !== tx.from){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        break txfor;
                    }
                }

                if(tx.type === 2){
                    let exists = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('asset', tx.asset).select(['id']).limit(1).first())).find(e => e !== undefined);
                    if(exists){
                        let t2count = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', tx.from).where('to', tx.to).where('asset', tx.asset).where('type', 2).count({ t2count: 'id' }).first())).reduce((acc, value) => value ? acc + value.t2count : acc, 0);
                        let t1count = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', tx.to).where('to', tx.from).where('asset', tx.asset).where('type', 1).count({ t1count: 'id' }).first())).reduce((acc, value) => value ? acc + value.t1count : acc, 0);
                        if(t2count > t1count){
                            console.log('illegal para girişi', tx.seq, tx.hash);
                            sync = false;
                            break txfor;
                        }
                    }
                }
                
                let hash = blockchain.createHash({ prevHash: tx.prev_hash, from: tx.from, to: tx.to, amount: tx.amount, asset: tx.asset, nonce: tx.nonce });
                if(hash !== tx.hash){
                    console.log('hash geçersiz', hash + ' != ' + tx.hash);
                    sync = false;
                    break txfor;
                }
                
                let nodeAddress = `${node.ssl == true ? 'https:' : 'http:'}//${node.ip}:${node.port}`;
                let pooldb = await knexPool.knex().table('dbs').where('max_seq', '>=', tx.seq).where('min_seq', '<=', tx.seq).limit(1).first();
                if(!pooldb){
                    pooldb = await knexPool.newTxDb(tx.seq, tx.seq + 999999 );
                }

                let inserted = await stc(() => knexPool.txpool().get(pooldb.name).knex.table('tx').insert({ ...tx, confirm_rate: tx.confirm_rate + 1, node: nodeAddress }));
                if(inserted instanceof Error){
                    throw new Error('işlem veritabanına eklenemedi', inserted.message);
                }

                await this.reportConfirmRate(node.ip, node.port, node.ssl, tx.seq);
                console.log('yeni işlem ', tx.seq, tx.hash, node.ip, node.port);

                if(tx.seq === nodeLastSeq){
                    console.log('senkronizasyon bitti');
                    sync = true;
                    break nodesfor;
                }
            }
        }

        if(sync === false){
            let seq = await this.lastSeq();
            for await (let tx of this.mnTxIterator(seq)){
                if(tx instanceof Error){
                    throw new Error('işlem çekme başarısız ' + tx.message);
                }

                if(tx.type === 1){
                    let balance = await this.getBalance(tx.from, tx.asset);
                    if(balance < Math.abs(tx.amount)){
                        console.log(tx.from, 'bakiyesi yetersiz. Bu işlem illegal');
                        sync = false;
                        return;
                    }

                    if(!ecdsa.verify(tx.public_key, `${tx.from}__${tx.to}__${tx.amount}__${tx.asset}__${tx.nonce}`, tx.sign)){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        return;
                    }

                    if(tx.contract_wallet){
                        if(ecdsa.addressFromPublicKey(tx.public_key) !== tx.contract_wallet){
                            console.log('contract server adına illegal işlem', tx.seq, tx.hash);
                            sync = false;
                            return;
                        }

<<<<<<< HEAD
<<<<<<< HEAD:workers/sync.js
=======
                    if(tx.contract_wallet && !ecdsa.verify(tx.public_key, tx.from, tx.contract_sign)){
                        console.log('imza geçersiz bu işlem smart contract tarafından yapılmamış', tx.seq, tx.hash);
                        break;
                    }

>>>>>>> development:src/workers/sync.js
                    if(!tx.contract_wallet && (ecdsa.addressFromPublicKey(tx.public_key) !== tx.from)){
=======
                        let exists = await knexPool.knex().table('scinfo').where('public_key', tx.public_key).where('address', tx.contract_wallet).limit(1).first();
                        if(!exists){
                            console.log('contract server adına illegal işlem', tx.seq, tx.hash);
                            sync = false;
                            return;
                        }
                    }

                    if(!tx.contract_wallet && ecdsa.addressFromPublicKey(tx.public_key) !== tx.from){
>>>>>>> development
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        return;
                    }
                }

                if(tx.type === 2){
                    let exists = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('asset', tx.asset).select(['id']).limit(1).first())).find(e => e !== undefined);
                    if(exists){
                        let t2count = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', tx.from).where('to', tx.to).where('asset', tx.asset).where('type', 2).count({ t2count: 'id' }).first())).reduce((acc, value) => value ? acc + value.t2count : acc, 0);
                        let t1count = (await knexPool.poolMap(({ knex }) => knex.table('tx').where('from', tx.to).where('to', tx.from).where('asset', tx.asset).where('type', 1).count({ t1count: 'id' }).first())).reduce((acc, value) => value ? acc + value.t1count : acc, 0);
                        if(t2count > t1count){
                            console.log('illegal para girişi', tx.seq, tx.hash);
                            sync = false;
                            return;
                        }
                    }
                }
                
                let hash = blockchain.createHash({ prevHash: tx.prev_hash, from: tx.from, to: tx.to, amount: tx.amount, asset: tx.asset, nonce: tx.nonce });
                if(hash !== tx.hash){
                    console.log('hash geçersiz', hash + ' != ' + tx.hash);
                    sync = false;
                    return;
                }

                let pooldb = await knexPool.knex().table('dbs').where('max_seq', '>=', tx.seq).where('min_seq', '<=', tx.seq).limit(1).first();
                if(!pooldb){
                    pooldb = await knexPool.newTxDb(tx.seq, tx.seq + 999999 );
                }

                let inserted = await stc(() => knexPool.txpool().get(pooldb.name).knex.table('tx').insert({ ...tx, confirm_rate: tx.confirm_rate + 1, node: 'masternode' }));
                if(inserted instanceof Error){
                    throw new Error('işlem veritabanına eklenemedi', inserted.message);
                }

                await stc(async () => await this.client.mutation(queries.updateConfirmRate, { seq: tx.seq }));
                console.log('yeni işlem', tx.seq, tx.hash, 'masternode');
            }
        }
    }
}

module.exports = Sync;