'use strict';

const qa = require("./qa");

const server = new qa.QAServer().
	listen().
	on('query', (type, key, rinfo) => {
		console.log("Query", -type, key.toString());
	}).
	on('assert', (type, key, value, rinfo) => {
		console.log("Assert", type, key, value);
	}).
	on('stop', rinfo => {
		console.log("Stop");
	});

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => {
	if(text == null) return;
	
	let m = /(quit).*|\s*(\S+)\s+(\S+)/i.exec(text);
	
	if(m[1]) {
		server.close();
		process.exit();
	}
	else if(m[2]) {
		server.sendMeta(qa.META.CONNECT, make_token() + m[2]
	}
	else {
		let m = /(\S+)\s+(.+)/g.exec(text);
		server.assert(1, 'message', m[2], new qa.Target({address: m[1]}));
	}
});
