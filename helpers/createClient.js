'use strict';
const GraphQLClient = require('../library/graphQLClient');

function graphQLErrorCallback(e){
    if(e.networkError) {
        e.networkError.result.errors.forEach((element) => {
            throw new Error(element.message);
        })
    }

    if(e.graphQLErrors.length > 0){
        e.graphQLErrors.forEach(element => {
            throw new Error(element.message);
        });
    }
}


async function createClient(uri){
    if(!/(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/i.test(uri)){
        throw new Error('uri doğru formatta değil');
    }

    let url = new URL(uri);
    let ssl = url.protocol === 'https:';
    let port = url.port ? url.port : ( ssl === true ? 443 : 80 );
    let cs = `${url.hostname}:${port}${url.pathname}`;
    let client = new GraphQLClient(cs, ssl);
    
    client.setErrorCallback(graphQLErrorCallback);
    await client.connect(10, false);
    return client;
}

module.exports = createClient;