'use strict';

var test   = require('tap').test;
var timers = require('timers');

var ClientRequest   = require('http').ClientRequest;
var EventEmitter    = require('events').EventEmitter;
var IncomingMessage = require('http').IncomingMessage;
var OutgoingMessage = require('http').OutgoingMessage;
var RequestWrapper  = require('../lib/request_wrapper');
var Socket          = require('../lib/socket');

function createRequest() {
  var request = Object.create(ClientRequest.prototype);
  OutgoingMessage.call(request);
  return request;
}

test('wraps the original request', function(t) {
  var request = createRequest();
  var wrapped = new RequestWrapper(request);

  t.type(wrapped, ClientRequest);
  t.true(request.isPrototypeOf(wrapped));
  t.end();
});

test('applies headers from options', function(t) {
  var options = {
    headers : {
      foo: 'bar'
    }
  };

  var request = createRequest();
  var wrapper = new RequestWrapper(request, options);

  t.equal(request.getHeader('foo'), options.headers.foo);
  t.equal(wrapper.getHeader('foo'), options.headers.foo);
  t.end();
});

test('handles the \'auth\' option', function(t) {
  var options = {
    auth: 'foo:bar'
  };

  var header  = 'Basic ' + (new Buffer(options.auth)).toString('base64');
  var request = createRequest();
  var wrapper = new RequestWrapper(request, options);

  t.equal(request.getHeader('authorization'), header);
  t.equal(wrapper.getHeader('authorization'), header);
  t.end();
});

test('ignores the \'auth\' option if the auth header is explicitly set', function(t) {
  var options = {
    auth: 'foo:bar',

    headers: {
      authorization: 'foo'
    }
  };

  var request = createRequest();
  var wrapper = new RequestWrapper(request, options);

  t.equal(request.getHeader('authorization'), options.headers.authorization);
  t.equal(wrapper.getHeader('authorization'), options.headers.authorization);
  t.end();
});

test('simulates the \'continue\' event', function(t) {
  var options = {
    headers: {
      expect: '100-continue'
    }
  };

  var continued = 0;
  var request   = createRequest();
  var wrapper   = new RequestWrapper(request, options);

  function tick() {
    continued++;
  }

  request.once('continue', tick);
  wrapper.once('continue', tick);

  // Immediates should execute in order.
  timers.setImmediate(function() {
    t.equal(continued, 2);
    t.end();
  });
});

test('captures output', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.equal(request.write('hello '), false);
  t.equal(wrapper.write('world'), false);

  t.equal(wrapper.body(), 'hello world');
  t.end();
});

test('simulates the \'drain\' event', function(t) {
  var drained = 0;
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  function drain() {
    drained++;
  }

  wrapper.write('foo');
  request.once('drain', drain);
  wrapper.once('drain', drain);

  // Immediates should execute in order.
  timers.setImmediate(function() {
    t.equal(drained, 2);
    t.end();
  });
});

test('converts output based on encoding', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.equal(request.write('68656c6c6f20', 'hex'), false);
  t.equal(wrapper.write('776f726c64', 'hex'), false);

  t.equal(wrapper.body(), 'hello world');
  t.end();
});

test('captures output written as buffers', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.equal(request.write(new Buffer('hello ')), false);
  t.equal(wrapper.write(new Buffer('world')), false);

  t.equal(wrapper.body(), 'hello world');
  t.end();
});

test('represents binary output as hex', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.equal(request.write('dead', 'hex'), false);
  t.equal(wrapper.write('beef', 'hex'), false);

  t.equal(wrapper.body(), 'deadbeef');
  t.end();
});

test('simulates end events', function(t) {
  var aborted   = false;
  var completed = 0;
  var ended     = 0;
  var finished  = 0;
  var request   = createRequest();
  var wrapper   = new RequestWrapper(request);

  function complete(value) {
    aborted = value;
    completed++;
  }

  function end() {
    ended++;
  }

  function finish() {
    finished++;
  }

  request.once('complete', complete);
  wrapper.once('complete', complete);
  request.once('end', end);
  wrapper.once('end', end);
  request.once('finish', finish);
  wrapper.once('finish', finish);

  request.end();

  t.false(aborted);
  t.equal(completed, 2);
  t.equal(ended, 2);
  t.equal(finished, 2);
  t.end();
});

