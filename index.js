/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
var htmlMinifier = require("html-minifier");
var attrParse = require("./lib/attributesParser");
var loaderUtils = require("loader-utils");
var url = require("url");
var assign = require("object-assign");
var compile = require("es6-templates").compile;

function randomIdent() {
	return "xxxHTMLLINKxxx" + Math.random() + Math.random() + "xxx";
}

function getLoaderConfig(context) {
	var query = loaderUtils.getOptions(context) || {};
	var configKey = query.config || 'htmlLoader';
	var config = context.options && context.options.hasOwnProperty(configKey) ? context.options[configKey] : {};

	delete query.config;

	return assign(query, config);
}

module.exports = function(content) {
	this.cacheable && this.cacheable();
	var config = getLoaderConfig(this);
	var attributes = ["img:src", "img:srcset"];
	if(config.attrs !== undefined) {
		if(typeof config.attrs === "string")
			attributes = config.attrs.split(" ");
		else if(Array.isArray(config.attrs))
			attributes = config.attrs;
		else if(config.attrs === false)
			attributes = [];
		else
			throw new Error("Invalid value to config parameter attrs");
	}
	var root = config.root;
	var rawLinks = attrParse(content, function(tag, attr) {
		var res = attributes.find(function(a) {
			if (a.charAt(0) === ':') {
				return attr === a.slice(1);
			} else {
				return (tag + ":" + attr) === a;
			}
		});
		return !!res;
	});
	var links = [];
	rawLinks.forEach(function (link) {
		var length = link.length;
		var start = link.start;
		var valueList = link.value.split(",");
		valueList.forEach(function (newLink) {
			var trimmed = newLink.trim();
			var cLength = newLink.length;
			var spacePos = trimmed.indexOf(" ");
			var spaceStart = newLink.indexOf(trimmed);
			var len = cLength+ spaceStart;
			if (-1 != spacePos) {
				len = spacePos + spaceStart;
				trimmed = trimmed.substring(0,spacePos);
			}
			links.push({start: start, length: len , value: trimmed});
			start += cLength+1;
		});
	});
	links.reverse();
	var data = {};
	content = [content];
	links.forEach(function(link) {
		var newValue = link.value.split(",");
		var newValue = newValue.map(function (value) {
			var valueArray = value.trim().split(" ");
			var obj = {
				value: valueArray.shift(),
				additional: valueArray,
			};
			if(!loaderUtils.isUrlRequest(obj.value, root)) return obj;
			var uri = url.parse(obj.value);
			if (uri.hash !== null && uri.hash !== undefined) {
				obj.hash = uri.hash;
				uri.hash = null;
				obj.value = uri.format();
			}
			return obj;
		});

		if (link.value.indexOf('mailto:') > -1 ) return;

		var uri = url.parse(link.value);
		if (uri.hash !== null && uri.hash !== undefined) {
			uri.hash = null;
			link.value = uri.format();
			link.length = link.value.length;
		}

		do {
			var ident = randomIdent();
		} while(data[ident]);
		data[ident] = newValue;
		var x = content.pop();
		content.push(x.substr(link.start + link.length));
		content.push(ident);
		content.push(x.substr(0, link.start));
	});
	content.reverse();
	content = content.join("");

	if (config.interpolate === 'require'){

		var reg = /\$\{require\([^)]*\)\}/g;
		var result;
		var reqList = [];
		while(result = reg.exec(content)){
			reqList.push({
				length : result[0].length,
				start : result.index,
				value : result[0]
			})
		}
		reqList.reverse();
		content = [content];
		reqList.forEach(function(link) {
			var x = content.pop();
			do {
				var ident = randomIdent();
			} while(data[ident]);
			data[ident] = link.value.substring(11,link.length - 3)
			content.push(x.substr(link.start + link.length));
			content.push(ident);
			content.push(x.substr(0, link.start));
		});
		content.reverse();
		content = content.join("");
	}

	if(typeof config.minimize === "boolean" ? config.minimize : this.minimize) {
		var minimizeOptions = assign({}, config);

		[
			"removeComments",
			"removeCommentsFromCDATA",
			"removeCDATASectionsFromCDATA",
			"collapseWhitespace",
			"conservativeCollapse",
			"removeAttributeQuotes",
			"useShortDoctype",
			"keepClosingSlash",
			"minifyJS",
			"minifyCSS",
			"removeScriptTypeAttributes",
			"removeStyleTypeAttributes",
		].forEach(function(name) {
			if(typeof minimizeOptions[name] === "undefined") {
				minimizeOptions[name] = true;
			}
		});

		content = htmlMinifier.minify(content, minimizeOptions);
	}

	if(config.interpolate && config.interpolate !== 'require') {
		// Double escape quotes so that they are not unescaped completely in the template string
		content = content.replace(/\\"/g, "\\\\\"");
		content = content.replace(/\\'/g, "\\\\\'");
		content = compile('`' + content + '`').code;
	} else {
		content = JSON.stringify(content);
	}

    var exportsString = "module.exports = ";
	if (config.exportAsDefault) {
        exportsString = "exports.default = ";

	} else if (config.exportAsEs6Default) {
        exportsString = "export default ";
	}

 	return exportsString + content.replace(/xxxHTMLLINKxxx[0-9\.]+xxx/g, function(match) {
		if(!data[match]) return match;
		return data[match].reduce(function (pV, cV, index, array) {
			var hash = cV.hash || "";
			var additional = cV.additional.length != 0 ? " " + cV.additional.join(" ") : "";
			if (index != array.length -1) {
				additional += ",";
			}

			if (loaderUtils.isUrlRequest(cV.value, root)) {
				var url = '" + function () { try { return require('
					+ JSON.stringify(config.interpolate === 'require' ? cV.value : loaderUtils.urlToRequest(cV.value, root))
					+ ') } catch (e) { return '
					+ JSON.stringify(cV.value) + ' }}() + "';
			} else {
				var url = cV.value;
			}

			return pV + url + hash + additional;
		},"");
	}) + ";";
}
