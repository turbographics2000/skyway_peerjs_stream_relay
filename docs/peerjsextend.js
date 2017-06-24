// Peerクラスを拡張
(function () {
    Peer.prototype.notifyJoin = function () {
        console.log('notifyJoin:' + this.rootId, 'send_notify');
        this.sendNotify({
            extType: 'join',
            joinId: this.id
        }, this.rootId);
    };

    Peer.prototype.notifyCloseBranch = function (closeId) {
        console.log('notifyCloseBranch:' + this.rootId, 'send_notify');
        this.sendNotify({
            extType: 'close_branch',
            id: closeId
        }, this.rootId);
    };

    Peer.prototype.requestStream = function (branchSrcId) {
        console.log('requestStream:' + branchSrcId, 'send_notify');
        this.sendNotify({
            extType: 'request_stream',
            fromId: this.id
        }, branchSrcId);
    };

    Peer.prototype.responseBranchData = function (branchData, dstId) {
        console.log('notifyBranchData:' + dstId, 'send_notify');
        this.sendNotify(Object.assign({ extType: 'branch_data' }, branchData), dstId);
    };

    Peer.prototype.notifyEnd = function () {
        this.levelBranches.forEach(levelBranch => {

        });
    }

    Peer.prototype.sendNotify = function (notifyMsg, dstId) {
        var msg = {
            type: 'CANDIDATE',
            dst: dstId,
            notifyMsg
        }
        this.socket.send(msg);
    };

    Peer.prototype.initBranch = function (remoteId) {
        addLogMsg('initBranch:' + remoteId, 'init_branch');
        var branchData = this.createBranchData(remoteId, 'root', 0);
        this.levelBranches.push({
            [remoteId]: branchData
        });
        this.dicBranches = {
            [remoteId]: branchData
        };
        return branchData;
    };

    Peer.prototype.createBranchData = function (id, branchSrcId, level) {
        return {
            rootId: this.rootId,
            id,
            branchSrcId,
            level,
            children: []
        }
    };

    Peer.prototype.addBranch = function (remoteId, level = 0) {
        let branches = this.levelBranches[level];
        var branchIds = Object.keys(branches);
        for (var i = 0, il = branchIds.length; i < il; i++) {
            var branchId = branchIds[i];
            if (branches[branchId].children.length < this.branchCount) {
                var branchData = this.createBranchData(remoteId, branchId, level + 1);
                branches[branchId].children.push(remoteId);
                this.dicBranches[remoteId] = branchData;
                if (this.levelBranches.length === level + 1) {
                    this.levelBranches.push({});
                }
                this.levelBranches[level + 1][remoteId] = branchData;
                addLogMsg('addBranch:' + remoteId, 'add_branch');
                return branchData;
            }
        }
        var ret = this.addBranch(remoteId, level + 1);
        if (ret) {
            return ret;
        }
    };

    Peer.prototype.migrateBranch = function (closeId) {
        addLogMsg('migrateBranch:' + closeId, 'migrate_branch');
        var lastLevel = this.levelBranches.length - 1;
        var closeData = this.dicBranches[closeId];

        console.log(closeId, closeData, this.dicBranches);
        if (closeData.level === lastLevel) {
            delete this.levelBranches[lastLevel][closeId];
            if (Object.keys(this.levelBranches[lastLevel]).length === 0) {
                this.levelBranches.pop();
            }
            delete this.dicBranches[closeId];
            if (closeData.branchSrcId !== 'root') {
                var closeBranchSrcData = this.levelBranches[lastLevel - 1][closeData.branchSrcId];
                closeBranchSrcData.children.splice(closeBranchSrcData.children.indexOf(closeId), 1);
            }
            addLogMsg('Nothing migrate branch', 'migrate_branch');
        } else {
            var lastLevelBranches = this.levelBranches[lastLevel];
            var lastLevelBranchIds = Object.keys(lastLevelBranches);
            var migrateData = lastLevelBranches[lastLevelBranchIds[0]];
            delete lastLevelBranches[lastLevelBranchIds[0]];
            if (migrateData.level > 0) {
                var oldBranchSrcData = this.levelBranches[migrateData.level - 1][migrateData.branchSrcId];
                oldBranchSrcData.children.splice(oldBranchSrcData.children.indexOf(migrateData.id), 1);
            }
            if (lastLevelBranchIds.length === 1) {
                this.levelBranches.pop();
            }

            if (closeData.level > 0) {
                var closeBranchSrcData = this.levelBranches[closeData.level - 1][closeData.branchSrcId];
                closeBranchSrcData.children.splice(closeBranchSrcData.children.indexOf(closeId), 1);
                closeBranchSrcData.children.push(migrateData.id);
            }
            closeData.children.forEach(childId => {
                this.levelBranches[closeData.level + 1][childId].branchSrcId = migrateData.id;
            });

            delete this.levelBranches[closeData.level][closeId];
            this.levelBranches[closeData.level][migrateData.id] = closeData;

            delete this.dicBranches[closeId];
            this.dicBranches[migrateData.id] = closeData;

            closeData.id = migrateData.id;

            peer.closeNotifiyIgnoreIds[migrateData.id] = true;

            return closeData;
        }
    };

})();

