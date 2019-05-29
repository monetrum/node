'use strict';
const ws = require('ws');
const { SubscriptionClient } = require('subscriptions-transport-ws');
const { WebSocketLink } = require('apollo-link-ws');
const { ApolloClient, gql, InMemoryCache } = require('apollo-boost');
const { createHttpLink } = require('apollo-link-http');
const fetch = require('node-fetch');
const { ApolloLink, concat } = require('apollo-link');
const stc = async (callback) => { try { return await callback() } catch (e){ return e } };
const sleep = (ms) => new Promise(resolve => setTimeout(() => resolve(true), ms));

class GraphQLClient {

    constructor(uri, ssl = false, headers = { }) {
        this.ssl = ssl;
        this.headers = headers;
        this.uri = uri.replace('http://', '').replace('ws://', '').replace('https://', '').replace('wss://', '');
    }

    async connect(retryLimit = 100, isws = true){
        for(let r = 1; r <= retryLimit; r++){
            try {
                if(isws){
                    let wsOptions = { reconnect: true, connectionParams: this.headers};
                    let wscs = this.ssl === true ? `wss://${this.uri}` : `ws://${this.uri}`;
                    let subsClient = new SubscriptionClient(wscs, wsOptions, ws);
                    await new Promise((resolve, reject) => {
                        subsClient.on('connected', () => resolve(true));
                        subsClient.on('error', () => reject());
                    });
                    //----------------------------------------------------------------------------------------------------------
                    this.subsClient = new ApolloClient({ link: new WebSocketLink(subsClient), cache: new InMemoryCache() });
                }

                //----------------------------------------------------------------------------------------------------------
                let httpcs = this.ssl === true ? `https://${this.uri}` : `http://${this.uri}`;
                let httpLink = createHttpLink({uri: httpcs, fetch});
                let middleware = new ApolloLink((operation, forward) => {
                    operation.setContext({ headers: { ...this.headers, ...operation.getContext().headers } });
                    return forward(operation);
                });
                this.mutationAndQueryClient = new ApolloClient({ link: concat(middleware, httpLink), cache: new InMemoryCache() });
                return true;
            } catch (e) {
                if(r === retryLimit){
                    throw new Error(e.message);
                }

                await sleep(1000);
            }
        }
    }

    async query(query, variables = {}, headers = { }) {
        if (typeof variables !== 'object') {
            throw new Error('variables obje olmalıdır');
        }

        let result = await stc(async () => (await this.mutationAndQueryClient.query({ query: gql(query), variables , context: { headers }, fetchPolicy: 'network-only'})));
        if(result instanceof Error){
            if(this.cb){
                this.cb(result);
                return;
            }

            throw result;
        }

        return result.data;
    }

    async mutation(query, variables = {}, headers = { }) {
        if (typeof variables !== 'object') {
            throw new Error('variables obje olmalıdır');
        }


        let result = await stc(async () => (await this.mutationAndQueryClient.mutate({ mutation: gql(query), variables, context: { headers }})));
        if(result instanceof Error){
            if(this.cb){
                this.cb(result);
                return;
            }

            throw result;
        }

        return result.data;
    }

    subscribe(query, variables, next, error) {
        if(!this.subsClient){
            throw new Error('ws özelliği aktif değil')
        }

        if (typeof variables !== 'object') {
            throw new Error('variables obje olmalıdır');
        }

        if (typeof next !== 'function') {
            throw new Error('next fonksiyon olmalıdır');
        }

        if (typeof error !== 'function') {
            throw new Error('error fonksiyon olmalıdır');
        }

        return this.subsClient.subscribe({ query: gql(query), variables }).subscribe({ next, error });
    }

    setErrorCallback(cb){
        if(typeof cb !== 'function'){
            throw new Error('callback fonksiyon olmalıdır');
        }

        this.cb = cb;
    }
}

module.exports = GraphQLClient;