var net = require('net'),
	dgram = require('dgram'),
	util = require('util'),
	clients = [],
	SOCKS_VERSION = 5,
/*
 * Authentication methods
 ************************
 * o  X'00' NO AUTHENTICATION REQUIRED
 * o  X'01' GSSAPI
 * o  X'02' USERNAME/PASSWORD
 * o  X'03' to X'7F' IANA ASSIGNED
 * o  X'80' to X'FE' RESERVED FOR PRIVATE METHODS
 * o  X'FF' NO ACCEPTABLE METHODS
 */
    AUTHENTICATION = {
        NOAUTH: 0x00,
        GSSAPI: 0x01,
        USERPASS: 0x02,
        NONE: 0xFF
    },
/*
 * o  CMD
 *    o  CONNECT X'01'
 *    o  BIND X'02'
 *    o  UDP ASSOCIATE X'03'
 */
    REQUEST_CMD = {
        CONNECT: 0x01,
        BIND: 0x02,
        UDP_ASSOCIATE: 0x03
    },
/*
 * o  ATYP   address type of following address
 *    o  IP V4 address: X'01'
 *    o  DOMAINNAME: X'03'
 *    o  IP V6 address: X'04'
 */
    ATYP = {
        IP_V4: 0x01,
        DNS: 0x03,
        IP_V6: 0x04
    },
    Address = {
        read: function (buffer, offset) {
                  if (buffer[offset] == ATYP.IP_V4) {
                      return util.format('%s.%s.%s.%s', buffer[offset+1], buffer[offset+2], buffer[offset+3], buffer[offset+4]);
                  } else if (buffer[offset] == ATYP.DNS) {
                      return buffer.toString('utf8', offset+2, offset+2+buffer[offset+1]);
                  } else if (buffer[offset] == ATYP.IP_V6) {
                      return buffer.slice(buffer[offset+1], buffer[offset+1+16]);
                  }
              },
        sizeOf: function(buffer, offset) {
                    if (buffer[offset] == ATYP.IP_V4) {
                        return 4;
                    } else if (buffer[offset] == ATYP.DNS) {
                        return buffer[offset+1]+1;
                    } else if (buffer[offset] == ATYP.IP_V6) {
                        return 16;
                    }
                }
    };
	
function createSocksServer(cb) {
	var socksServer = net.createServer();

    socksServer.on('listening', function() {
        var address = socksServer.address();
        //console..info('LISTENING %s:%s', address.address, address.port);
    });
    socksServer.on('connection', function(socket) {
        //console..info('CONNECTED %s:%s', socket.remoteAddress, socket.remotePort);
		initSocksConnection.bind(socket)(cb);
		
		socket.on('error', function(e) {
			//console..error('error: %j', e);
			this.end();
		});
    });
    return socksServer;
}

// socket is available as this
function initSocksConnection(on_accept) {
    // keep log of connected clients
    clients.push(this);

    // remove from clients on disconnect
    this.on('end', function() {
        var idx = clients.indexOf(this);
        if (idx != -1) {
            clients.splice(idx, 1);
        }
    });
    this.on('initSocksConnection error', function(e) {
        //console..error('initSocksConnection error');
    });

    // do a handshake
    this.handshake = handshake.bind(this);
    this.on_accept = on_accept; // No bind. We want 'this' to be the server, like it would be for net.createServer
    this.on('data', this.handshake);
}

function handshake(chunk) {
    this.removeListener('data', this.handshake);

    var method_count = 0;

    // SOCKS Version 5 is the only support version
    if (chunk[0] != SOCKS_VERSION) {
        //console..error('handshake: wrong socks version: %d', chunk[0]);
        this.end();
    }
    // Number of authentication methods
    method_count = chunk[1];

    this.auth_methods = [];
    // i starts on 1, since we've read chunk 0 & 1 already
    for (var i=2; i < method_count + 2; i++) {
        this.auth_methods.push(chunk[i]);
    }

    var resp = new Buffer(2);
    resp[0] = 0x05;
    if (this.auth_methods.indexOf(AUTHENTICATION.NOAUTH) > -1) {
        //console..log('Handing off to handleRequest');
        this.handleRequest = handleRequest.bind(this);
        this.on('data', this.handleRequest);
        resp[1] = AUTHENTICATION.NOAUTH;
        this.write(resp);
    } else {
        //console..error('Unsuported authentication method -- disconnecting');
        resp[1] = 0xFF;
        this.end(resp);
    }
}

