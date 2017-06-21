var apiKey = 'ce16d9aa-4119-4097-a8a5-3a5016c6a81c';
var debugLevel = 2;
var myId = null;
var stream = null;
var peer = null;
var maxBranchCnt = 5;

PeerClassExtend();

btnRootStart.style.display = btnStart.style.display = '';
btnRootStart.onclick = evt => {
    peer = new Peer('root', { key: apiKey, debug: 3 });
    peerSetup();
}
btnStart.onclick = evt => {
    peer = new Peer({ key: apiKey, debug: 3 });
    peerSetup();
    peer.rootId = 'root';
}

function peerSetup() {
    peerInstanceExtend(peer);

    peer.on('open', id => {
        console.log('peer on "open"');
        myIdDisp.textContent = myId = id;
        if (id === 'root') {
            webCamSetup(selfView).then(strm => stream = strm);
        } else {
            // DataChannelで接続テストを行い接続出来たら、ストリームの接続を行う
            var dc = peer.connect('root');
            dc.on('open', function () {
                console.log('dc open');
                dc.close();
                peer.notifyJoin();
            });
        }
        myIdDisp.textContent = id;
    });

    peer.on('call', call => {
        console.log('peer on "call"');
        if (call.peer === peer.branchData.branchSrcId) {
            branchSrcConnection = call;
        } else {
            branchConections[call.peer] = call;
        }
        call.answer(null);
        callSetup(call);
    });

    // 新規視聴者(ブランチ)が参加したとき、放送主側で発生するイベント
    peer.on('join', joinData => {
        addLogMsg('join', 'event');
        var branchData;
        // 視聴者(ブランチ)配置する
        if (peer.levelBranches[0] === undefined) {
            branchData = peer.initBranch(joinData.joinId);
        } else {
            branchData = peer.addBranch(joinData.joinId);
        }
        // 配置結果を視聴者(ブランチ)に知らせる
        peer.responseBranchData(branchData, joinData.joinId);
    });

    // 配置結果を受信したとき視聴者(ブランチ)側で発生するイベント
    peer.on('branch_data', data => {
        addLogMsg('branch_data', 'event');
        peer.branchData = data;
        if (peer.branchSrcConnection) {
            peer.branchSrcConnection.close();
            peer.branchSrcConnection = null;
        }
        // if (branchConnections) {
        //     Object.keys(branchConnections).forEach(branchId => {
        //         branchConnections[branchId].close();
        //         delete branchConnections[branchId];
        //     });
        // }
        peer.requestBranch(peer.branchData.branchSrcId);
    });

    // ブランチからストリームの送信をリクエストしたときにブランチ元(ブランチソース)側で発生するイベント
    peer.on('request_branch', req => {
        addLogMsg('request_branch from:' + req.fromId, 'event');
        var call = peer.call(req.fromId, stream);
        peer.branchConnections[req.fromId] = call;
        // call.pc.addEventListener('iceconnectionstatechange', function () {
        //     if (this.iceConnectionState === 'disconnected') {
        //         console.log('disconnected');
        //     }
        // });
    });

    // 視聴者(ブランチ)が視聴をやめたとき(close)、
    // 視聴をやめたブランチをブランチ元(ブランチソース)が放送主(ルート)に報告する。
    // その報告を受信したとき放送主(ルート)側で発生するイベント
    peer.on('close_branch', closeId => {
        console.log('peer on "close_branch"');
        if (peer.closeNotifiyIgnoreIds[remoteId]) {
            delete peer.closeNotifiyIgnoreIds[remoteId];
            return;
        }
        peer.migrateBranch(closeId);
    });
}

function webCamSetup(elm) {
    return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    }).then(strm => {
        elm.srcObject = strm;
        return strm;
    }).catch(ex => console.log('getUserMedia error.', ex));
}



function callSetup(call) {
    call.on('stream', strm => {
        console.log('call on "stream"');
        remoteView.srcObject = stream = strm;
        peer.branchSrcConnection = call;
        Object.keys(peer.branchData.children).forEach(branchId => {
            peer.branchConnections[branchId] = peer.call(branchId, stream);
        });
    });
    call.on('close', _ => {
        console.log('call on "close"');
        if (myId === 'root') {
            peer.migrateBranch(call.peer);
        } else if (peer.branchSrcConnection.peer === call.peer) {
            peer.branchSrcConnection = null;
        } else if (peer.branchConections[call.peer]) {
            delete peer.branchConections[call.peer];
            notifyCloseBranch(call.peer);
        }
    });
}


function addLogMsg(str, type) {
    const msgType = document.createElement('span');
    msgType.classList.add('type');
    msgType.textContent = type;
    const msg = document.createElement('span');
    msg.classList.add('log')
    msg.textContent = str;
    const logLine = document.createElement('div');
    logLine.classList.add('log-line');
    logLine.classList.add(type);
    logLine.appendChild(msgType);
    logLine.appendChild(msg);
    logContainer.appendChild(logLine);
    logLine.scrollIntoView();
}
