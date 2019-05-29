'use strict';

class JoiError extends Error {

    constructor(message, code = 0){
        super(message);
        this.name = this.constructor.name;
        this.isJoi = true;
        this.code = code;

        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
    }
}

module.exports = JoiError;