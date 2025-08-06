var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require("cors");

var indexRouter = require('./routes/index');
var usersRouter = require('./routes/users')
var conferencesRouter = require('./routes/conferences')
var publicationsRouter = require('./routes/publications')
var adminRouter = require('./routes/admin')
var clientInquiryRouter=require('./routes/clientInquiry')
var employeesRouter=require('./routes/employees')
var clientsRouter=require('./routes/clients')
var headRouter=require('./routes/head')
var clientProjectRouter=require('./routes/clientproject')

var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/conferences', conferencesRouter);
app.use('/publications', publicationsRouter);
app.use('/admin', adminRouter);
app.use('/clientInquiry', clientInquiryRouter)
app.use('/employees', employeesRouter);
app.use('/clients', clientsRouter);
app.use('/head', headRouter);
app.use('/clientProject', clientProjectRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
