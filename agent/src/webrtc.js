const nodeDataChannel = require('node-datachannel');

nodeDataChannel.initLogger('Error');

const ICE_SERVERS = ['stun:stun.l.google.com:19302'];

// Creates a PeerConnection on the agent side, which is always the answerer
// (the client always initiates by creating the offer + data channel).
function createPeerConnectionForOffer({ onLocalDescription, onLocalCandidate, onDataChannel }) {
  const pc = new nodeDataChannel.PeerConnection('agent', { iceServers: ICE_SERVERS });

  pc.onLocalDescription(onLocalDescription);
  pc.onLocalCandidate(onLocalCandidate);
  pc.onDataChannel(onDataChannel);

  return pc;
}

module.exports = { createPeerConnectionForOffer };
