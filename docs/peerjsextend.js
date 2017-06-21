function PeerClassExtend() {
    Peer.prototype.notifyJoin = function () {
        console.log('notifyJoin:' + this.rootId, 'send_notify');
        this.sendNotify({
            orgType: 'join',
            joinId: this.id
        }, this.rootId);
    };

    Peer.prototype.notifyCloseBranch = function (closeId) {
        console.log('notifyCloseBranch:' + this.rootId, 'send_notify');
        this.sendNotify({
            orgType: 'close_branch',
            id: closeId
        }, this.rootId);
    };

    Peer.prototype.requestBranch = function (branchSrcId) {
        console.log('requestBranch:' + branchSrcId, 'send_notify');
        this.sendNotify({
            orgType: 'request_branch',
            fromId: this.id
        }, branchSrcId);
    };

    Peer.prototype.responseBranchData = function (branchData, dstId) {
        console.log('notifyBranchData:' + dstId, 'send_notify');
        this.sendNotify(Object.assign({ orgType: 'branch_data' }, branchData), dstId);
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
            rootId: this.rootId,
            id,
            branchSrcId,
            level,
            children: []
        }
    };

    Peer.prototype.addBranch = function (remoteId, level = 0) {
        addLogMsg('addBranch:' + remoteId, 'add_branch');
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
                return branchData;
            }
        }
        this.addBranch(remoteId, level + 1);
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

            closeData.id = migrateData.id;
            delete this.dicBranches[closeId];
            this.dicBranches[migrateData.id] = closeData;

            peer.closeNotifiyIgnoreIds[migrateData.id] = true;

            return closeData;
        }

        this.drawTree();
    };

    Peer.prototype.drawTree = function () {
        treeContainer.innerHTML = '';
        var func = (level, id, pElm) => {
            var ul = document.createElement('ul');
            this.levelBranches[level][id].children.forEach(childId => {
                var li = document.createElement('li');
                ul.appendChild(li);
                var div = document.createElement('div');
                div.textContent = childId;
                li.appendChild(div);
                if (level < this.levelBranches.length - 1) {
                    func(level + 1, id, li);
                }
            });
            pElm.appendChild(ul);
        };
        func(0, Object.keys(this.levelBranches[0])[0], treeContainer);
    }
}

function peerInstanceExtend(peer) {
    peer.rootId = null;
    peer.levelBranches = [];
    peer.dicBranches = {};
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