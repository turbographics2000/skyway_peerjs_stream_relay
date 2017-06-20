var apiKey = 'ce16d9aa-4119-4097-a8a5-3a5016c6a81c';
var debugLevel = 2;
var closeNotifiyIgnoreIds = {};
var myId = null;
var stream = null;
var peer = null;

PeerClassExtend();

btnRootStart.style.display = btnStart.style.display = '';
btnRootStart.onclick = evt => {
    peer = new Peer('root', { key: apiKey, debug: 3 });
    peerSetup();
}
btnStart.onclick = evt => {
    peer = new Peer({ key: apiKey, debug: 3 });
    peerSetup();
}

function peerSetup() {
    peerInstanceExtend(peer);

    peer.on('open', id => {
        console.log('peer on "open"');
        myIdDisp.textContent = myId = id;
        if (id === 'root') {
            webCamSetup(selfView).then(_ => { });
        } else {
            peer.notifyJoin();
        }
        myIdDisp.textContent = id;
    });

    peer.on('call', call => {
        addLogMsg('peer on "call"');
        call.answer(null);
        callSetup(call);
    });

    // 新規視聴者(ブランチ)が参加したとき、放送主側で発生するイベント
    peer.on('join', joinId => {
        addLogMsg('join', 'event');
        var branchData;
        // 視聴者(ブランチ)配置する
        if (levelBranches[0] === undefined) {
            branchData = initBranch(joinId);
        } else {
            branchData = addBranch(joinId);
        }
        // 配置結果を視聴者に知らせる
        peer.notifyBranchData(branchData);
    });

    // 配置結果を受信したとき視聴者(ブランチ)側で発生するイベント
    peer.on('branch_data', data => {
        addLogMsg('branch_data', 'event');
        branchData = data;
        if (branchSrcConnection) {
            branchSrcConnection.close();
            branchSrcConnection = null;
        }
        // if (branchConnections) {
        //     Object.keys(branchConnections).forEach(branchId => {
        //         branchConnections[branchId].close();
        //         delete branchConnections[branchId];
        //     });
        // }
        peer.requestBranch();
    });

    // ブランチからストリームの送信をリクエストしたときにブランチ元(ブランチソース)側で発生するイベント
    peer.on('request_branch', branchId => {
        addLogMsg('request_branch', 'event');
        branchConnections[branchId] = peer.call(branchId, stream);
    });

    // 視聴者(ブランチ)が視聴をやめたとき(close)、
    // 視聴をやめたブランチをブランチ元(ブランチソース)が放送主(ルート)に報告する。
    // その報告を受信したとき放送主(ルート)側で発生するイベント
    peer.on('close_branch', closeId => {
        console.log('peer on "close_branch"');
        if (closeNotifiyIgnoreIds[remoteId]) {
            delete closeNotifiyIgnoreIds[remoteId];
            return;
        }
        peer.migrateBranch(closeId);
    });
}

function webCamSetup(elm) {
    return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    }).then(stream => {
        elm.srcObject = stream;
        return stream;
    }).catch(ex => console.log('getUserMedia error.', ex));
}

function callSetup(call) {
    call.on('stream', stream => {
        console.log('call on "stream"');
        remoteView.srcObject = stream;
        Object.keys(branchData.children).forEach(branchId => {
            branchConnections[branchId] = peer.call(branchId, stream);
        });
    });
    call.on('close', _ => {
        console.log('call on "close"');
        if (myId === 'root') {
            migrateBranch(call.peer);
        } else if (Object.keys(branchConections).includes(call.peer)) {
            notifyCloseBranch(call.peer);
        }
    });
}

function migrateBranch(closeId) {
    dstData = dicBranches[closeId];
    delete dicBranches[closeId];
    var dstLevel = dstData.level;

    var lastLevel = levelBranches.length - 1;
    var oldData = levelBranches[lastLevel].shift();
    if (Object.keys(levelBranches[lastLevel]).length === 0) {
        levelBranches[lastLevel].pop();
    }

    delete dstData.branchSRC.children[dstData.id];
    dstData.branchSRC.children[oldData.id] = dstData;

    delete levelBranches[dstData.level][dstData.id];
    levelBranches[dstData.level][oldData.id] = dstData;

    delete dicBranches[dstData.id];
    dicBranches[oldData.id] = dstData;

    dstData.id = oldData.id;

    closeNotifiyIgnoreIds[dstData.id] = true;

    return dstData;
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
