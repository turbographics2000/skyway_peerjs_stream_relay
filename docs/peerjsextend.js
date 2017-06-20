function PeerClassExtend() {
    Peer.prototype.notifyJoin = function () {
        console.log('notifyJoin', 'send_notify');
        this.sendNotify({
            orgType: 'join',
            joinId: this.id
        }, this.rootId);
    };

    Peer.prototype.notifyCloseBranch = function (closeId) {
        console.log('notifyCloseBranch', 'send_notify');
        this.sendNotify({
            orgType: 'close_branch',
            closeBranch: closeId
        }, this.rootId);
    };

    Peer.prototype.requestBranch = function (branchSrcId) {
        console.log('requestBranch', 'send_notify');
        this.sendNotify({
            orgType: 'request_branch',
            fromId: this.id
        }, branchSrcId);
    };

    Peer.prototype.responseBranchData = function (branchData, dstId) {
        console.log('notifyBranchData', 'send_notify');
        this.sendNotify(Object.assign({ orgType: 'branch_data' }, branchData), dstId);
    };

    Peer.prototype.sendNotify = function (notifyMsg, dstId) {
        addLogMsg(notifyMsg.orgType, 'send_notify');
        var msg = {
            type: 'CANDIDATE',
            payload: {
                candidate: null,
                type: 'media'
            },
            dst: dstId,
            notifyMsg
        }
        this.socket.send(msg);
    };

    Peer.prototype.initBranch = function (remoteId) {
        var branchData = this.createBranchData(remoteId, { id: 'root' }, 0);
        this.levelBranches[0] = branchData;
        this.dicBranches = {
            [remoteId]: branchData
        };
        return branchData;
    };

    Peer.prototype.createBranchData = function (id, branchSrc, level) {
        return {
            rootId: this.rootId,
            id,
            branchSrc,
            level,
            children: {}
        }
    };

    Peer.prototype.addBranch = function (remoteId, level = 0) {
        let branches = this.levelBranches[level];
        var branchIds = Object.keys(branches);
        for (var i = 0, il = branchIds.length; i < il; i++) {
            var branchId = branchIds[i];
            if (Object.keys(branches[branchId].children).length < maxBranchCnt) {
                this.createBranchData(remoteId, branches[branchId], level + 1);
                this.dicBranches[remoteId] = branches[branchId].children[remoteId] = branchData;
                this.levelBranches[level + 1] = this.levelBranches[level + 1] || {};
                this.levelBranches[level + 1][remoteId] = branchData;
                return branchData;
            }
        }
        this.addBranch(remoteId, level + 1);
    };

    Peer.prototype.migrateBranch = function (closeId) {
        dstData = peer.dicBranches[closeId];
        delete peer.dicBranches[closeId];
        var dstLevel = dstData.level;

        var lastLevel = peer.levelBranches.length - 1;
        var oldData = peer.levelBranches[lastLevel].shift();
        if (Object.keys(peer.levelBranches[lastLevel]).length === 0) {
            peer.levelBranches[lastLevel].pop();
        }

        delete dstData.branchSRC.children[dstData.id];
        dstData.branchSRC.children[oldData.id] = dstData;

        delete peer.levelBranches[dstData.level][dstData.id];
        peer.levelBranches[dstData.level][oldData.id] = dstData;

        delete peer.dicBranches[dstData.id];
        peer.dicBranches[oldData.id] = dstData;

        dstData.id = oldData.id;

        peer.closeNotifiyIgnoreIds[dstData.id] = true;

        return dstData;
    };
}

function peerInstanceExtend(peer) {
    peer.rootId = null;
    peer.levelBranches = {};
    peer.dicBranches = {};
    peer.branchData = null;
    peer.branchSrcConnection = null;
    peer.branchConnections = {};
    peer.closeNotifiyIgnoreIds = {};

    peer.socket.on('message', function (message) {

        var type = message.type;
        switch (type) {
            case 'CANDIDATE':
                if (message.notifyMsg) {
                    addLogMsg(message.notifyMsg.orgType, 'receive_notify');
                    console.log('receive_notify', message.notifyMsg);
                    peer.emit(message.notifyMsg.orgType, message.notifyMsg);
                }
                break;
        }
    });
}