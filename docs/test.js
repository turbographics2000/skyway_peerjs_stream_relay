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
        peerInstanceExtend(peer, 'root', 2, true);
    });
}

function getStream(elm, useTestPattern) {
    if (useTestPattern) {
        return testPattern();
    } else {
        return navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false
        }).then(strm => {
            elm.srcObject = strm;
            return strm;
        }).catch(ex => console.log('getUserMedia error.', ex));
    }
}

function testPattern() {
    return new Promise((resolve, reject) => {
        var cnv = document.createElement('canvas');
        cnv.width = 160;
        cnv.height = 120;
        var ctx = cnv.getContext('2d');
        var rafId = null;
        var img = document.createElement('img');
        var testPattern = img => {
            rafId = requestAnimationFrame(testPattern);
            ctx.clearRect(0, 0, 160, 120);
            ctx.drawImage(img, 0, 0);
            var now = new Date();
            var hms = [now.getHours(), now.getMinutes(), now.getSeconds()].map(x => ('0' + x).slice(-2)).join(':');
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.font = 'monospace 10px';
            ctx.fillText(hms, cnv.width / 2, cnv.height / 2);
        };
        img.onload = _ => {
            testPattern(img);
            resolve(cnv.captureStream(10));
        }
        img.src = 'SMPTE_Color_Bars_160x120.png';
    });
}

