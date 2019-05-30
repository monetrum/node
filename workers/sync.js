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
        let cursor = null;
        while(true){
            let resp = await stc(async () => await this.client.query(queries.getNodes, { filters: { accessible_service: true }, sorting: { _id: 'ASC' }, limit: 100, cursor }));
            if(resp instanceof Error){
                yield new Error('nodes fetch failed');
                return;
            }

            cursor = resp.nodes.getNodes.next_cursor;
            if(resp.nodes.getNodes.nodes.length === 0){
                break;
            }

            for(let node of resp.nodes.getNodes.nodes){
                if(node.ip !== env.LISTEN_HOST && node.port !== env.LISTEN_PORT){
                    delete node.__typename;
                    yield node;
                }
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
                delete tx._id;
                delete tx.__typename;
                tx.data = JSON.stringify(tx.data);
                yield tx;
            }
        }
    }

    async txSynchronize(){
        let sync = false;
        let localSeq = await this.lastSeq();

        nodesfor:
        for await (let node of this.nodesIterator()){
            let nodeLastSeq = await this.checkNodeSeq(node.ip, node.port, node.ssl);
            if(nodeLastSeq instanceof Error){
                continue;
            }

            if(nodeLastSeq <= localSeq){
                continue;
            }

            let seq = await this.lastSeq();

            txfor:
            for await (let tx of this.nodeTxIterator(node.ip, node.port, seq, node.ssl)){
                if(tx instanceof Error){
                    sync = false;
                    break txfor;
                }

                if(tx.type === 1){
                    let balance = await this.getBalance(tx.from, tx.asset);
                    if(balance < Math.abs(tx.amount)){
                        console.log('balance yetersiz');
                        sync = false;
                        break txfor;
                    }

                    if(!ecdsa.verify(tx.public_key, `${tx.from}__${tx.to}__${0 - Math.abs(tx.amount)}__${tx.asset}__${tx.nonce}`, tx.sign)){
                        console.log('sign geçersiz', tx.hash, tx.sign);
                        sync = false;
                        break txfor;
                    }
                }

                let hash = blockchain.createHash({ prevHash: tx.prev_hash, from: tx.from, to: tx.to, amount: tx.amount, asset: tx.asset, nonce: tx.nonce });
                if(tx.seq !== 1 && hash !== tx.hash){
                    console.log('hash geçersiz', tx.hash);
                    sync = false;
                    break txfor;
                }

                let nodeAddress = `${node.ssl == true ? 'https:' : 'http:'}//${node.ip}:${node.port}`;
                let inserted = await stc(async () => await this.knex.table('tx').insert({ ...tx, confirm_rate: tx.confirm_rate + 1, node: nodeAddress }));
                if(inserted instanceof Error){
                    throw new Error('işlem veritabanına eklenemedi', inserted.message);
                }

                await this.reportConfirmRate(node.ip, node.port, node.ssl, tx.seq);
                console.log('yeni işlem ', tx.seq, tx.hash, node.ip, node.port);

                if(tx.seq === nodeLastSeq){
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