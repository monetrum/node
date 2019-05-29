'use strict';

function queryBuilder(knex, lines){
    for(let line of lines){
        if('and' in line){
            knex = knex.where(builder => queryBuilder(builder, line.and));
            continue;
        }

        if('or' in line){
            knex = knex.orWhere(builder => queryBuilder(builder, line.or));
            continue;
        }

        knex = knex.where(line.field, line.operator, line.value);
    }

    return knex;
}

module.exports = queryBuilder;