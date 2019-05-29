'use strict';
const joi = require('@hapi/joi');
const validators = { };
//---------------------------------------------------------------//

validators.txes = joi.array().items(
    joi.object({
        field: joi.string().required().valid(['seq', 'action_time', 'complete_time', 'from', 'type']),
        operator: joi.string().required().valid(['>', '<', '>=', '<=', '=', 'IN', 'NOT IN']),
        value: joi.any().required()
    }),
    
    joi.object({
        or: joi.lazy(() => validators.txes)
    }),

    joi.object({
        and: joi.lazy(() => validators.txes)
    })
)

module.exports = validators;