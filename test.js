'use strict';

const qa = require("./qa");

const server = new qa.PeerTalkClient().listen();

process.stdin.resume();
process.stdin.setEncoding('utf8');
process.stdin.on('data', text => {
	if(text == null) return;
	
	let m = /(quit).*|\s*(\S+)\s+(\S+)/i.exec(text);
	
	if(!m || m[1]) {
		server.close();
		process.exit();
	}
	else {
		server.send({q: "msg", m: m[3]}, {address: m[2]});
	}
});
