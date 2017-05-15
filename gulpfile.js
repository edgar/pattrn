/*
Copyright (C) 2016 andrea rota <a@xelera.eu>

This file is part of Pattrn - http://pattrn.co/.

Pattrn is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

Pattrn is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with Pattrn.  If not, see <http://www.gnu.org/licenses/>.
*/

'use strict';

const gulp = require('gulp');
const clean = require('gulp-clean');
const jade = require('gulp-jade');
const jshint = require('gulp-jshint');
const jsonlint = require('gulp-json-lint');
const sass = require('gulp-sass');
const util = require('gulp-util');
const webserver = require('gulp-webserver');

const browserify = require('browserify');
const babelify = require('babelify');
const execSync = require('child_process').execSync;
const merge = require('merge-stream');
const source = require('vinyl-source-stream');

const config = require('./package.json').pattrn_configuration;

const source_data_packages_config_file = './source-data-packages.json';

/**
 * @technical-debt: pattrn-data-config.json is not mandatory, as data can be
 * pulled in in a number of different ways, so we should first check for its
 * existence here, and handle this scenario in the install_data_packages task
 * accordingly.
 */
try {
   const data_config = require(source_data_packages_config_file);
   config.source_data_packages = data_config.source_data_packages;
} catch (error) {
  util.log(
`Data package not configured: no data package will be installed via npm.
When not using an npm package for Pattrn source data, make sure source
data for this Pattrn instance is manually copied to the \`src\` folder and
that Pattrn is configured to use this data (in the \`src/config.json\` file).`
);
  config.source_data_packages = null;
}

/**
 * Copy over assets from vendor modules (referenced in vendor stylesheets
 * or used in Pattrn own stylesheets).
 * This is currently configured manually through the assets member of the
 * config.assets.vendor_assets objects, from inspection of the vendor stylesheet
 * files for src references
 */
gulp.task('vendor-assets', () => {
  const assets = config.assets.vendor_assets
      .filter(item => { return item.assets && item.assets.length > 0; })
      .map(item => item.assets)
      .reduce((p, c, i) => { return p.concat(c); }, []);

  const tasks = assets.map((item) => {
    return gulp.src(item.src)
      .pipe(gulp.dest(`${config.dest}/${item.dest}`));
  });

  return merge(tasks);
});

gulp.task('bundle', ['vendor-assets'], function () {
    return browserify({entries: config.assets.app_main, debug: true})
        .transform(babelify, {presets: ["es2015"]})
        .bundle()
        .pipe(source(config.bundle))
        .pipe(gulp.dest(config.dest));
});

gulp.task('watch', ['bundle'], function () {
    gulp.watch('*.js', ['build']);
});

gulp.task('default', ['watch']);

gulp.task('clean', [], () => {
  return gulp.src([config.src + '/data/*', config.dest], {read: false})
    .pipe(clean());
});

gulp.task('jsonlint', function(){
      gulp.src('js/config.json')
        .pipe(jsonlint())
        .pipe(jsonlint.report('verbose'));
});

gulp.task('views', [], () => {
  gulp.src([`${config.src}/**/*.jade`])
    .pipe(jade({
      pretty: true
    }))
    .pipe(gulp.dest(config.dest))
});

gulp.task('sass', function () {
  return gulp.src(config.vendor_stylesheets.map(item => item.stylesheets).concat([ config.src + '/css/**/*.css', config.src + '/css/**/*.scss']))
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest(config.dest + '/css'));
});

gulp.task('jshint', () => {
  return gulp.src(config.src + '/js/**/*.js')
    .pipe(jshint(config.jshint))
    .pipe(jshint.reporter('default'));
});

/**
 * Install npm package with source data and copy its `pattrn-data` folder
 * to the `src` folder.
 * 
 * @x-technical-debt: config.source_data_packages is an array, but we only
 * support a single data package at the moment (config.source_data_packages[0])
 */
gulp.task('install_data_packages', [], () => {
  if(config.source_data_packages) {
    const source_data_package = config.source_data_packages[0];

    if(config.source_data_packages.length > 1) {
      util.log(
`${config.source_data_packages.length} source data packages have been configured in ${source_data_packages_config_file},
but this version of Pattrn only supports one; installing and using the first one configured:\n
${JSON.stringify(source_data_package, undefined, 2)}\n`);
    }

    util.log(`Installing Pattrn data package via npm: ${source_data_package.package} (${source_data_package.source})`);
    const source_data_package_install = execSync('npm install ' + source_data_package.source);
  }

  return gulp.src('dist/');
});

gulp.task('bundle_data_packages', ['populate_dist', 'install_data_packages'], () => {
  if(config.source_data_packages) {
    const source_data_package = config.source_data_packages[0];

    gulp.src('node_modules/' + source_data_package.package + '/pattrn-data/**/*')
      .pipe(gulp.dest('dist'));
  }

  return gulp.src('dist/')
})

gulp.task('populate_dist', ['jsonlint', 'bundle', 'views', 'sass'], function() {
  gulp.src(['src/**/*'])
    .pipe(gulp.dest('dist'));
});

gulp.task('build', ['bundle_data_packages']);

gulp.task('webserver', function() {
  gulp.src('dist')
    .pipe(webserver({
      host: '0.0.0.0',
      port: '8080',
      livereload: true,
      directoryListing: true
    }));
});
