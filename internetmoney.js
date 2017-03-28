/**
 * Internet Money implementation checklist:
 *
 1. Message parsing, server-client model
 2. Resource-hash mapping
 3. Block acyclical graph
 4. Code processing (VM)
 5. Waiting for resources
 6. Block verification
 7. Workers (RSA-signed assertions)
 8. Lambda creation (miner)
 9. P2P messaging model (ask for resources, broadcast, etc)
**/

'use strict';

const
	events = require("events"),
	dgram = require("dgram"),
	UBJSON = require("ubjson"),
	_ = require("underscore"),
	LRU = require("lru");

const
	VERSION = 0,
	DEF_PORT = 4305, DEF_PEER_LIMIT = 256,
	KEYSIZE = 256/8;

/**
 * Create a string which can be used in LRU for fast lookup
**/
function serialize_peer(peer) {
	return peer.address + '\0' + peer.port;
}

/**
 * Ensure that all peer objects have the same properties.
**/
function normalize_peer(peer) {
	let a = peer.address, p = (peer.port|0) || DEF_PORT;
	
	if(typeof a != 'string') {
		return null;
	}
	
	return {address: a, port: p};
}

/**
 * Wrapper around LRU to handle peers.
**/
class PeerList {
	constructor(size) {
		this.data = new LRU(size);
	}
	
	add(peer) {
		this.data.set(serialize_peer(peer), peer);
	}
	
	remove(peer) {
		this.data.remove(serialize_peer(peer));
	}
	
	has(peer) {
		return this.data.keys.indexOf(serialize_peer(peer)) != -1;
	}
}

/**
 * Socket for handling the low-level parsing of the packets with none of the
 *  responding.
**/
class PeerTalkSocket extends events.EventEmitter {
	constructor(config) {
		config = config || {};
		super();
		
		let pl = (config.peerLimit|0) || DEF_PEER_LIMIT;
		
		// Peers which were added
		this.peers = new PeerList(pl);
		
		// Peers that we haven't contacted yet, so don't know if they exist
		this.pending = new PeerList(pl);
		
		// Raw UDP socket
		this.socket = dgram.createSocket({
			type: 'udp6'
		});
		
		this.socket.on('close', () => {
			this.socket = null;
			this.emit('close');
		});
		this.socket.on('error', err => {
			this.close();
			this.emit('error', err);
		});
		this.socket.on('message', (msg, rinfo) => {
			UBJSON.unpackBuffer(msg, (err, data) => {
				if(err) {
					this.emit('error', err);
					return;
				}
				
				let q = /^.*?(p[io]ng|query|assert|peer)/i.exec(data.q);
				if(q) {
					this.emit(q[1].toLowerCase(), data, rinfo);
				}
				else {
					this.emit("unknown", data, rinfo);
				}
				
				//<!DEBUG
				console.log(data, rinfo);
				//DEBUG!>
			});
		});
	}
	
	listen(port, addr) {
		this.socket.bind({
			port: port || DEF_PORT,
			address: addr
		});
		return this;
	}
	
	close() {
		this.socket.close();
		this.socket = null;
		return this;
	}
	
	addUntrustedPeer(peer) {
		this.pending.add(normalize_peer(peer));
		return this;
	}
	
	addPeer(peer) {
		this.peers.add(this.pending.has(peer) || peer);
		return this;
	}
	
	removePeer(peer) {
		peer = normalize_peer(peer);
		
		this.peers.remove(peer);
		this.pending.remove(peer);
		return this;
	}
	
	ping(peer) {
		this.send({q: 'ping', t: Date.now()});
		return this;
	}
	
	send(obj, to) {
		const buf = new Buffer(4096);
		UBJSON.packToBuffer(obj, buf, (err, off) => {
			if(err) {
				this.emit('error', err);
			}
			else {
				this.sendRaw(buf.slice(0, off), to);
			}
		});
		return this;
	}
	
	sendRaw(val, to) {
		this.socket.send(
			val, 0, val.length,
			(to.port|0) || DEF_PORT, to.address + ""
		);
		return this;
	}
}

class PeerTalkClient extends PeerTalkSocket {
	constructor(config) {
		config = config || {};
		super(config);
		
		// Respond with pong
		this.on('ping', (data, rinfo) => {
			this.send({q: "pong", t: Date.now()});
			this.addPeer(rinfo);
		});
		
		// Respond with a list
		this.on('boot', (data, rinfo) => {
			let p = data.count;
			if(p <= 0) {
				p = 1;
			}
			if(p > this.peerLimit) {
				p = this.peerLimit;
			}
			
			this.send({
				v: VERSION,
				q: "peers",
				p: Array.from(
					_.sample(this.peers.keys, p)
				)
			}, rinfo);
			
			this.addPeer(rinfo);
		});
		
		// Add peers to the pending list
		this.on('peers', (data, rinfo) => {
			let p = data.peers;
			if(!Array.isArray(p)) {
				p = [];
			}
			
			for(let x of p) {
				x = normalize_peer(x);
				if(x) {
					this.addUntrustedPeer(x);
				}
			}
			
			this.addPeer(rinfo);
		});
		
		this.on('unknown', (data, rinfo) => {
			this.removePeer(rinfo);
		});
	}
}

module.exports = {
	VERSION,
	DEF_PORT, DEF_PEER_LIMIT,
	KEYSIZE,
	PeerTalkSocket, PeerTalkClient
};
