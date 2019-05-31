'use strict';
const joi = require('@hapi/joi');
const validators = { };
//---------------------------------------------------------------//

validators.env = joi.object({
    LISTEN_HOST: joi.string().required(),
    LISTEN_PORT: joi.string().regex(/\d+/i).required(),
    MASTER_NODE_URL: joi.string().regex(/(http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/i).required(),
    SSL: joi.string().regex(/\d+/i).required(),
    IP_WHITE_LIST: joi.string().required(),
    THREADS: joi.string().regex(/\d+/i).required(),
});

module.exports = validators;