function handleRequest(chunk) {
    this.removeListener('data', this.handleRequest);
    var cmd=chunk[1],
        address,
        port,
        offset=3;
    // Wrong version!
    if (chunk[0] !== SOCKS_VERSION) {
        this.end('%d%d', 0x05, 0x01);
        //console..error('handleRequest: wrong socks version: %d', chunk[0]);
        return;
    } /* else if (chunk[2] == 0x00) {
        this.end(util.format('%d%d', 0x05, 0x01));
        errorLog('handleRequest: Mangled request. Reserved field is not null: %d', chunk[offset]);
        return;
    } */
    address = Address.read(chunk, 3);
    offset = 4 + Address.sizeOf(chunk, 3);
    port = chunk.readUInt16BE(offset);

    //console..log('Request: type: %d -- to: %s:%s', chunk[1], address, port);

    if (cmd == REQUEST_CMD.CONNECT) {
		this.request = chunk;
		this.on_accept(this, port, address, proxyReady.bind(this));
    } else if(cmd == REQUEST_CMD.UDP_ASSOCIATE){
		//console..log('cmd-REQUEST_CMD.UDP_ASSOCIATE');
		this.request = chunk;
		this.udpclient = dgram.createSocket("udp4");
		this.udpclient.bind(0);
		var udpaddress = this.udpclient.address();
		//应答
		var resp = new Buffer(chunk.length);
		chunk.copy(resp);
		// rewrite response header
		resp[0] = SOCKS_VERSION;
		resp[1] = 0x00;
		resp[2] = 0x00;
		var ad = udpaddress.address.split(".");
		resp[4]=Number(ad[0]);
		resp[5]=Number(ad[1]);
		resp[6]=Number(ad[2]);
		resp[7]=Number(ad[3]);
		resp.writeUInt16BE(udpaddress.port,8);
		this.write(resp);
		this.clientaddress=address;
		this.clientport=port;
		this.udphandshake = udphandshake.bind(this);
		this.udpclient.on('message', this.udphandshake);
    }
	else {
		this.end('%d%d', 0x05, 0x01);
		return;
    }
}

function proxyReady() {
    //console..log('Indicating to the client that the proxy is ready');
    // creating response
    var resp = new Buffer(this.request.length);
    this.request.copy(resp);
    // rewrite response header
    resp[0] = SOCKS_VERSION;
    resp[1] = 0x00;
    resp[2] = 0x00;
    this.write(resp);
}

function udphandshake(msg, rinfo) {
    this.removeListener('message', this.udphandshake);
	//get the udp head
	if(rinfo.address==this.clientaddress){//转发
		var address=Address.read(msg, 3),
		offset = 4 + Address.sizeOf(msg, 3),
		port = chunk.readUInt16BE(offset);
		//console..log('SOCK5-ON-DATA');
		this.udpclient.send(msg,offset+2,msg.length-offset-2,port,address);
	} else {//收到其它信息
		var resp = new Buffer(10+msg.length);
		msg.copy(resp,10);
		// rewrite response header
		resp[0] = 0x00;
		resp[1] = 0x00;
		resp[2] = 0x00;
		resp[3] = 0x01;
		var ad = rinfo.address.split(".");
		resp[4]=Number(ad[0]);
		resp[5]=Number(ad[1]);
		resp[6]=Number(ad[2]);
		resp[7]=Number(ad[3]);
		resp.writeUInt16BE(rinfo.port,8);
		this.udpclient.send(resp,0,resp.length,this.clientport,this.clientaddress);
	}
	this.udpclient.on('error',function(){});
	this.on('close',function(had_error){
		this.end();
		this.udpclient.close();
	}.bind(this));
	
	this.on('error',function(had_error){
		this.end();
		this.udpclient.close();
	}.bind(this));
}

module.exports = {
    createServer: createSocksServer
};
