'use strict';
const whitelist = registry.get('IP_WHITE_LIST');

function ipcontrol(req, res, next){
    if(whitelist.indexOf(req.ip) === -1){
        res.json({ status: 'error', message: `${req.ip} not allowed` });
        return;
    }

    next();
}

module.exports = ipcontrol;