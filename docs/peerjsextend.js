function PeerClassExtend() {
    Peer.prototype.notifyJoin = function () {
        console.log('notifyJoin', 'send_notify');
        this.sendNotify({
            orgType: 'join',
            join: this.id
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
            requestBranch: this.id
        }, branchSrcId);
    };

    Peer.prototype.responseBranchData = function (branchData, dstId) {
        console.log('notifyBranchData', 'send_notify');
        this.sendNotify({
            orgType: 'branch_data',
            branchData
        }, dstId);
    };

    Peer.prototype.sendNotify = function (notifyMsg, dstId) {
        addLogMsg(notifyMsg.orgType, 'send_notify');
        var msg = {
            type: 'FUGA',
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

    Peer.prototype.createBranchData = function (rootId, id, branchSrc, level) {
        return {
            rootId,
            id,
            branchSrc,
            level,
            children: {}
        }
    };

    Peer.prototype.addBranch = function (remoteId, level) {
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
}

function peerInstanceExtend(peer) {
    peer.rootId = null;
    peer.levelBranches = {};
    peer.dicBranches = {};
    peer.branchData = null;
    peer.branchSrcConnection = null;
    peer.branchConnections = {};
    peer.closeNotifiyIgnoreIds = {};

    peer.socket.on('message', function(message) {

        var type = message.type;
        switch (type) {
            case 'FUGA':
                if (message.notifyMsg) {
                    addLogMsg(message.notifyMsg.orgType, 'receive_notify');
                    console.log('receive_notify', message.notifyMsg);
                    peer.emit(message.notifyMsg.orgType, message.notifyMsg);
                }
                break;
        }
    });
}