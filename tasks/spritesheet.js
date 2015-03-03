/*
 * grunt-spritesheet
 * https://github.com/nicholasstephan/grunt-spritesheet
 *
 * Mostly just a fork of Ensignten's `grunt-spritesmith` plugin, but
 * with support for a multiple, and pixel doubled, spritesheets.
 * https://github.com/Ensighten/grunt-spritesmith
 *
 * Copyright (c) 2013 Nicholas Stephan
 * Licensed under the MIT license.
 */

'use strict';

var spritesmith = require('spritesmith');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var Promise = require('node-promise').Promise;
var all = require('node-promise').all;
var mustache = require('mustache');
var sizeOf = require('image-size');

module.exports = function(grunt) {

	// Create an image from `srcFiles`, with name `destImage`, and pass
	// coordinates to callback.
	function mkSprite(srcFiles, destImage, options, callback) {

		options.src = srcFiles,

		grunt.verbose.writeln('Options passed to Spritesmth:', JSON.stringify(options));

		spritesmith(options, function(err, result) {
			// If an error occurred, callback with it
			if (err) {
				grunt.fatal(err);
				return;
			}

			// Otherwise, write out the result to destImg
			var destDir = path.dirname(destImage);
			grunt.file.mkdir(destDir);
			fs.writeFileSync(destImage, result.image, 'binary');

			grunt.log.writeln(destImage, 'created.');

			var coords = [];
			var sortedCords;

			for (var key in result.coordinates) {
				coords.push({
					key: key,
					prop: result.coordinates[key]
				});
			}

			sortedCords = _.sortBy(coords, 'key' );

			callback(sortedCords);
		});
	}

	grunt.registerMultiTask('spritesheet', '@2x your spritesheets.', function() {

		var data = this.data;
		var sprites = data.sprites;
		var spriteImgPrefix = data.spriteImgPrefix;
		var classPrefix = data.classPrefix;
		var sheet = data.sheet;
		var templateUrl = data.templateUrl || __dirname + '/template.mustache';
		var template = fs.readFileSync(templateUrl, 'utf8');
		var spritesmithOptions = data.spritesmithOptions || {};


		// Verify all properties are here
		if (!sprites || !sheet) {
			return grunt.fatal("grunt.spritesheet requires a sprites and sheet property");
		}

		// async
		var done = this.async();

		// each sprite adds a promise to promises, then all
		// is used to see when all sprites have been created
		var promises = [];

		// coordinate data fed into the mustache template
		var coords = {std: [], dbl: []};

		// build sprites
		_.each(sprites, function(files, sprite) {
			// get files
			var files = grunt.file.expand(sprites[sprite]);
			var std = _.filter(files, function(file) { return file.indexOf("@2x") === -1; });
			var dbl = _.filter(files, function(file) { return file.indexOf("@2x") !== -1; });


			// discern the prefix from the filename (for now)
			var ext = path.extname(sprite);
			var prefix = classPrefix || path.basename(sprite, ext);

			var options = _.extend({
					'exportOpts': {
						'format': ext.slice(1)
					}
				}, spritesmithOptions);

			// if there are standard res imgs, create sprite
			if(std.length) {
				var stdPromise = new Promise();
				promises.push(stdPromise);

				var url = spriteImgPrefix
					? spriteImgPrefix + '/' + path.basename(sprite)
					: path.relative(path.dirname(sheet), path.dirname(sprite)) + '/' + path.basename(sprite);

				mkSprite(std, sprite, options, function(coordinates) {

					for (var i = 0; i < coordinates.length; i++) {
						var name = path.basename(coordinates[i].key, ext);
						name = prefix + "-" + name;

						var file = coordinates[i].prop;

						coords.std.push({
							name: name,
							x: file.x,
							y: file.y,
							width: file.width,
							height: file.height,
							sprite: url
						});
					}

					stdPromise.resolve();
				});
			}

			// if there are double size imgs, determined by @2x in the filename
			if(dbl.length) {
				var dblPromise = new Promise();
				promises.push(dblPromise);

				var dblSprite = path.dirname(sprite) + "/" + path.basename(sprite, ext) + "@2x" + ext;
				var dblUrl = spriteImgPrefix
					? spriteImgPrefix + '/' + path.basename(dblSprite)
					: path.relative(path.dirname(sheet), path.dirname(dblSprite)) + '/' + path.basename(dblSprite);

				// Double padding if it is set
				if (typeof options.padding === 'number') {
					options.padding *= 2;
				}

				mkSprite(dbl, dblSprite, options, function(coordinates) {

					sizeOf(dblSprite, function (err, dimensions) {
						if(err) {
							grunt.fatal(err);
						}

						for (var i = 0; i < coordinates.length; i++) {
							var name = path.basename(coordinates[i].key, '@2x' + ext);
							name = prefix + "-" + name;

							var file = coordinates[i].prop;

							coords.dbl.push({
								name: name,
								x: file.x / 2,
								y: file.y / 2,
								width: file.width / 2,
								height: file.height / 2,
								sprite: dblUrl,
								spriteWidth: dimensions.width / 2,
								spriteHeight: dimensions.height / 2
							});
						}

						dblPromise.resolve();
					});
				});
			}
		});

		all.apply(null, promises).then(function() {

			var css = mustache.render(template, coords);
			var sheetDir = path.dirname(sheet);

			grunt.file.mkdir(sheetDir);
			fs.writeFileSync(sheet, css, 'utf8');

			grunt.log.writeln(sheet, 'created.')
			done();
		});

	});

};