// Peerインスタンスを拡張
function peerInstanceExtend({ peer, rootId, branchCount = 5, getStream, previewElement }) {
    peer.rootId = rootId;
    peer.branchCount = branchCount;
    peer.branchData = null;
    peer.levelBranches = [];
    peer.dicBranches = {};
    peer.closeNotifiyIgnoreIds = {};
    //peer.branchSrcConnection = null;
    let branchSrcConnection = null;
    //peer.branchConnections = {};
    let branchConnections = {};
    //peer.stream = null;
    let stream = null;
    //peer.previewElement = previewElement;
    if (typeof getStream === 'function') {
        peer.getStream = getStream;
    } else if (getStream === 'testpattern') {
        peer.getStream = getTestPatternStream.bind(null, false);
    } else if (getStream === 'testpattern_time') {
        peer.getStream = getTestPatternStream.bind(null, true);
    } else {
        peer.getStream = getWebCamStream;
    }

    // 拡張メッセージハンドラーを設定
    peer.socket.on('message', function (message) {
        var type = message.type;
        switch (type) {
            case 'ID-TAKEN':
                peer.emit('id_taken');
                break;
            case 'CANDIDATE':
                if (message.notifyMsg) {
                    addLogMsg(message.notifyMsg.extType, 'receive_notify');
                    console.log('receive_notify', message.notifyMsg);
                    peer.emit(message.notifyMsg.extType, message.notifyMsg);
                }
                break;
        }
    });

    peer.on('call', call => {
        console.log('peer on "call"');
        peer.branchSrcConnection = call;
        call.answer(null);
        callSetup(call);
    });

    // 新規視聴者(ブランチ)が参加したとき、放送主側で発生するイベント
    peer.on('join', joinData => {
        addLogMsg('join', 'event');
        // 視聴者(ブランチ)を配置する
        if (peer.levelBranches[0] === undefined) {
            peer.branchData = peer.initBranch(joinData.joinId);
        } else {
            peer.branchData = peer.addBranch(joinData.joinId);
        }
        updateTree();
        // 配置結果を視聴者(ブランチ)に知らせる
        peer.responseBranchData(peer.branchData, joinData.joinId);
    });

    // 配置結果を受信したとき視聴者(ブランチ)側で発生するイベント
    peer.on('branch_data', data => {
        if (notifyJoinTOId !== null) {
            clearInterval(notifyJoinTOId);
            notifyJoinTOId = null;
        }
        addLogMsg('branch_data', 'event');
        console.log('branch_data', data);
        peer.rootId = data.rootId;
        peer.branchData = data;
        if (peer.branchSrcConnection) {
            peer.branchSrcConnection.close();
            peer.branchSrcConnection = null;
        }
        peer.requestStream(peer.branchData.branchSrcId);
    });

    // ブランチからストリームの送信をリクエストしたときにブランチ元(ブランチソース)側で発生するイベント
    peer.on('request_stream', req => {
        addLogMsg('request_stream from:' + req.fromId, 'event');
        var call = peer.call(req.fromId, peer.stream);
        peer.branchConnections[req.fromId] = call;
        // 'closed'や'failed'だと数秒かかってしまうので'disconnected'で閉じるようにする
        call.pc.addEventListener('iceconnectionstatechange', function () {
            if (this.iceConnectionState === 'disconnected') {
                console.log('disconnected');
                call.close();
            }
            return true;
        });
        callSetup(call);
    });

    // 視聴者(ブランチ)が視聴をやめたとき(close)、
    // 視聴をやめたブランチをブランチ元(ブランチソース)が放送主(ルート)に報告する。
    // その報告を受信したとき放送主(ルート)側で発生するイベント
    peer.on('close_branch', closeBranchData => {
        console.log('peer on "close_branch"');
        if (peer.closeNotifiyIgnoreIds[closeBranchData.id]) {
            delete peer.closeNotifiyIgnoreIds[closeBranchData.id];
            return;
        }
        var migrateData = peer.migrateBranch(closeBranchData.id);
        peer.responseBranchData(migrateData, migrateData.id);
        updateTree();
    });

    console.log('peer on "open"');
    if (rootId === peer.id) {
        peer.getStream(selfView).then(strm => {
            if (previewElement) {
                previewElement.srcObject = strm;
            }
            stream = strm;
        }).catch(ex => console.log(ex));
    } else {
        // DataChannelで接続テストを行い接続出来たら、ストリームの接続を行う
        var dc = peer.connect('root');
        dc.on('open', function () {
            console.log('dc open');
            dc.close();
            notifyJoinPolling();
        });
    }
}

