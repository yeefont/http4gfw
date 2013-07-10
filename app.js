var http = require('http');
var net = require('net');
var tunnel = require('./lib/tunnel.js');
var dnslistener = require('./lib/dnssrv.js').Listener;

var tunnel_port = process.env.VMC_APP_PORT || 80;
var s = tunnel.createServer(function() {
  //console.log('Someone connected!');
}, dnslistener);

s.listen(tunnel_port);

process.on('uncaughtException', function (err) {
  console.log('Caught exception: ' + err);
});