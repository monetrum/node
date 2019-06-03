'use strict';

class CustomError extends Error {

    constructor(type, message, code = 0){
        super(message);
        this.name = this.constructor.name;
        this.type = type;
        this.code = code;

        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

module.exports = CustomError;