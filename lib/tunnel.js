var http = require('http');
var net = require('net');
var util = require('util');
var b64 = require('./base64stream');
var Stream = require('stream').Stream;
var events = require('events');

function StreamEndpoint(socket) {
	var self = this;
	this.socket = socket;
	this.highest_stream_id = 0x389;
	this.generate_stream_id = function() {
		self.highest_stream_id++;
		return (self.highest_stream_id-1);
    }
	this.send_queue = [];
	this.send_queue.sendPu = function (pu) {
		//not buffer data in the EndPoint, in socket
		//but remain interface to send a list 
		var buf = JSON.stringify([pu]);
		self.socket.emit("tunnel", buf);
	}

	this.endpoints = {}; 
	this.fetchData = function() {
		var buf = JSON.stringify(self.send_queue);
		self.send_queue = [];
		return buf;
	}
	
	this.dispatchData = function(data) {
		try {
			var chunks = JSON.parse(data) || [];
			if (chunks.length > 0)
				self.multiplex_decapsulate(chunks);
		} catch(err) {
		}
	}
	this.multiplex_decapsulate = function(chunks) {
		var handlers = {
			'openack': function(chunk) {
				self.openackEndpoint(chunk.stream_id);
			},
			'open': function(chunk) {
				try {
					var trytimes = 0;
					var socket = new net.Socket({allowHalfOpen:true});					
					socket.connect({port: chunk.port, host: chunk.host}, function() {

						socket.removeAllListeners('error');
						var ep  = self.createEndpoint(chunk.stream_id, socket);
						self.send_queue.sendPu({method: 'openack', stream_id: chunk.stream_id});
						
						self.connect2Inner(ep);
						self.connect2Outer(socket, ep);
						
						ep.forOuter.pipe(socket);
						socket.pipe(ep.forOuter);
					});	
					socket.on('error', function(e){
						//fail to connect target, let peer release resource
						console.log('fail to make a TCP connection to '+chunk.host+':'+chunk.port);
						self.send_queue.sendPu({method: 'close', stream_id: chunk.stream_id});
					});
				}
				catch (e) {
				}
			},
			'data': function(chunk) {
				var epI = self.endpoints[chunk.stream_id].forInner;
				epI.write(chunk.data);
			},
			'end': function(chunk) {
				var epI = self.endpoints[chunk.stream_id].forInner;
				epI.end(chunk.data);
			},
			'close': function(chunk) {
				//console.log("receive-CLOSE: " + chunk.stream_id);
				self.send_queue.sendPu({method: 'closeack', stream_id: chunk.stream_id});			
				self.destroyEndpoint(chunk.stream_id);			
			},
			'closeack': function(chunk) {
				//console.log("receive-CLOSE-ACK: " + chunk.stream_id);			
				self.destroyEndpoint(chunk.stream_id);			
			}			
		}	
		chunks.forEach(function(chunk) {
			handlers[chunk.method](chunk);
		});
	}
	this.openackEndpoint = function(stream_id) {
		var ep = self.endpoints[stream_id];
		if (!ep) return;
		
		self.connect2Inner(ep);		
		for (var i=0; i<ep.readyCb.length; i++) {
			ep.readyCb[i]();
		}
	}
	this.destroyEndpoint = function(stream_id) {
		var ep = self.endpoints[stream_id];
		if (!ep) return;		
		ep.sk.unpipe();
		ep.forOuter.unpipe();

		ep.forInner.removeAllListeners();
		ep.forOuter.removeAllListeners();		
		ep.forInner.destroy();
		ep.forOuter.destroy();
		
		ep.sk.removeAllListeners();
		ep.sk.destroy();
		
		
		setTimeout(function(){
			try {
				delete ep.enc;
				delete ep.dec;
				delete self.endpoints[stream_id];
			}
			catch(e) {
			}
		}, 0);
	} 
	this.createEndpoint = function(stream_id, socket) {
		var ep = {id: stream_id, sk: socket, readyCb:[]};
		
		var duplex = function (id, writer, reader, type) {
			var thepipe = new Stream();
			thepipe.id = id;
			thepipe.type = type;
			Object.defineProperty(thepipe, "writable", {
				get: function () {
					return writer.writable;
				}
			})
			Object.defineProperty(thepipe, "readable", {
				get: function () {
					return reader.readable
				}
			})
			;['write', 'end'].forEach(function (func) {
				thepipe[func] = function () {
					if (writer[func])
						return writer[func].apply(writer, arguments);
				}
			})
			;['read', 'resume', 'pause', 'setEncoding', 'pipe', 'unpipe'].forEach(function (func) {
				thepipe[func] = function () {
					if(reader[func])
						return reader[func].apply(reader, arguments);
				}
			})
			// for both
			;['destroy'].forEach(function (func) {
				thepipe[func] = function () { 
				
					if(reader[func])
						reader[func].apply(reader, arguments);
					if(writer[funct])
						writer[func].apply(writer, arguments);
				}
			})
			
			;['data', 'end', 'error', 'close', 'pipe'].forEach(function (event) {
				reader.on(event, function () {
					
					var args = [].slice.call(arguments)
					args.unshift(event)
					thepipe.emit.apply(thepipe, args)
				})
			})
			;['drain', 'error', 'close', 'pipe'].forEach(function (event) {
				writer.on(event, function () {
					
					var args = [].slice.call(arguments)
					args.unshift(event)
					thepipe.emit.apply(thepipe, args)
				})
			})
			return thepipe;
		}
		ep.enc = new b64.Encoder();
		ep.dec = new b64.Decoder();
		ep.forOuter = duplex(ep.id, ep.enc, ep.dec, 'Outer');
		ep.forInner = duplex(ep.id, ep.dec, ep.enc, 'Inner');
		self.endpoints[ep.id] = ep;
		return ep;	
	}

	this.connect2Inner = function(ep) {
		ep.forInner.on('data', function(d) {
			self.send_queue.sendPu({method: 'data', stream_id: ep.id, data: d});
		});		
		ep.forInner.on('end', function(d) {
			self.send_queue.sendPu({method: 'end', stream_id: ep.id, data: d});
		});		
		ep.forInner.on('close', function() {
			if (!ep.releasing) {
				ep.releasing = true;
				self.send_queue.sendPu({method: 'close', stream_id: ep.id});
			}
		});
	}
	this.connect2Outer = function(socket, ep) {
		function error_detected(reason, e, ep) {
			if (!ep.releasing) {
				ep.releasing = true;
				//console.log('send=SOCK-CLOSE[%s]:[%d]', reason, ep.id);
				self.send_queue.sendPu({method: 'close', stream_id: ep.id, reason: reason});				
			}
		} 
		socket.on('error', function(e){
			error_detected('error', e, ep);
		});
		socket.on('close', function(e){
			error_detected('close', e, ep);		
		});
		socket.on('timeout', function(e){
			error_detected('timeout', e, ep);		
		});
	}

	this.TCPConnection = function(socket, hash, readyCallback) {
		var newSteamId = self.generate_stream_id();				
		var ep = self.createEndpoint(newSteamId, socket);
		self.send_queue.sendPu({method: 'open', stream_id: newSteamId, port: hash.port, host: hash.host});
		if (readyCallback)
			ep.readyCb.push(readyCallback);
			
		return ep.forOuter;
	}	
	return this;
}

exports.createPersistentClient = function(tunnelServerHost, port, readyCallback) {	
	var io = require('socket.io-client');
	var url = 'http://'+tunnelServerHost+':'+port+'/';
	var socket = io.connect(url);

	socket.on('connected', function (data) {
		console.log('tunnel is established');
		socket.emit('connack', "");
		
		var se = new StreamEndpoint(socket);
		socket.on('tunnel', function(data){
			se.dispatchData(data);
		});		
		readyCallback(se);
	});
}

exports.createServer = function(connectionListner, httpListner) {
	var app = require('http').createServer(httpListner)
	, io = require('socket.io').listen(app);
	io.set('log level', 0);	
	io.set('transports', ['xhr-polling']);
		
	io.sockets.on('connection', function (socket) {
		//socket.manager.transports[socket.id].socket.setTimeout(15000);
		console.log('connection');
		var se = new StreamEndpoint(socket);
		socket.emit('connected', "");
		socket.on('tunnel', function (data) {
			se.dispatchData(data);			
		});
	});
	//listen control outside
	return app;
}
