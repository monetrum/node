'use strict';

class GraphQLError extends Error {

    constructor(message, code = 0){
        super(message);
        this.name = this.constructor.name;
        this.type = 'GraphQLError';
        this.code = code;

        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

module.exports = GraphQLError;