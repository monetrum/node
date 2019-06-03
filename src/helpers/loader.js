'use strict';

const requireDir = require('require-dir');

class Loader {

    constructor(app,directory, params){
        this.app = app;
        this.directory = directory;
        this.params = params;
        this.list = requireDir(this.directory, { recurse: true });
    }

    routers(prefix = null, object = null){
        if(prefix === null || typeof prefix === 'undefined'){
            prefix = '';
        }

        if(object === null || typeof object === 'undefined'){
            object = this.list;
        }

        if(typeof object === 'function'){
            this.app.use((prefix === '' ? '/' : prefix), object(this.params));
            return;
        }

        for(let key in object){
            if(object.hasOwnProperty(key)){
                this.routers((typeof object[key] !== 'function' ? (prefix + '/' + key) : prefix), object[key]);
            }
        }
    }

    middlewares(prefix = null, object = null){
        if(prefix === null || typeof prefix === 'undefined'){
            prefix = '';
        }

        if(object === null || typeof object === 'undefined'){
            object = this.list;
        }

        if(typeof object === 'function'){
            this.app.use((prefix === '' ? '/' : prefix), object);
            return;
        }

        for(let key in object){
            if(object.hasOwnProperty(key)){
                this.middlewares((typeof object[key] !== 'function' ? (prefix + '/' + key) : prefix), object[key]);
            }
        }
    }
}

module.exports = Loader;
