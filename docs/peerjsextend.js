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

    Peer.prototype.requestBranch = function (branchSrcId) {
        console.log('requestBranch:' + branchSrcId, 'send_notify');
        this.sendNotify({
            extType: 'request_branch',
            fromId: this.id
        }, branchSrcId);
    };

    Peer.prototype.responseBranchData = function (branchData, dstId) {
        console.log('notifyBranchData:' + dstId, 'send_notify');
        this.sendNotify(Object.assign({ extType: 'branch_data' }, branchData), dstId);
    };

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
            if (branches[branchId].children.length < maxBranchCnt) {
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
function peerInstanceExtend(peer, isRoot, maxBranchCnt) {
    peer.isRoot = isRoot;
    peer.rootId = null;
    peer.maxBranchCnt = maxBranchCnt;
    peer.branchData = null;
    peer.levelBranches = [];
    peer.dicBranches = {};
    peer.branchSrcConnection = null;
    peer.branchConnections = {};
    peer.closeNotifiyIgnoreIds = {};
    peer.stream = null;

    // 拡張メッセージハンドラーを設定
    peer.socket.on('message', function (message) {
        var type = message.type;
        switch (type) {
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
        addLogMsg('branch_data', 'event');
        console.log('branch_data', data);
        peer.branchData = data;
        if (peer.branchSrcConnection) {
            peer.branchSrcConnection.close();
            peer.branchSrcConnection = null;
        }
        peer.requestBranch(peer.branchData.branchSrcId);
    });

    // ブランチからストリームの送信をリクエストしたときにブランチ元(ブランチソース)側で発生するイベント
    peer.on('request_branch', req => {
        addLogMsg('request_branch from:' + req.fromId, 'event');
        var call = peer.call(req.fromId, stream);
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
    if (isRoot) {
        peer.rootId = id;
    }
    if (id === peer.rootId) {
        webCamSetup(selfView).then(stream => peer.stream = stream);
    } else {
        // DataChannelで接続テストを行い接続出来たら、ストリームの接続を行う
        var dc = peer.connect('root');
        dc.on('open', function () {
            console.log('dc open');
            dc.close();
            peer.notifyJoin();
        });
    }
}

function callSetup(call) {
    call.on('stream', stream => {
        console.log('call on "stream"');
        remoteView.srcObject = peer.stream = stream;
        peer.branchSrcConnection = call;
        if (peer.branchData) {
            peer.branchData.children.forEach(branchId => {
                peer.branchConnections[branchId] = peer.call(branchId, peer.stream);
            });
            peer.branchData = null;
        }
    });
    call.on('close', _ => {
        console.log('call on "close"');
        if (peer.isRoot) {
            var migrateData = peer.migrateBranch.call(peer, call.peer);
            updateTree();
            if (migrateData) {
                peer.responseBranchData(migrateData, migrateData.id);
            }
        } else if (peer.branchSrcConnection.peer === call.peer) {
            peer.branchSrcConnection = null;
        } else if (peer.branchConnections[call.peer]) {
            delete peer.branchConnections[call.peer];
            peer.notifyCloseBranch(call.peer);
        }
    });
}

function addLogMsg(str, type) {
    if(!logContainer) return;
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
