!function(e){var n={};function t(r){if(n[r])return n[r].exports;var i=n[r]={i:r,l:!1,exports:{}};return e[r].call(i.exports,i,i.exports,t),i.l=!0,i.exports}t.m=e,t.c=n,t.d=function(e,n,r){t.o(e,n)||Object.defineProperty(e,n,{enumerable:!0,get:r})},t.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},t.t=function(e,n){if(1&n&&(e=t(e)),8&n)return e;if(4&n&&"object"==typeof e&&e&&e.__esModule)return e;var r=Object.create(null);if(t.r(r),Object.defineProperty(r,"default",{enumerable:!0,value:e}),2&n&&"string"!=typeof e)for(var i in e)t.d(r,i,function(n){return e[n]}.bind(null,i));return r},t.n=function(e){var n=e&&e.__esModule?function(){return e.default}:function(){return e};return t.d(n,"a",n),n},t.o=function(e,n){return Object.prototype.hasOwnProperty.call(e,n)},t.p="",t(t.s=25)}([function(e,n,t){"use strict";function r(e){return Array.prototype.concat.apply([],e)}t.r(n),t.d(n,"flatten",(function(){return r})),t.d(n,"find",(function(){return v})),t.d(n,"findIndex",(function(){return g})),t.d(n,"filter",(function(){return b})),t.d(n,"forEach",(function(){return y})),t.d(n,"without",(function(){return _})),t.d(n,"reduce",(function(){return j})),t.d(n,"every",(function(){return w})),t.d(n,"some",(function(){return x})),t.d(n,"map",(function(){return P})),t.d(n,"keys",(function(){return E})),t.d(n,"size",(function(){return O})),t.d(n,"values",(function(){return C})),t.d(n,"groupBy",(function(){return S})),t.d(n,"uniqueBy",(function(){return M})),t.d(n,"unionBy",(function(){return A})),t.d(n,"sortBy",(function(){return $})),t.d(n,"matchPattern",(function(){return T})),t.d(n,"debounce",(function(){return L})),t.d(n,"throttle",(function(){return V})),t.d(n,"bind",(function(){return N})),t.d(n,"isUndefined",(function(){return u})),t.d(n,"isDefined",(function(){return c})),t.d(n,"isNil",(function(){return a})),t.d(n,"isArray",(function(){return s})),t.d(n,"isObject",(function(){return f})),t.d(n,"isNumber",(function(){return l})),t.d(n,"isFunction",(function(){return d})),t.d(n,"isString",(function(){return p})),t.d(n,"ensureArray",(function(){return m})),t.d(n,"has",(function(){return h})),t.d(n,"assign",(function(){return D})),t.d(n,"pick",(function(){return I})),t.d(n,"omit",(function(){return z})),t.d(n,"merge",(function(){return G}));var i=Object.prototype.toString,o=Object.prototype.hasOwnProperty;function u(e){return void 0===e}function c(e){return void 0!==e}function a(e){return null==e}function s(e){return"[object Array]"===i.call(e)}function f(e){return"[object Object]"===i.call(e)}function l(e){return"[object Number]"===i.call(e)}function d(e){var n=i.call(e);return"[object Function]"===n||"[object AsyncFunction]"===n||"[object GeneratorFunction]"===n||"[object AsyncGeneratorFunction]"===n||"[object Proxy]"===n}function p(e){return"[object String]"===i.call(e)}function m(e){if(!s(e))throw new Error("must supply array")}function h(e,n){return o.call(e,n)}function v(e,n){var t;return n=F(n),y(e,(function(e,r){if(n(e,r))return t=e,!1})),t}function g(e,n){n=F(n);var t=s(e)?-1:void 0;return y(e,(function(e,r){if(n(e,r))return t=r,!1})),t}function b(e,n){var t=[];return y(e,(function(e,r){n(e,r)&&t.push(e)})),t}function y(e,n){var t;if(!u(e)){var r=s(e)?B:R;for(var i in e)if(h(e,i)&&!1===n(t=e[i],r(i)))return t}}function _(e,n){return u(e)?[]:(m(e),n=F(n),e.filter((function(e,t){return!n(e,t)})))}function j(e,n,t){return y(e,(function(e,r){t=n(t,e,r)})),t}function w(e,n){return!!j(e,(function(e,t,r){return e&&n(t,r)}),!0)}function x(e,n){return!!v(e,n)}function P(e,n){var t=[];return y(e,(function(e,r){t.push(n(e,r))})),t}function E(e){return e&&Object.keys(e)||[]}function O(e){return E(e).length}function C(e){return P(e,(function(e){return e}))}function S(e,n){var t=arguments.length>2&&void 0!==arguments[2]?arguments[2]:{};return n=k(n),y(e,(function(e){var r=n(e)||"_",i=t[r];i||(i=t[r]=[]),i.push(e)})),t}function M(e){e=k(e);for(var n={},t=arguments.length,r=new Array(t>1?t-1:0),i=1;i<t;i++)r[i-1]=arguments[i];return y(r,(function(t){return S(t,e,n)})),P(n,(function(e,n){return e[0]}))}var A=M;function $(e,n){n=k(n);var t=[];return y(e,(function(e,r){for(var i=n(e,r),o={d:i,v:e},u=0;u<t.length;u++){if(i<t[u].d)return void t.splice(u,0,o)}t.push(o)})),P(t,(function(e){return e.v}))}function T(e){return function(n){return w(e,(function(e,t){return n[t]===e}))}}function k(e){return d(e)?e:function(n){return n[e]}}function F(e){return d(e)?e:function(n){return n===e}}function R(e){return e}function B(e){return Number(e)}function L(e,n){var t,r,i,o;function u(){var u=Date.now(),a=o+n-u;if(a>0)return c(a);e.apply(i,r),t=o=r=i=void 0}function c(e){t=setTimeout(u,e)}return function(){o=Date.now();for(var e=arguments.length,u=new Array(e),a=0;a<e;a++)u[a]=arguments[a];r=u,i=this,t||c(n)}}function V(e,n){var t=!1;return function(){t||(e.apply(void 0,arguments),t=!0,setTimeout((function(){t=!1}),n))}}function N(e,n){return e.bind(n)}function q(){return(q=Object.assign||function(e){for(var n=1;n<arguments.length;n++){var t=arguments[n];for(var r in t)Object.prototype.hasOwnProperty.call(t,r)&&(e[r]=t[r])}return e}).apply(this,arguments)}function D(e){for(var n=arguments.length,t=new Array(n>1?n-1:0),r=1;r<n;r++)t[r-1]=arguments[r];return q.apply(void 0,[e].concat(t))}function I(e,n){var t={},r=Object(e);return y(n,(function(n){n in r&&(t[n]=e[n])})),t}function z(e,n){var t={};return y(Object(e),(function(e,r){-1===n.indexOf(r)&&(t[r]=e)})),t}function G(e){for(var n=arguments.length,t=new Array(n>1?n-1:0),r=1;r<n;r++)t[r-1]=arguments[r];return t.length?(y(t,(function(n){n&&f(n)&&y(n,(function(n,t){if("__proto__"!==t){var r=e[t];f(n)?(f(r)||(r={}),e[t]=G(r,n)):e[t]=n}}))})),e):e}},function(e,n){function t(e,n){var t=window.plugins||[];if(window.plugins=t,!e)throw new Error("plugin not specified");if(!n)throw new Error("type not specified");t.push({plugin:e,type:n})}e.exports.registerBpmnJSPlugin=function(e){t(e,"bpmn.modeler.additionalModules")},e.exports.registerBpmnJSModdleExtension=function(e){t(e,"bpmn.modeler.moddleExtension")}},function(e,n,t){"use strict";function r(e,n,t){t.register({importXML:function(){}})}r.$inject=["eventBus","modelTransformer","editorActions"],e.exports=r},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var r=t(4);Object.defineProperty(n,"default",{enumerable:!0,get:function(){return(e=r,e&&e.__esModule?e:{default:e}).default;var e}})},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var r=o(t(5)),i=o(t(24));function o(e){return e&&e.__esModule?e:{default:e}}n.default={__init__:["cliInitializer"],cli:["type",i.default],cliInitializer:["type",r.default]}},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=o;var r=t(6),i=t(11);function o(e){e._registerParser("point",r.PointParser),e._registerParser("element",r.ElementParser),e._registerParser("shape",r.ShapeParser),e._registerParser("shapes",r.ShapesParser),e._registerCommand("append",i.AppendCommand),e._registerCommand("connect",i.ConnectCommand),e._registerCommand("create",i.CreateCommand),e._registerCommand("element",i.ElementCommand),e._registerCommand("elements",i.ElementsCommand),e._registerCommand("move",i.MoveCommand),e._registerCommand("redo",i.RedoCommand),e._registerCommand("save",i.SaveCommand),e._registerCommand("setLabel",i.SetLabelCommand),e._registerCommand("undo",i.UndoCommand),e._registerCommand("removeShape",i.RemoveShapeCommand),e._registerCommand("removeConnection",i.RemoveConnectionCommand)}o.$inject=["cli"]},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var r=t(7);Object.defineProperty(n,"PointParser",{enumerable:!0,get:function(){return c(r).default}});var i=t(8);Object.defineProperty(n,"ElementParser",{enumerable:!0,get:function(){return c(i).default}});var o=t(9);Object.defineProperty(n,"ShapeParser",{enumerable:!0,get:function(){return c(o).default}});var u=t(10);function c(e){return e&&e.__esModule?e:{default:e}}Object.defineProperty(n,"ShapesParser",{enumerable:!0,get:function(){return c(u).default}})},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=function(){return function(e,n){if((0,r.isObject)(e))return e;if(!e&&n.defaultValue)return n.defaultValue;var t=e.split(/,/);if(2!==t.length)throw new Error("expected delta to match (\\d*,\\d*)");return{x:parseInt(t[0],10)||0,y:parseInt(t[1],10)||0}}};var r=t(0)},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=i;var r=t(0);function i(e){return function(n,t){if((0,r.isObject)(n))return n;var i=e.get(n);if(!i){if(t.optional)return null;throw n?new Error("element with id <"+n+"> does not exist"):new Error("argument required")}return i}}i.$inject=["elementRegistry"]},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=i;var r=t(0);function i(e){return function(n,t){if((0,r.isObject)(n))return n;var i=e.get(n);if(!i){if(t.optional)return null;throw n?new Error("element with id <"+n+"> does not exist"):new Error("argument required")}if(i.waypoints)throw new Error("element <"+n+"> is a connection");return i}}i.$inject=["elementRegistry"]},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=i;var r=t(0);function i(e){return function(n,t){return(0,r.isString)(n)?n=n.split(","):(0,r.isArray)(n)||(n=[n]),n.map((function(n){if((0,r.isObject)(n))return n;var i=e.get(n);if(!i){if(t.optional)return null;throw n?new Error("element with id <"+n+"> does not exist"):new Error("argument required")}if(i.waypoints)throw new Error("element <"+n+"> is a connection");return i})).filter((function(e){return e}))}}i.$inject=["elementRegistry"]},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0});var r=t(12);Object.defineProperty(n,"AppendCommand",{enumerable:!0,get:function(){return h(r).default}});var i=t(13);Object.defineProperty(n,"ConnectCommand",{enumerable:!0,get:function(){return h(i).default}});var o=t(14);Object.defineProperty(n,"CreateCommand",{enumerable:!0,get:function(){return h(o).default}});var u=t(15);Object.defineProperty(n,"ElementCommand",{enumerable:!0,get:function(){return h(u).default}});var c=t(16);Object.defineProperty(n,"ElementsCommand",{enumerable:!0,get:function(){return h(c).default}});var a=t(17);Object.defineProperty(n,"MoveCommand",{enumerable:!0,get:function(){return h(a).default}});var s=t(18);Object.defineProperty(n,"RedoCommand",{enumerable:!0,get:function(){return h(s).default}});var f=t(19);Object.defineProperty(n,"SaveCommand",{enumerable:!0,get:function(){return h(f).default}});var l=t(20);Object.defineProperty(n,"SetLabelCommand",{enumerable:!0,get:function(){return h(l).default}});var d=t(21);Object.defineProperty(n,"UndoCommand",{enumerable:!0,get:function(){return h(d).default}});var p=t(22);Object.defineProperty(n,"RemoveShapeCommand",{enumerable:!0,get:function(){return h(p).default}});var m=t(23);function h(e){return e&&e.__esModule?e:{default:e}}Object.defineProperty(n,"RemoveConnectionCommand",{enumerable:!0,get:function(){return h(m).default}})},function(e,n,t){"use strict";function r(e,n){return{args:[e.shape("source"),e.string("type"),e.point("delta",{defaultValue:{x:200,y:0}})],exec:function(e,t,r){var i={x:e.x+e.width/2+r.x,y:e.y+e.height/2+r.y};return n.appendShape(e,{type:t},i).id}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.shape("source"),e.shape("target"),e.string("type"),e.shape("parent",{optional:!0})],exec:function(e,t,r,i){return n.createConnection(e,t,{type:r},i||e.parent).id}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.string("type"),e.point("position"),e.shape("parent"),e.bool("isAttach",{optional:!0})],exec:function(e,t,r,i){var o;return i&&(o={attach:!0}),n.createShape({type:e},t,r,o).id}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e){return{args:[e.element("element")],exec:function(e){return e}}}r.$inject=["cli._params"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{exec:function(){return n.filter((function(){return!0})).map((function(e){return e.id}))}}}r.$inject=["cli._params","elementRegistry"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.shapes("shapes"),e.point("delta"),e.shape("newParent",{optional:!0}),e.bool("isAttach",{optional:!0})],exec:function(e,t,r,i){var o;return i&&(o={attach:!0}),n.moveElements(e,t,r,o),e}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e){return{exec:function(){e.redo()}}}r.$inject=["commandStack"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.string("format")],exec:function(e){if("svg"!==e){if("bpmn"===e)return n.saveXML((function(e,n){e?console.error(e):console.info(n)}));throw new Error("unknown format, <svg> and <bpmn> are available")}n.saveSVG((function(e,n){e?console.error(e):console.info(n)}))}}}r.$inject=["cli._params","bpmnjs"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.element("element"),e.string("newLabel")],exec:function(e,t){return n.updateLabel(e,t),e}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e){return{exec:function(){e.undo()}}}r.$inject=["commandStack"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.shape("shape")],exec:function(e){return n.removeShape(e)}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";function r(e,n){return{args:[e.element("connection")],exec:function(e){return n.removeConnection(e)}}}r.$inject=["cli._params","modeling"],e.exports=r},function(e,n,t){"use strict";Object.defineProperty(n,"__esModule",{value:!0}),n.default=a;var r=t(0);function i(e){return Array.prototype.slice.call(e)}function o(){return function(e,n){if((0,r.isArray)(e)&&(e=e.join(" ")),""===e||e)return e;if(n.defaultValue)return n.defaultValue;throw new Error("no value given")}}function u(){return function(e,n){if(e)return e&&"false"!==e;if(n.defaultValue)return n.defaultValue;if(!n.optional)throw new Error("no value given")}}function c(){return function(e,n){if(0===e||e)return(0,r.isNumber)(e)?e:parseFloat(e,10);if(n.defaultValue)return n.defaultValue;throw new Error("no value given")}}function a(e,n){this._commands={},this._params={},this._injector=n,this._registerParsers(),this._registerCommands(),this._bind(e)}a.$inject=["config","injector"],a.prototype={},a.prototype._bind=function(e){e.cli&&e.cli.bindTo&&(console.info("bpmn-js-cli is available via window."+e.cli.bindTo),window[e.cli.bindTo]=this)},a.prototype._registerParser=function(e,n){var t,i=this._injector.invoke(n);if(!(0,r.isFunction)(i))throw new Error("parser must be a Function<String, Object> -> Object");this._params[e]=(t=i,function(e,n){return{name:e,parse:function(e){return t(e,n||{})}}})},a.prototype._registerCommand=function(e,n){var t=(0,r.isFunction)(n)?this._injector.invoke(n):n;t.args=t.args||[],this._commands[e]=t;var o=this;this[e]=function(){var n=i(arguments);return n.unshift(e),o.exec.apply(o,n)}},a.prototype._registerParsers=function(){this._registerParser("string",o),this._registerParser("number",c),this._registerParser("bool",u)},a.prototype._registerCommands=function(){var e=this;this._registerCommand("help",{exec:function(){var n="available commands:\n";return(0,r.forEach)(e._commands,(function(e,t){n+="\n\t"+t})),n}})},a.prototype.parseArguments=function(e,n){var t=[],i=n.args.length-1;return(0,r.forEach)(n.args,(function(r,o){var u;u=o===i&&e.length>n.args.length?e.slice(o):e[o];try{t.push(r.parse(u))}catch(e){throw new Error("could not parse <"+r.name+">: "+e.message)}})),t},a.prototype.exec=function(){var e=[];i(arguments).forEach((function(n){(0,r.isString)(n)?e=e.concat(n.split(/\s+/)):e.push(n)}));var n,t,o=e.shift(),u=this._commands[o];if(!u)throw new Error("no command <"+o+">, execute <commands> to get a list of available commands");try{n=this.parseArguments(e,u),t=u.exec.apply(this,n)}catch(n){throw new Error("failed to execute <"+o+"> with args <["+e.join(", ")+"]> : "+n.stack)}return t}},function(e,n,t){"use strict";t.r(n);var r=t(1);class i{constructor(e,n,t,r,i,o,u,c){this.cli=u,this.bpmnjs=e,this.modeling=n,this.defaultFillColor=t&&t.defaultFillColor,this.defaultStrokeColor=t&&t.defaultStrokeColor,this.bpmnRenderer=i,this.textRenderer=o,this.bpmnFactory=c}transformModel(){console.log(this.cli.help());this.cli.element("StartEvent_1");var e=this.cli.append("StartEvent_1","bpmn:Participant"),n=this.cli.element(e),t=n.parent.businessObject.$parent,r=t.rootElements||[],i=this.cli.append("StartEvent_1","bpmn:ExclusiveGateway","150,0"),o=this.cli.append(i,"bpmn:SendTask"),u=this.cli.element(o),c=this.cli.create("bpmn:BoundaryEvent",{x:u.x,y:u.y+70},u,!0),a=this.cli.element(c),s=(this.cli.create("bpmn:TimerEventDefinition",{x:a.x,y:a.y},a,!0),this.cli.append(o,"bpmn:EndEvent"),this.cli.append(i,"bpmn:SendTask")),f=(this.cli.append(s,"bpmn:EndEvent"),this.createNewParticipant(n,r)),l=this.cli.append(f,"bpmn:ReceiveTask"),d=(this.cli.append(l,"bpmn:EndEvent"),this.createNewParticipant(n,r)),p=this.cli.append(d,"bpmn:ReceiveTask");this.cli.append(p,"bpmn:EndEvent");this.cli.connect(o,l,"bpmn:MessageFlow"),this.cli.connect(s,p,"bpmn:MessageFlow"),console.log(f),console.log(t),console.log(r)}createNewParticipant(e,n){var t=this.cli.create("bpmn:Participant",{x:e.x+50,y:e.y+150},e.parent),r=this.cli.element(t),i=this.bpmnFactory.create("bpmn:Process");return n.push(i),r.businessObject.processRef=i,this.cli.create("bpmn:StartEvent",{x:r.x+50,y:r.y+150},r)}}i.$inject=["bpmnjs","modeling","config","eventBus","bpmnRenderer","textRenderer","cli","bpmnFactory"];var o=t(2),u=t.n(o);class c{constructor(e,n,t){this._eventBus=e,this._commandStack=n,this._modelTransformer=t,this.createSwitchElement=this.createSwitchElement.bind(this),this._eventBus.once("import.render.complete",this.createSwitchElement)}createSwitchElement(){document.querySelector(".djs-palette").insertAdjacentHTML("beforeend",this.switchElement()),this.registerEventListeners()}registerEventListeners(){this.handleAddEvent=this.handleAddEvent.bind(this);var e=this._modelTransformer;document.querySelector("#add-choreography");document.querySelector("#file-input").addEventListener("change",(function(){e.transformModel()}))}switchElement(){return'\n        <label for="file-input">Choose File</label>\n\n        \x3c!-- accept a text file --\x3e\n        <input type="file" id="file-input" style="display:none"  />\n        '}openfileDialog(){console.log("openfiledialog"),$("#fileLoader").click()}handleAddEvent(){console.log("lulz")}}c.$inject=["eventBus","commandStack","modelTransformer"];var a={__init__:["modelTransformer","seditorActions","customButton"],modelTransformer:["type",i],seditorActions:["type",u.a],customButton:["type",c]},s=t(3).default;Object(r.registerBpmnJSPlugin)(s),Object(r.registerBpmnJSPlugin)(a)}]);
//# sourceMappingURL=client.bundle.js.map