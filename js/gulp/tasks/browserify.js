var browserify   = require('browserify');
var gulp         = require('gulp');
var livereload   = require('gulp-livereload');

gulp.task('browserify', function(){
    return browserify({
        entries: ['./src/javascript/app.coffee'],
    })
        .bundle({debug: true})
        .on('error', handleErrors)
        .pipe(source('index.js'))
        .pipe(gulp.dest('../'))
        .pipe(livereload());
});
