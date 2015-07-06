'use strict';

var EventEmitter = require('events').EventEmitter,
    debug        = require('debug')('nock.socket'),
    util         = require('util');

module.exports = Socket;

function Socket() {
  EventEmitter.call(this);

  this.writable = true;
  this.readable = true;

  this.setNoDelay = noop;
  this.setTimeout = function(timeout, fn) {
    this.timeout = timeout;
    this.timeoutFunction = fn;
  }
  this._checkTimeout = function(delay) {
    if (this.timeout && delay > this.timeout) {
      debug('socket timeout');
      if (this.timeoutFunction) {
        this.timeoutFunction();
      }
      else {
        this.emit('timeout');
      }
    }
  }

  this.setKeepAlive = noop;
  this.destroy = noop;
  this.resume = noop;

  this.getPeerCertificate = getPeerCertificate;
}

util.inherits(Socket, EventEmitter);

function noop() {}

function getPeerCertificate() {
  return new Buffer((Math.random() * 10000 + Date.now()).toString()).toString('base64');
}
