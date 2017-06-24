var apiKey = 'ce16d9aa-4119-4097-a8a5-3a5016c6a81c';
var myId = null;
var peer = null;

btnRootStart.style.display = btnStart.style.display = '';
btnRootStart.onclick = evt => {
    peer = new Peer('root', { key: apiKey, debug: 3 });
    peerSetup(true);
}
btnStart.onclick = evt => {
    peer = new Peer({ key: apiKey, debug: 3 });
    peerSetup(false);
}

function peerSetup(isRoot) {
    peer.on('open', id => {
        myIdDisp.textContent = myId = id;
        peerInstanceExtend({
            peer,
            rootId: 'root',
            branchCount: 2,
            getStream: 'testpattern_time',
            previewElement: selfView
        });
    });
}

