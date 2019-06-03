'use strict';

class ArrayHandler {

    constructor(scope, watcher){
        this.scope = scope;
        this.watcher = watcher;
    }

    get(target, prop){
        if(typeof prop === 'symbol'){
            return Reflect.get(target, prop);
        }

        if(prop === Symbol.iterator){
            return Reflect.get(target, Symbol.iterator);
        }

        if(Reflect.has(target,'prototype')){
            if(Reflect.has(target.prototype, prop)){
                return Reflect.get(target.prototype, prop);
            }
        }

        if(/^\d+$/i.exec(prop) === null){
            return Reflect.get(target, prop);
        }

        if(!Reflect.has(target, prop)){
            return undefined;
        }

        if(Array.isArray(Reflect.get(target, prop))){
            let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
            if(a === true){
                this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
                return new Proxy(Reflect.get(target, prop), new ArrayHandler(this.scope !== '' ? `${this.scope},${prop}` : prop, this.watcher));
            }

            return undefined;
        }

        if(typeof Reflect.get(target, prop) === 'object'){
            let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
            if(a === true){
                this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
                return new Proxy(Reflect.get(target, prop), new ObjectHander(this.scope !== '' ? `${this.scope},${prop}` : prop, this.watcher));
            }

            return undefined;
        }

        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
        if(a === true){
            this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
            return Reflect.get(target, prop);
        }

        return undefined;

    }

    set(target, prop, value){

        if(Reflect.has(target, 'prototype')){
            if(Reflect.has(target.prototype, prop)){
                Reflect.set(target.prototype, prop, value);
                return true;
            }
        }

        if(/^\d+$/i.exec(prop) === null){
            return Reflect.set(target, prop, value);
        }

        let exists = Reflect.has(target, prop);
        let oldValue = Reflect.get(target, prop);
        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before' , prop, exists ? 'update' : 'create', value, oldValue);
        if(a === true){
            Reflect.set(target, prop, value);
            this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after' , prop, exists ? 'update' : 'create', value, oldValue);
            return true;
        }

        return false;
    }

    has(target, prop){
        return Reflect.has(target, prop);
    }

    deleteProperty(target, prop){
        let value = Reflect.get(target, prop);
        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'delete', value );
        if(a === true){
            target.splice(prop,1);
            this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'delete', value);
            return true;
        }

        return false;
    }

}



class ObjectHander {

    constructor(scope, watcher){
        this.scope = scope;
        this.watcher = watcher;
    }

    get(target, prop){
        
        if(typeof prop === 'symbol'){
            return Reflect.get(target, prop);
        }
        
        if(prop === Symbol.iterator){
            return Reflect.get(target, Symbol.iterator);
        }

        if(Reflect.has(target, 'prototype')){
            if(Reflect.has(target.prototype, prop)){
                return Reflect.get(target.prototype, prop);
            }
        }

        if(!Reflect.has(target, prop)){
            return undefined;
        }


        if(Array.isArray(Reflect.get(target, prop))){
            let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
            if(a === true){
                this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
                return new Proxy(Reflect.get(target, prop), new ArrayHandler(this.scope !== '' ? `${this.scope},${prop}` : prop, this.watcher));
            }

            return undefined;
        }

        if(typeof Reflect.get(target, prop) === 'object'){
            let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
            if(a === true){
                this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
                return new Proxy(Reflect.get(target, prop), new ObjectHander(this.scope !== '' ? `${this.scope},${prop}` : prop, this.watcher));
            }

            return undefined;
        }

        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'access', Reflect.get(target, prop));
        if(a === true){
            this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'access', Reflect.get(target, prop));
            return Reflect.get(target, prop);
        }

        return undefined;
    }

    set(target, prop, value){

        if(Reflect.has(target, 'prototype')){
            if(Reflect.has(target.prototype, prop)){
                Reflect.set(target.prototype, prop, value);
                return true;
            }
        }

        let exists = Reflect.has(target, prop);
        let oldValue = exists ? Reflect.get(target, prop) : undefined;
        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope}, ${prop}` : prop, 'before',  prop, exists ? 'update' : 'create', value, oldValue);
        if(a === true){
            Reflect.set(target, prop, value);
            this.watcher.trigger(this.scope !== '' ? `${this.scope}, ${prop}` : prop, 'after',  prop, exists ? 'update' : 'create', value, oldValue);
            return true;
        }

        return false;
    }

    has(target, prop){
        return Reflect.has(target, prop);
    }

    deleteProperty(target, prop){
        let value =  Reflect.get(target, prop);
        let a = this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'before', prop, 'delete', value);
        if(a === true){
            Reflect.deleteProperty(target, prop);
            this.watcher.trigger(this.scope !== '' ? `${this.scope},${prop}` : prop, 'after', prop, 'delete', value);
            return true;
        }

        return undefined;
    }
}


class Watcher {

    constructor(variable){

        if(typeof variable !== 'object'){
            throw new Error('Takip edilen değişken obje yada array olmalıdır');
        }

        if(Array.isArray(variable)){
            this.variable = new Proxy(variable, new ArrayHandler('', this));
        } else {
            this.variable = new Proxy(variable, new ObjectHander('', this));
        }

        this.watchers = [];
    }

    val(){
        return this.variable;
    }

    watch(scope, event, action, callback){

        let wscope = [];

        if(scope === null || scope === undefined){
            wscope.push([new RegExp('.+','i')]);
        } else if(Array.isArray(scope)) {
            wscope = scope.map((p) => new RegExp('^' + p.replace(/\./ig, ',').replace(/\*/ig, '[a-zA-Z0-9_\-]*') + '$', 'i'));
        } else {
            wscope = [new RegExp('^' + scope.replace(/\./ig, ',').replace(/\*/ig, '[a-zA-Z0-9_\-]*') + '$', 'i')];
        }

        if(!Array.isArray(action)){
            action = [action];
        }

        if(!Array.isArray(event)){
            event = [event];
        }

        this.watchers.push({scopes: wscope, event, action, callback});
        return this.watchers.length - 1;
    }

    unwatch(watcherId){
        this.watchers.splice(watcherId, 1);
    }


    trigger(eScope, event, propname, action, value, oldValue){
        let r = true;
        this.watchers.forEach(watcher => {
            let sr = watcher.scopes.map(wScope => wScope.exec(eScope) !== null).find(bool => bool) === true;
            let ar = watcher.action.indexOf(action) !== -1;
            let er = watcher.event.indexOf(event) !== -1;
            if(sr && ar && er){
                let answer = watcher.callback(eScope.replace(/,/ig, '.'), propname, event, action, value, oldValue);
                if(event === 'before' && answer === false){
                    r = false;
                }
            }
        });

        return r;
    }
}

module.exports = Watcher;