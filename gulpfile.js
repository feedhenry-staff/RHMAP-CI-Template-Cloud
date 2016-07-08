var gulp = require('gulp');
var shell = require('gulp-shell')
 
gulp.task('test:unit', shell.task([
  'env NODE_PATH=. ./node_modules/.bin/mocha -A -u exports -t 8000 --recursive test/unit/'
]));

gulp.task('default', ['test:unit']);