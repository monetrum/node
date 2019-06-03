'use strict';

const _ = require('lodash');
const map = new Map();

class Registry {

    static has(key){
        return map.has(key);
    }

    static set(key, value){
        return map.set(key, value);
    }

    static get(key){
        if(!map.has(key)){
            return undefined;
        }

        return map.get(key);
    }

    static getClone(key){
        if(!map.has(key)){
            return undefined;
        }

        return _.clone(map.get(key));
    }

    static getDeepClone(key){
        if(!map.has(key)){
            return undefined;
        }

        return _.cloneDeep(map.get(key));
    }

    static getMap(){
        return map;
    }

    static getCloneMap(){
        return new Map(map);
    }

    static delete(key){
        return map.delete(key);
    }

}

module.exports = Registry;