test('captures output on end', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  request.end('68656c6c6f20776f726c64', 'hex');

  t.equal(wrapper.body(), 'hello world');
  t.end();
});

test('does not end more than once', function(t) {
  var ended     = 0;
  var completed = 0;
  var request   = createRequest();
  var wrapper   = new RequestWrapper(request);

  request.on('end', function() {
    ended++;
  });

  request.on('complete', function() {
    completed++;
  });

  wrapper.end();
  wrapper.end();

  t.equal(completed, 1);
  t.equal(ended, 1);
  t.end();
});

test('uses an IncomingMessage for a response', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  var response = wrapper.response();

  t.type(response, IncomingMessage);
  t.equal(response.req, request);
  t.end();
});

test('aborting', function(t) {
  var aborted   = false;
  var completed = 0;
  var error     = null;
  var request   = createRequest();
  var wrapper   = new RequestWrapper(request);

  var response = wrapper.response();

  request.on('complete', function(value) {
    aborted = value;
    completed++;
  });

  response.once('close', function(err) {
    error = err;
  });

  request.abort();

  t.true(aborted);
  t.type(error, Error);
  t.equal(error.code, 'aborted');
  t.equal(completed, 1);
  t.end();
});

test('end after abort', function(t) {
  var aborted   = false;
  var completed = 0;
  var error     = null;
  var request   = createRequest();
  var wrapper   = new RequestWrapper(request);

  request.on('complete', function(value) {
    aborted = value;
    completed++;
  });

  request.once('error', function(err) {
    error = err;
  });

  request.abort();
  request.end();

  process.nextTick(function() {
    t.true(aborted);
    t.type(error, Error);
    t.equal(error.message, 'Request aborted.');
    t.equal(completed, 1);
    t.end();
  });
});

test('abort after end', function(t) {
  var aborted   = false;
  var completed = 0;

  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  request.on('complete', function(value) {
    aborted = value;
    completed++;
  });

  request.end();
  request.abort();

  t.equal(completed, 1);
  t.false(aborted);
  t.end();
});

test('write after abort', function(t) {
  var error   = null;
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  request.once('error', function(err) {
    error = err;
  });

  request.abort();
  request.write('foo');

  process.nextTick(function() {
    t.type(error, Error);
    t.equal(error.message, 'Request aborted.');
    t.equal(wrapper.body(), '');
    t.end();
  });
});

test('creates a fake connection', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.type(request.connection, EventEmitter);
  t.equal(wrapper.connection, request.connection);
  t.end();
});

test('does not overwrite an existing connection', function(t) {
  var connection = {};
  var request    = createRequest();

  request.connection = connection;

  var wrapper = new RequestWrapper(request);

  t.equal(request.connection, connection);
  t.equal(wrapper.connection, connection);
  t.end();
});

test('creates a fake socket', function(t) {
  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  t.type(request.socket, Socket);
  t.equal(wrapper.socket, request.socket);
  t.equal(wrapper.response().socket, request.socket);
  t.end();
});

test('updates the request path', function(t) {
  var options = {
    path: '/some/path'
  };

  var request = createRequest();
  var wrapper = new RequestWrapper(request, options);

  t.equal(request.path, options.path);
  t.equal(wrapper.path, request.path);
  t.end();
});

test('simulates the \'socket\' event (on)', function(t) {
  var connect = null;
  var secure  = null;
  var socket  = null;

  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  request.socket.on('connect', function(value) {
    connect = value;
  });
  request.socket.on('secureConnect', function(value) {
    secure = value;
  });
  request.on('socket', function(value) {
    socket = value;
  });

  t.equal(connect, wrapper.socket);
  t.equal(secure, wrapper.socket);
  t.equal(socket, wrapper.socket);
  t.end();
});

test('simulates the \'socket\' event (once)', function(t) {
  var connect = null;
  var secure  = null;
  var socket  = null;

  var request = createRequest();
  var wrapper = new RequestWrapper(request);

  request.socket.once('connect', function(value) {
    connect = value;
  });
  request.socket.once('secureConnect', function(value) {
    secure = value;
  });
  request.once('socket', function(value) {
    socket = value;
  });

  t.equal(connect, wrapper.socket);
  t.equal(secure, wrapper.socket);
  t.equal(socket, wrapper.socket);
  t.end();
});
