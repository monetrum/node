'use strict';
const express = require('express');
const router = express.Router();
const proxy = registry.get('proxy');
const env = registry.get('env');

router.post('/', (req, res) => proxy.web(req, res, { target: env.MASTER_NODE_URL }));

module.exports = () => router;