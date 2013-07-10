"use strict";
var http = require('http');
var dns = require('native-dns'),
  tcpserver = dns.createTCPServer(),
  server = dns.createServer();
var config = require('./config.js');
  
var CryptoJS = require('./lib/aes.js').CryptoJS; 
var Passphrase = "www.yeefont.com";

 var QueryOthers = function(name, QueryCb) {
  var question = dns.Question({
	name: name,
	type: 'A',
  });
  var start = Date.now();
  var dreq = dns.Request({
    question: question,
    server: config.dns_server,
    timeout: 1000,
  });
  var answers = [];
  dreq.on('timeout', function () {
    //console.log('DNS-Timeout in making request');
  });
  dreq.on('message', function (err, answer) {
	answers.push(answer);
  });
  dreq.on('end', function () {
    var delta = (Date.now()) - start;
    //console.log('DNS-Finished processing request: ' + delta.toString() + 'ms');
	if (answers.length > 0)
	    QueryCb(answers[0]);
  });
  dreq.send();  
};

var onMessage = function (request, response) {
 
  var askdomain = request.question[0].name;
  var encrypted = CryptoJS.AES.encrypt(askdomain, Passphrase, { format: CryptoJS.JsonFormatter });
   
  var options = {
    hostname: config.http_sock5_server.address, 
    port: config.http_sock5_server.port,
    path: '/AAAA/' + new Date().getTime() + '/' + encodeURIComponent(encrypted),
    method: 'GET'
  };
  //if for server itself...
  if (options.hostname == askdomain) {
  
    QueryOthers(askdomain, function(answer) {
      answer.answer.forEach(function (a) {
 	    if (a.address) response.answer.push(a);
      });
	  //console.log('---END--OF---RES');
	  response.send();	
	});
    return;
  }

  var hreq = http.request(options, function(hres) {

  //console.log('STATUS: ' + hres.statusCode);
  //console.log('HEADERS: ' + JSON.stringify(hres.headers));
    var buf = "";
  //  hres.setEncoding('utf8');
    hres.on('error', function(e){
      console.log('HTTP-problem with response: ' + e.message);  
    });	
	hres.on('data', function(chunk) {
		if (chunk) buf = buf + chunk;
	})
    hres.on('end', function (chunk) {
	  if (chunk) buf = buf + chunk;
      //console.log('BODY: ' + buf);
	  try {
		var decrypted = CryptoJS.AES.decrypt(buf, Passphrase, { format: CryptoJS.JsonFormatter });  
		var exbody = decrypted.toString(CryptoJS.enc.Utf8);
		var answer = JSON.parse(exbody);
	  }
	  catch(e) {
	  	return response.send();	  
	  }
      answer.answer.forEach(function (a) {
 	    if (a.address) response.answer.push(a);
		//console.log(a.address);	
      });
	  //console.log('---END--OF---RES');
	  response.send();	  
    });
  });
  
  hreq.on('error', function(e) {
    console.log('HTTP-problem with request: ' + e.code );  
    console.log('HTTP-problem with request: ' + e.message);
  });
  hreq.end();  
};

var onError = function (err, buff, req, res) {
  console.log('DNS-Server Error');
  console.log(err.stack);
};

var onListening = function () {
  console.log('DNS-server listening on', this.address());
};

var onSocketError = function (err, socket) {
  console.log('DNS-Server Socket Error');
  console.log(err);
};

var onClose = function () {
  console.log('DNS-server closed', this.address());
};

server.on('request', onMessage);
server.on('error', onError);
server.on('listening', onListening);
server.on('socketError', onSocketError);
server.on('close', onClose);

server.serve(53, '127.0.0.1');

tcpserver.on('request', onMessage);
tcpserver.on('error', onError);
tcpserver.on('listening', onListening);
tcpserver.on('socketError', onSocketError);
tcpserver.on('close', onClose);

tcpserver.serve(53, '127.0.0.1');

//var response = {answer:[]};
//var request = {question:[{name:'www.baidu.com'}]};
//onMessage(request, response);