var notifyJoinTOId = null;
function notifyJoinPolling() {
    peer.notifyJoin();
    notifyJoinTOId = setTimeout(notifyJoinPolling, 3000);
}

function callSetup(call) {
    call.on('stream', stream => {
        console.log('call on "stream"');
        remoteView.srcObject = peer.stream = stream;
        peer.branchSrcConnection = call;
        if (peer.branchData) {
            noNotifyCloseBranch();
            peer.branchData.children.forEach(branchId => {
                peer.branchConnections[branchId] = peer.call(branchId, peer.stream);
            });
            peer.branchData = null;
        }
    });
    call.on('close', _ => {
        console.log('call on "close"');
        if (rootId === peer.id) {
            var migrateData = peer.migrateBranch.call(peer, call.peer);
            updateTree();
            if (migrateData) {
                peer.responseBranchData(migrateData, migrateData.id);
            }
        } else if (peer.branchSrcConnection.peer === call.peer) {
            peer.branchSrcConnection = null;
            noNotifyCloseBranch();
        } else if (peer.branchConnections[call.peer]) {
            delete peer.branchConnections[call.peer];
            if (peer.closeNotifiyIgnoreIds[call.peer]) {
                delete peer.closeNotifiyIgnoreIds[call.peer];
            } else {
                peer.notifyCloseBranch(call.peer);
            }
        }
    });
}

function getWebCamStream(elm, useTestPattern) {
    return navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
    });
}

function getTestPatternStream(displayTime) {
    return new Promise((resolve, reject) => {
        try {
            var cnv = document.createElement('canvas');
            cnv.width = 160;
            cnv.height = 120;
            cnv.style.position = 'absolute';
            cnv.style.top = '-10000px';
            document.body.appendChild(cnv);
            var ctx = cnv.getContext('2d');
            var rafId = null;
            var img = document.createElement('img');
            var testPattern = _ => {
                rafId = requestAnimationFrame(testPattern);
                ctx.clearRect(0, 0, 160, 120);
                ctx.drawImage(img, 0, 0);
                var now = new Date();
                var hms = [now.getHours(), now.getMinutes(), now.getSeconds()].map(x => ('0' + x).slice(-2)).join(':');
                ctx.textBaseline = 'middle';
                ctx.textAlign = 'center';
                ctx.font = '30px monospace';
                ctx.fillStyle = 'white';
                ctx.fillText(hms, cnv.width / 2, cnv.height / 2);
            };
            img.onload = _ => {
                testPattern(img);
                resolve(cnv.captureStream(10));
            }
            img.src = 'SMPTE_Color_Bars_160x120.png';
        } catch (ex) {
            reject(ex);
        }
    });
}

function noNotifyCloseBranch() {
    Object.keys(peer.branchConnections).forEach(branchId => {
        if (peer.branchConnections[branchId]) {
            peer.closeNotifiyIgnoreIds[branchId] = true;
            peer.branchConnections[branchId].close();
        }
    });
}

function addLogMsg(str, type) {
    if (!logContainer) return;
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

function updateTree() {
    if (!treeContainer) return;
    treeContainer.innerHTML = '';
    if (peer.levelBranches.length > 0) {
        drawTree();
    }
}

function drawTree() {
    if (!treeContainer) return;
    var func = (level, id, pElm) => {
        var ul = document.createElement('ul');
        var li = document.createElement('li');
        var div = document.createElement('div');
        div.textContent = id;
        li.appendChild(div);
        if (peer.levelBranches[level][id].children.length) {
            var cul = document.createElement('ul');
            peer.levelBranches[level][id].children.forEach(childId => {
                if (level < peer.levelBranches.length - 1) {
                    func(level + 1, childId, li);
                }
            });
        }
        ul.appendChild(li);
        pElm.appendChild(ul);
    };
    func(0, Object.keys(peer.levelBranches[0])[0], treeContainer);
}

