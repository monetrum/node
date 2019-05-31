'use strict';

const queries = {};

//------------------------------------------------------------//

queries.lastSeq = `
    query {
        tx {
            lastSeq
        }
    }
`;

queries.getNodes = `
    query( $filters: GetNodesFilters!, $sorting: GetNodesSorting!, $limit: Int, $cursor: String){
        nodes {
            getNodes(filters: $filters, sorting: $sorting, limit: $limit, cursor: $cursor){
                nodes {
                    ip,
                    port,
                    ssl,
                    accessible_service
                },
                
                next_cursor
            } 
        }
    }
`;

queries.getTxList = `
    query($filters: TxListFilters!, $sorting: TxSorting!, $limit: Int, $cursor: String) {
        tx {
            getTxList(filters: $filters, sorting: $sorting, limit: $limit, cursor: $cursor){
                transactions {
                    _id,
                    action_time,
                    asset,
                    complete_time,
                    hash,
                    nonce,
                    prev_hash,
                    seq,
                    type,
                    from,
                    fee_from,
                    fee,
                    fee_asset,
                    to,
                    amount,
                    desc,
                    contract_id,
                    confirm_rate,
                    data,
                    status,
                    public_key,
                    sign,
                    contract_wallet
                },
                next_cursor
            }
        }
    }
`;


queries.addNode = `
    mutation($info: AddNodeInput!) {
        nodes {
            addNode(info: $info){
                _id,
                ip,
                port,
                ssl
            }
        }
    }
`;

queries.updateConfirmRate = `
    mutation($seq: Int!) {
        tx {
            updateConfirmRate(seq: $seq)
        }
    }
`;

queries.save = `
    mutation( $account_id: ObjectID!, $contract_id: ObjectID, $public_key: String!, $address: String!, $wallet_data: JSON) {
        wallet {
            save(account_id: $account_id, contract_id: $contract_id, public_key: $public_key, address: $address, wallet_data: $wallet_data){
                account_id,
                contract_id,
                address,
                public_key,
                wallet_data
            }
        }
    }
`;

queries.generate = `
    mutation($account_id: ObjectID, $contract_id: ObjectID, $wallet_data: JSON) {
        wallet {
            generate(account_id: $account_id,contract_id: $contract_id, wallet_data: $wallet_data){
                private_key,
                public_key,
                address,
                contract_id
            }
        }
    }
`;


queries.send = `
    mutation(
        $from: String!,
        $to: String!,
        $amount: Float!,
        $asset: String!,
        $nonce: String!,
        $public_key: String,
        $sign: String,
        $fee_from: String,
        $desc: String,
        $forms: JSON,
        $data: JSON
    ) {
        tx {
            send( 
                parameters: {
                    from: $from,
                    fee_from: $fee_from
                    to: $to,
                    amount: $amount,
                    asset: $asset,
                    nonce: $nonce,
                    keys: { 
                        public_key: $public_key,
                        sign: $sign
                    },
                    desc: $desc,
                    forms: $forms,
                    data: $data
                }
            ) {
                _id,
                action_time,
                amount,
                asset,
                confirm_rate,
                desc,
                data,
                fee,
                fee_asset,
                fee_from,
                hash,
                nonce,
                prev_hash,
                seq,
                type,
                from,
                to,
                sign,
                complete_time,
                status,
                contract_wallet
            }
        }
    }
`;

queries.update = `
    mutation($public_key: String!, $sign: String!, $contract_id: ObjectID, $wallet_data: JSON) {
        wallet {
            update(public_key: $public_key, sign: $sign, contract_id: $contract_id, wallet_data: $wallet_data){
                public_key,
                contract_id,
                asset,
                address,
                wallet_data
            }
        }
    }
`;


module.exports = queries;