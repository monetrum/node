'use strict';
const { queries } = registry.get('consts');
const request = require('request-promise-native');
const { stc, ecdsa, blockchain, sleep, systeminfo } = registry.get('helpers');
const env = registry.get('env');

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
    constructor(client, knex){
        return new Promise( async (resolve, reject) => {
            console.log('sistem bilgileriniz ve internet hızınız hesaplanıyor');
            this.knex = knex;
            this.client = client;            
            let result = await stc(async () => await this.client.mutation(queries.addNode, { info: { ... await systeminfo(), port: parseInt(env.LISTEN_PORT), ssl: env.SSL === '1' }}));
            if(result instanceof Error){
                reject(result);
            }

            resolve(this);
        });
    }

    async getBalance(address, asset){
        let first = await this.knex.table('tx').where('from', address).where('asset', asset).whereIn('type', [ -2, 1, 2, 3, 4 ]).sum({ balance: 'amount'}).first();
        return first.balance || 0.00;
    }

    async *nodesIterator(){
        let lastId = 0;
        while(true){
            let nodes = await this.knex('nodes').where('id', '>', lastId).limit(1000);
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
        let lastTx = await this.knex.table('tx').select(['seq']).orderBy('seq', 'DESC').limit(1).first();
        return lastTx ? lastTx.seq : 0;
    }

    async *nodeTxIterator(ip, port, from = 0, ssl = false){
        let lastSeq = from;
        while(true){
            let txes = await formatter(() => request.get(`${ssl == true ? 'https:' : 'http:'}//${ip}:${port}/tx/txes?from=${lastSeq}&limit=1000`), 'txes');
            if(txes instanceof Error){
                yield new Error('txes fetch failed');
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
            let resp = await stc(async () => (await this.client.query(queries.getTxList, { filters: { seq: { gt: seq } }, sorting: { _id: 'ASC', seq: 'ASC' }, limit: 100, cursor })));
            if(resp instanceof Error){
                yield new Error('txes fetch failed', node.ip, node.port);
                return;
            }

            if(resp.tx.getTxList.transactions.length === 0){
                break;
            }

            if(resp.tx.getTxList.transactions.find(tx => tx.type === -1 || tx.type === -2 )){
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
            let resp = await stc(async () => await this.client.query(queries.getNodes, { filters: { }, sorting: { _id: 'ASC' }, limit: 1000, cursor }));
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
                    let localNode = await this.knex.table('nodes').where('ip', node.ip).where('port', node.port).first();
                    if(localNode && node.accessible_service === false){
                        await this.knex.table('nodes').where('id', localNode.id).delete();
                        continue;
                    }

                    if(!localNode && node.accessible_service === true){
                        await this.knex.table('nodes').insert({ ip: node.ip, port: node.port, ssl: node.ssl });
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

                    if(tx.contract_wallet && ecdsa.addressFromPublicKey(tx.public_key) !== tx.contract_wallet){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        break txfor;
                    }

                    if(!tx.contract_wallet && ecdsa.addressFromPublicKey(tx.public_key) !== tx.from){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        sync = false;
                        break txfor;
                    }
                }

                if(tx.type === 2){
                    let exists = await this.knex.table('tx').where('asset', tx.asset).select(['id']).limit(1).first();
                    if(exists){
                        let { t2count } = await this.knex.table('tx').where('from', tx.from).where('to', tx.to).where('asset', tx.asset).where('type', 2).count({ t2count: 'id' }).first();
                        let { t1count } = await this.knex.table('tx').where('from', tx.to).where('to', tx.from).where('asset', tx.asset).where('type', 1).count({ t1count: 'id' }).first();
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
                let inserted = await stc(() => this.knex.table('tx').insert({ ...tx, confirm_rate: tx.confirm_rate + 1, node: nodeAddress }));
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

                if(tx.type === 1 && tx.seq !== 1){
                    let balance = await this.getBalance(tx.from, tx.asset);
                    if(balance < Math.abs(tx.amount)){
                        console.log(tx.from, 'bakiyesi yetersiz. Bu işlem illegal');
                        break;
                    }

                    if(!ecdsa.verify(tx.public_key, `${tx.from}__${tx.to}__${tx.amount}__${tx.asset}__${tx.nonce}`, tx.sign)){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        break;
                    }

                    if(tx.contract_wallet && (ecdsa.addressFromPublicKey(tx.public_key) !== tx.contract_wallet)){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        break;
                    }

                    if(!tx.contract_wallet && (ecdsa.addressFromPublicKey(tx.public_key) !== tx.from)){
                        console.log('imza geçersiz', tx.seq, tx.hash);
                        break;
                    }
                }

                if(tx.type === 2){
                    let exists = await this.knex.table('tx').where('asset', tx.asset).select(['id']).limit(1).first();
                    if(exists){
                        let { t2count } = await this.knex.table('tx').where('from', tx.from).where('to', tx.to).where('asset', tx.asset).where('type', 2).count({ t2count: 'id' }).first();
                        let { t1count } = await this.knex.table('tx').where('from', tx.to).where('to', tx.from).where('asset', tx.asset).where('type', 1).count({ t1count: 'id' }).first();
                        if(t2count > t1count){
                            console.log('illegal para girişi', tx.seq, tx.hash);
                            break;
                        }
                    }
                }
                
                let hash = blockchain.createHash({ prevHash: tx.prev_hash, from: tx.from, to: tx.to, amount: tx.amount, asset: tx.asset, nonce: tx.nonce });
                if(hash !== tx.hash){
                    console.log('hash geçersiz', hash + ' != ' + tx.hash);
                    break;
                }

                let inserted = await stc(async () => await this.knex.table('tx').insert({ ...tx, confirm_rate: tx.confirm_rate + 1, node: 'masternode'}));
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