(self.webpackChunkgatsby_starter_blog=self.webpackChunkgatsby_starter_blog||[]).push([[989],{1254:function(e,t,n){"use strict";var r=n(4836);t.__esModule=!0,t.default=void 0;var o=r(n(434)),i=r(n(7071)),a=r(n(7867)),s=r(n(7294)),l=r(n(5697)),d=n(989),u=(0,d.debounce)((function(){window.DISQUSWIDGETS&&window.DISQUSWIDGETS.getCount({reset:!0})}),300,!1),c=function(e){function t(t){var n;return(n=e.call(this,t)||this).shortname="ilyapuchkameen",n}(0,a.default)(t,e);var n=t.prototype;return n.componentDidMount=function(){this.loadInstance()},n.shouldComponentUpdate=function(e){return this.props!==e&&(0,d.shallowComparison)(this.props,e)},n.componentDidUpdate=function(){this.loadInstance()},n.componentWillUnmount=function(){this.cleanInstance()},n.loadInstance=function(){window.document.getElementById("dsq-count-scr")?u():(0,d.insertScript)("https://"+this.shortname+".disqus.com/count.js","dsq-count-scr",window.document.body)},n.cleanInstance=function(){(0,d.removeScript)("dsq-count-scr",window.document.body),window.DISQUSWIDGETS=void 0},n.render=function(){var e=this.props,t=e.config,n=e.className,r=e.placeholder,a=(0,i.default)(e,["config","className","placeholder"]),l="disqus-comment-count"+(n?" "+n:"");return s.default.createElement("span",(0,o.default)({className:l,"data-disqus-identifier":t.identifier,"data-disqus-url":t.url},a),r)},t}(s.default.Component);t.default=c,c.defaultProps={placeholder:"..."},c.propTypes={config:l.default.shape({identifier:l.default.string,title:l.default.string,url:l.default.string}),placeholder:l.default.string,className:l.default.string}},4294:function(e,t,n){"use strict";var r=n(4836);t.__esModule=!0,t.default=void 0;var o=r(n(434)),i=r(n(7071)),a=r(n(7867)),s=r(n(7294)),l=r(n(5697)),d=function(e){function t(){return e.apply(this,arguments)||this}(0,a.default)(t,e);var n=t.prototype;return n.getSrc=function(){return"https://embed.disqus.com/p/"+Number(this.props.commentId).toString(36)+"?p="+(this.props.showParentComment?"1":"0")+"&m="+(this.props.showMedia?"1":"0")},n.render=function(){var e=this.props,t=(e.commentId,e.showMedia,e.showParentComment,(0,i.default)(e,["commentId","showMedia","showParentComment"]));return s.default.createElement("iframe",(0,o.default)({src:this.getSrc(),width:this.props.width,height:this.props.height,seamless:"seamless",scrolling:"no",frameBorder:"0",title:"embedded-comment"},t))},t}(s.default.Component);t.default=d,d.defaultProps={width:420,height:320,showMedia:!0,showParentComment:!0},d.propTypes={commentId:l.default.oneOfType([l.default.number,l.default.string]).isRequired,width:l.default.number,height:l.default.number,showMedia:l.default.bool,showParentComment:l.default.bool}},2605:function(e,t,n){"use strict";var r=n(4836);t.__esModule=!0,t.default=void 0;var o=r(n(434)),i=r(n(7071)),a=r(n(7867)),s=r(n(7294)),l=r(n(5697)),d=n(989),u=function(e){function t(t){var n;return(n=e.call(this,t)||this).shortname="ilyapuchkameen",n.embedUrl="https://"+n.shortname+".disqus.com/embed.js",n}(0,a.default)(t,e);var n=t.prototype;return n.componentDidMount=function(){this.loadInstance()},n.shouldComponentUpdate=function(e){return this.props!==e&&(0,d.shallowComparison)(this.props,e)},n.componentDidUpdate=function(){this.loadInstance()},n.componentWillUnmount=function(){this.cleanInstance()},n.getDisqusConfig=function(e){return function(){this.page.identifier=e.identifier,this.page.url=e.url,this.page.title=e.title,this.page.remote_auth_s3=e.remoteAuthS3,this.page.api_key=e.apiKey,this.language=e.language}},n.loadInstance=function(){"undefined"!=typeof window&&window.document&&(window.disqus_config=this.getDisqusConfig(this.props.config),window.document.getElementById("dsq-embed-scr")?this.reloadInstance():(0,d.insertScript)(this.embedUrl,"dsq-embed-scr",window.document.body))},n.reloadInstance=function(){window&&window.DISQUS&&window.DISQUS.reset({reload:!0})},n.cleanInstance=function(){(0,d.removeScript)("dsq-embed-scr",window.document.body);try{delete window.DISQUS}catch(r){window.DISQUS=void 0}var e=window.document.getElementById("disqus_thread");if(e)for(;e.hasChildNodes();)e.removeChild(e.firstChild);var t=window.document.querySelector('[id^="dsq-app"]');if(t){var n=window.document.getElementById(t.id);n.parentNode.removeChild(n)}},n.render=function(){var e=this.props,t=(e.config,(0,i.default)(e,["config"]));return s.default.createElement("div",(0,o.default)({id:"disqus_thread"},t))},t}(s.default.Component);t.default=u,u.propTypes={config:l.default.shape({identifier:l.default.string,title:l.default.string,url:l.default.string,language:l.default.string,remoteAuthS3:l.default.string,apiKey:l.default.string}),className:l.default.string}},8200:function(e,t,n){"use strict";var r=n(4836);t.ZP=void 0;var o=r(n(2605));o.default,r(n(1254)).default,r(n(4294)).default;var i=o.default;t.ZP=i},989:function(e,t,n){"use strict";var r=n(4836);t.__esModule=!0,t.insertScript=function(e,t,n){var r=window.document.createElement("script");return r.async=!0,r.src=e,r.id=t,n.appendChild(r),r},t.removeScript=function(e,t){var n=window.document.getElementById(e);n&&t.removeChild(n)},t.debounce=function(e,t,n){var r;return function(){for(var o=arguments.length,i=new Array(o),a=0;a<o;a++)i[a]=arguments[a];var s=this,l=n&&!r;window.clearTimeout(r),r=setTimeout((function(){r=null,n||e.apply(s,i)}),t),l&&e.apply(s,i)}},t.isReactElement=a,t.shallowComparison=function e(t,n){var r,i=new Set(Object.keys(t).concat(Object.keys(n))),s=(r=[]).concat.apply(r,(0,o.default)(i)).filter((function(r){if("object"==typeof t[r]){if(e(t[r],n[r]))return!0}else if(t[r]!==n[r]&&!a(t[r]))return!0;return!1}));return 0!==s.length};var o=r(n(861)),i=r(n(7294));function a(e){return!!i.default.isValidElement(e)||!!Array.isArray(e)&&e.some((function(e){return i.default.isValidElement(e)}))}},4982:function(e,t,n){"use strict";n.r(t),n.d(t,{Head:function(){return d}});var r=n(7294),o=n(1883),i=n(8771),a=n(8678),s=n(9357),l=n(8200);const d=e=>{let{data:{markdownRemark:t}}=e;return r.createElement(s.Z,{title:t.frontmatter.title,description:t.frontmatter.description||t.excerpt})};t.default=e=>{let{data:{previous:t,next:n,site:s,markdownRemark:d},location:u}=e;const c=s.siteMetadata.siteUrl,f=d.frontmatter.id||d.id,p=d.frontmatter.tags?d.frontmatter.tags+" | ":"",m={url:""+c+d.fields.slug,identifier:f,title:d.title};return r.createElement(a.Z,{location:u,title:"All posts"},r.createElement("article",{className:"blog-post",itemScope:!0,itemType:"http://schema.org/Article"},r.createElement("header",null,r.createElement("h1",{itemProp:"headline"},d.frontmatter.title),r.createElement("p",null,p,d.frontmatter.date)),r.createElement("section",{dangerouslySetInnerHTML:{__html:d.html},itemProp:"articleBody"}),r.createElement("hr",null),r.createElement("footer",null,r.createElement(i.Z,null))),r.createElement("section",{style:{display:"flex",flexWrap:"wrap",flexDirection:"row",justifyContent:"space-between",listStyle:"none",padding:0}},r.createElement("section",{style:{maxWidth:"50%",padding:10}},t&&r.createElement("div",null,"Previous:",r.createElement("br",null),r.createElement(o.Link,{style:{boxShadow:"none",color:"#000"},to:t.fields.slug,rel:"prev"},r.createElement("strong",null,t.frontmatter.title)),r.createElement("p",null,t.frontmatter.date),r.createElement("p",{dangerouslySetInnerHTML:{__html:t.excerpt}}))),r.createElement("section",{style:{maxWidth:"50%",padding:10}},n&&r.createElement("div",null,"Next:",r.createElement("br",null),r.createElement(o.Link,{style:{boxShadow:"none",color:"#000"},to:n.fields.slug,rel:"next"},r.createElement("strong",null,n.frontmatter.title)),r.createElement("p",null,n.frontmatter.date),r.createElement("p",{dangerouslySetInnerHTML:{__html:n.excerpt}})))),r.createElement(l.ZP,{config:m}))}},3897:function(e){e.exports=function(e,t){(null==t||t>e.length)&&(t=e.length);for(var n=0,r=new Array(t);n<t;n++)r[n]=e[n];return r},e.exports.__esModule=!0,e.exports.default=e.exports},3405:function(e,t,n){var r=n(3897);e.exports=function(e){if(Array.isArray(e))return r(e)},e.exports.__esModule=!0,e.exports.default=e.exports},434:function(e){function t(){return e.exports=t=Object.assign?Object.assign.bind():function(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e},e.exports.__esModule=!0,e.exports.default=e.exports,t.apply(this,arguments)}e.exports=t,e.exports.__esModule=!0,e.exports.default=e.exports},9498:function(e){e.exports=function(e){if("undefined"!=typeof Symbol&&null!=e[Symbol.iterator]||null!=e["@@iterator"])return Array.from(e)},e.exports.__esModule=!0,e.exports.default=e.exports},2281:function(e){e.exports=function(){throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")},e.exports.__esModule=!0,e.exports.default=e.exports},7071:function(e){e.exports=function(e,t){if(null==e)return{};var n,r,o={},i=Object.keys(e);for(r=0;r<i.length;r++)n=i[r],t.indexOf(n)>=0||(o[n]=e[n]);return o},e.exports.__esModule=!0,e.exports.default=e.exports},861:function(e,t,n){var r=n(3405),o=n(9498),i=n(6116),a=n(2281);e.exports=function(e){return r(e)||o(e)||i(e)||a()},e.exports.__esModule=!0,e.exports.default=e.exports},6116:function(e,t,n){var r=n(3897);e.exports=function(e,t){if(e){if("string"==typeof e)return r(e,t);var n=Object.prototype.toString.call(e).slice(8,-1);return"Object"===n&&e.constructor&&(n=e.constructor.name),"Map"===n||"Set"===n?Array.from(e):"Arguments"===n||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)?r(e,t):void 0}},e.exports.__esModule=!0,e.exports.default=e.exports}}]);
//# sourceMappingURL=component---src-templates-blog-post-js-55c2ec494af58a4bf9bd.js.map