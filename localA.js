var net = require('net'),
    socks5 = require('./lib/socks5.js'),
	tunnel = require('./lib/tunnel.js'),
	config = require('./config.js');

var exec = require('child_process').exec;
var d = require('domain').create();
var cluster = require('cluster');

var mode="http"; //"raw, http"
var numCPUs = require('os').cpus().length;

d.run(function() { 

if (cluster.isMaster) {

   // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  if(1==numCPUs) cluster.fork();//make sure it is more than 2

	cluster.on('exit', function(worker, code, signal) {
	if (worker.suicide !== true) {
		exec('taskkill /pid '+worker.process.pid +' /T /F');
	}	
	var exitCode = worker.process.exitCode;
	console.log('worker ' + worker.process.pid + ' died ('+exitCode+'). restarting...'); 
	cluster.fork();	
  });
} else {
  // Workers can share any TCP connection
  // In this case its a proxy server
if (mode == "http") {
	var tunnel_address = config.http_dns_server.address; 
	var tunnel_port = config.http_dns_server.port;
	var self_name = process.pid;
	var endpoint = null;

	tunnel.createPersistentClient(tunnel_address, tunnel_port, function(ep) {
		endpoint = ep;
		console.log('Client created');
		StartSock5Service();
	});
} else {
	StartSock5Service();
}
// Create server
// The server accepts SOCKS connections. This particular server acts as a proxy.
function StartSock5Service() {
	var  PORT5='8888';
	var server5 = socks5.createServer(function(socket, port, address, proxy_ready) {

		// Implement your own proxy here! Do encryption, tunnelling, whatever! Go flippin' mental!
		// I plan to tunnel everything including SSH over an HTTP tunnel. For now, though, here is the plain proxy:
		//console.log('Got through the first part of the SOCKS protocol.');
		var proxy;
		if (mode == "raw") {
			proxy = net.createConnection(port, address, proxy_ready);
		 } else if (mode == "http") {	
			if (endpoint == null) {
				throw "Sorry, connection is not okay.";		
			}
			proxy = endpoint.TCPConnection(socket, {host: address, port: port}, proxy_ready);
		}
		socket.pipe(proxy).pipe(socket);
		socket.on('close', function(had_error) {
			//console.error('application closed');	
		}.bind(this));
		socket.on('error', function(had_error) {
			//the tunnel will also monitor it (see: connect2Outer)
			//console.error('application error');	
		}.bind(this));
		//5	minutes
		socket.setTimeout(300000, function(error){
			socket.emit('error', false);
			//console.error('application timeout 60000ms');
		}.bind(this));
	});

	server5.on('error', function (e) {
		console.error('SERVER ERROR: %j', e);
		if (e.code == 'EADDRINUSE') {
			console.log('Address in use, retrying in 10 seconds...');
			setTimeout(function () {
				console.log('Reconnecting to %s',PORT);
				server.close();
				server.listen(PORT5);
			}, 10000);
		}
	});
	server5.listen(PORT5);
}

} // End of IsMaster
}); // End of Domain
