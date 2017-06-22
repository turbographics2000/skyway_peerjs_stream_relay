# skyway_peerjs_stream_relay


## 注意点
* このrelayライブラリは、peer.js自体に手を入れることはせず、ライブラリ外から拡張するという方法をとっている
* ニコ生で補助的に動画配信を行うことを目的に実装。
なので、放送主(ルート)のIDがWebRTC側でのメッセージのやり取り無しで取得できるのが前提。

## インストール
peer.js必須。peer.jsとpeerjsextend.jsをロードする。
```html
<script src="peer.min.js"></script>
<script src="peerjsextend.js"></script>
```

放送主(ルート)のIDが取得できるようになった後に、以下のようにPeerインスタンスを生成し、'open'イベントで、以下のようにpeerInstanceExtend()を呼ぶ。
peerInstanceExtend()の引数で放送主(ルート)のユーザーIDと、分配数を設定する。
(ライブラリを拡張するという実装方法をとっているため)
```js
var peer = new Peer('root', { key: apiKey, debug: 3 });
peer.on('open', id => {
    peerInstanceExtend(peer, rootId, 5);
});
```


## ストリームのリレー
放送主の負荷を少しでも減らすため、放送主からいきなり分配するのではなく、まず放送主と1：1となる視聴者を配置し、その視聴者から分配を開始する。
例としてpeerInstanceExtend()で設定した分配数が3だった場合
(配下にないところは省略している。実際は配下に3つずつ連なる)
![example](readme_imgs/tree_1.png)


## リレー途中の視聴者が視聴をやめた場合
リレー途中の視聴者が視聴をやめた場合、リレーの末端の視聴者を視聴をやめた視聴者の位置に配置し、再配信を行う。

### 例えば"視聴者 D"が視聴をやめた場合
1. "視聴者 D"が視聴をやめる
![example](readme_imgs/tree_2.png)
2. "視聴者 D"配下の視聴者への配信が止まってしまう。
![example](readme_imgs/tree_3.png)
3. リレー末端の"視聴者 Q"を"視聴者 D"の位置に配置する。
![example](readme_imgs/tree_4.png)
![example](readme_imgs/tree_5.png)
4. 再配信する
![example](readme_imgs/tree_6.png)


## 問題点
リレー途中の視聴者が視聴をやめた場合、その配下にいる視聴者の配信が再配信されるまで止まってしまう。(ほぼ一瞬であるため"ちらつく"という表現が適切か)

