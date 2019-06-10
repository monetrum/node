'use strict';
const joi = require('@hapi/joi');
const validators = { };
//---------------------------------------------------------------//

validators.save = joi.object({
    account_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i).required(),
    contract_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i),
    wallet_data: joi.object({ })
});

//-----------------------------------------------------------------//

validators.generate = joi.object({
    account_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i),
    contract_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i),
    wallet_data: joi.object({ })
});

//-----------------------------------------------------------------//

validators.import = joi.object({
    account_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i).required(),
    contract_id: joi.string().regex(/^[0-9a-fA-F]{24}$/i),
    private_key: joi.string().required()
});

//-----------------------------------------------------------------//

validators.wallets = joi.array().items(
    joi.object({
        field: joi.string().required().valid(['id', 'account_id', 'address']),
        operator: joi.string().required().valid(['>', '<', '>=', '<=', '=', 'IN', 'NOT IN']),
        value: joi.any().required()
    }),
    joi.object({ or: joi.lazy(() => validators.wallets) }),
    joi.object({ and: joi.lazy(() => validators.wallets) })
)

module.exports = validators;