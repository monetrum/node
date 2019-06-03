'use strict';

class Document {

    constructor(){
        this.title = '';
        this.description = '';
        this.keywords = '';
        this.links = [];
        this.styles = [];
        this.scripts = [];
        this.breadcrumbs = [];
        this.image = '';
    }

    setTitle(title){
        this.title = title;
    }

    suffixTitle(title){
        this.title += title;
    }

    getTitle(){
        return this.title;
    }

    setDescription(description){
        this.description = description;
    }

    suffixDescription(description){
        this.description += description;
    }

    getDescription(){
        return this.description;
    }

    setKeywords(keywords){
        this.keywords = keywords;
    }

    suffixKeywords(keywords){
        this.keywords += keywords;
    }

    getKeywords(){
        return this.keywords;
    }

    addLink(href, rel, event){
        this.links.push({href, rel, event});
    }

    getLinks(){
        return this.links;
    }

    addStyle(href, rel = 'stylesheet', media = 'screen'){
        this.styles.push({href, rel, media});
    }

    getStyles(){
        return this.styles;
    }

    addScript(href, position = 'header', isLocal = true){
        this.scripts.push({href, position, isLocal});
    }

    getScripts(position = 'header'){
        return this.scripts.filter(item => item.position == position);
    }

    addBreadcrumb(href, name) {
        this.breadcrumbs.push({href, name});
    }

    getBreadcrumbs(){
        return this.breadcrumbs;
    }

    setImage(image){
        this.image = image;
    }

    getImage(){
        return this.image;
    }

    reset(){

        this.title = '';
        this.description = '';
        this.keywords = '';
        this.links = [];
        this.styles = [];
        this.scripts = [];
        this.breadcrumbs = [];
        this.image = '';
    }
}

module.exports = Document;