"use strict";
var http = require('http');
var dns = require('native-dns'),
  tcpserver = dns.createTCPServer(),
  server = dns.createServer();
var config = require('../config.js');

var CryptoJS = require('./aes.js').CryptoJS; 
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

var Listener = function (hreq, hres) {
	//console.log(hreq.url);
	var plain = (hreq.url.indexOf('/plain') == 0);
	var idx = hreq.url.lastIndexOf('/');
	if (idx > -1)  {
		//console.log(hreq.url.slice(idx+1));
		try {
			var askdomain = decodeURIComponent(hreq.url.slice(idx+1));
			var decrypted = plain ? askdomain : CryptoJS.AES.decrypt(askdomain, Passphrase, { format: CryptoJS.JsonFormatter }).toString(CryptoJS.enc.Utf8);		
			//console.log(decrypted);
			QueryOthers(decrypted, function(answer) {
				var encrypted = plain ? JSON.stringify(answer) : CryptoJS.AES.encrypt(JSON.stringify(answer), Passphrase, { format: CryptoJS.JsonFormatter });
				hres.writeHead(200, {'Content-Type': 'text/plain'});
				var reply = ""+encrypted;
				//console.log(reply);
				hres.end(reply);
			});
		}					
		catch (e) {
			hres.writeHead(200, {'Content-Type': 'text/plain'});
			hres.write('In processing B...')			
			hres.write(e.message);
			hres.write(e.stack);
			hres.end();			
		}		
	} else {
			hres.writeHead(200, {'Content-Type': 'text/plain'});
			hres.write('In processing A...')
			hres.end();	
	}
};

exports.Listener = Listener;
