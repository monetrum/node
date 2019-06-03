'use strict';

const wallets = table => {
    table.increments('id').primary();
    table.string('account_id');
    table.string('asset');
    table.string('address').notNullable();
    table.decimal('insert_time');
    table.string('public_key').notNullable();
    table.string('private_key').notNullable();
    table.string('contract_id');
    table.timestamps(false, true);
    
    table.index(['account_id']);
    table.index(['asset']);
    table.unique(['public_key']);
    table.unique(['private_key']);
    table.unique(['address']);
};

const tx = table => {
    table.increments('id').primary();
    table.string('from').notNullable();
    table.string('to').notNullable();
    table.decimal('amount', 15, 2).notNullable();
    table.string('fee_from').notNullable();
    table.string('asset').notNullable();
    table.integer('seq').notNullable();
    table.integer('confirm_rate').notNullable();
    table.string('prev_hash');
    table.string('hash').notNullable();
    table.string('sign');
    table.integer('type').notNullable();
    table.string('data');
    table.string('desc');
    table.string('contract_id');
    table.string('contract_wallet');
    table.decimal('fee', 15, 2);
    table.string('fee_asset');
    table.string('nonce');
    table.decimal('action_time');
    table.decimal('complete_time');
    table.integer('status');
    table.string('public_key');
    table.string('node');
    //----------------------------------------------------------//
    table.unique(['seq']);
    table.index(['asset']);
    table.unique(['hash']);
    table.index(['from']);
    table.index(['type']);
    table.index(['action_time']);
    table.index(['complete_time']);
};

const nodes = table => {
    table.increments('id').primary();
    table.string('ip').notNullable();
    table.integer('port').notNullable();
    table.boolean('ssl');
    //----------------------------------------------------------//
    table.unique(['ip', 'port']);
};

async function migration(knex){

    if(!(await knex.schema.hasTable('wallets'))){
        await knex.schema.createTable('wallets', wallets);
    }

    if(!(await knex.schema.hasTable('tx'))){
        await knex.schema.createTable('tx', tx);
    }

    if(!(await knex.schema.hasTable('nodes'))){
        await knex.schema.createTable('nodes', nodes);
    }
}

module.exports = migration;