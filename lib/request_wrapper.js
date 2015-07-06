'use strict';
var common = require('./common');
var timers = require('timers');
var _      = require('lodash');

var EventEmitter    = require('events').EventEmitter;
var IncomingMessage = require('http').IncomingMessage;
var Socket          = require('./socket');

function RequestWrapper(request, options) {
  var wrapper = Object.create(request);

  options = _.clone(options) || {};

  // Bind methods so that wrapper and request state stays in sync.
  wrapper.getHeader = request.getHeader.bind(request);
  wrapper.setHeader = request.setHeader.bind(request);

  wrapper.requestError = function(error) {
    process.nextTick(function() {
      request.emit('error', error);
    });
  };

  // Patch request object.

  if (! request.connection) {
    request.connection = new EventEmitter();
  }
  request.path   = options.path;
  request.socket = new Socket();

  createResponse(request, wrapper);
  captureOutput(request, wrapper);
  handleEvents(request);
  processHeaders(wrapper, options);
  return wrapper;
}

function captureOutput(request, wrapper) {
  var ABORTED = 'Request aborted.';

  var aborted = false;
  var buffers = [];
  var ended   = false;

  function complete() {
    if (! ended) {
      ended = true;
      request.emit('complete', aborted);
    }
  }

  request.abort = function() {
    var error = new Error();
    error.code = 'aborted';

    aborted = true;
    complete();
    wrapper.response().emit('close', error);
  };

  request.end = function(buffer, encoding) {
    if (aborted) {
      wrapper.requestError(new Error(ABORTED));
    }
    else if (!ended) {
      if (buffer) {
        request.write(buffer, encoding);
      }

      complete();
      request.emit('finish');
      request.emit('end');
    }
  };

  request.write = function(buffer, encoding) {
    if (aborted) {
      wrapper.requestError(new Error(ABORTED));
    }
    else {
      if (! Buffer.isBuffer(buffer)) {
        buffer = new Buffer(buffer, encoding);
      }
      buffers.push(buffer);
    }

    timers.setImmediate(function() {
      request.emit('drain');
    });

    return false;
  };

  wrapper.body = function() {
    var buffer = common.mergeChunks(buffers);

    if (common.isBinaryBuffer(buffer)) {
      return buffer.toString('hex');
    }
    else {
      return buffer.toString('utf8');
    }
  };
}

function createResponse(request, wrapper) {
  var response = new IncomingMessage(new EventEmitter());

  response.req    = request;
  response.socket = request.socket;

  wrapper.response = function() {
    return response;
  };
}

function handleEvents(request) {
  request.on = function(event, listener) {
    EventEmitter.prototype.on.call(request, event, listener);
    handleSocketEvent(request, event);
  };

  request.once = function(event, listener) {
    EventEmitter.prototype.once.call(request, event, listener);
    handleSocketEvent(request, event);
  };
}

// restify listens for a 'socket' event to
// be emitted before calling end(), which causes
// nock to hang with restify. The following logic
// fakes the socket behavior for restify,
// Fixes: https://github.com/pgte/nock/issues/79
function handleSocketEvent(request, event) {
  if (event === 'socket') {
    request.emit('socket', request.socket);
    request.socket.emit('connect', request.socket);
    request.socket.emit('secureConnect', request.socket);
  }
}

function processHeaders(request, options) {
  if (options.headers) {
    _.each(options.headers, function (value, key) {
      request.setHeader(key, value);
    });
  }

  // options.auth
  if (options.auth && !request.getHeader('authorization')) {
    request.setHeader('Authorization', 'Basic ' + (new Buffer(options.auth)).toString('base64'));
  }

  if (request.getHeader('expect') === '100-continue') {
    timers.setImmediate(function() {
      request.emit('continue');
    });
  }
}

module.exports = RequestWrapper;
