/* ===== Basit, Safari/Chrome uyumlu oyun iskeleti ===== */

// Firebase config — seninkiler
const firebaseConfig = {
  apiKey: "AIzaSyAVGICVQBgLtK7TAHs52jtTr_dXQYFcP0I",
  authDomain: "oyunu-82e8f.firebaseapp.com",
  databaseURL: "https://oyunu-82e8f-default-rtdb.firebaseio.com",
  projectId: "oyunu-82e8f",
  storageBucket: "oyunu-82e8f.firebasestorage.app",
  messagingSenderId: "655562203367",
  appId: "1:655562203367:web:0a932030f64610dd474242"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* --- Kısa yardımcılar --- */
function $(id){ return document.getElementById(id); }
function show(el, v){ el.style.display = v ? "" : "none"; }
function banner(msg, ms=1600){ const b=$('banner'); b.textContent=msg; show(b,true); setTimeout(()=>show(b,false), ms); }

/* --- DOM --- */
const menu = $('menu'), game = $('game');
const nameInput = $('nameInput'), createBtn = $('createBtn'), joinBtn = $('joinBtn');
const roomTitle = $('roomTitle'), playersEl = $('players');
const secretBox = $('secretBox'), secretGrid = $('secretGrid'), readyBtn = $('readyBtn');
const gridEl = $('grid'), startBtn = $('startBtn'), leaveBtn = $('leaveBtn');

/* --- Local durum --- */
const playerId = "p_" + Math.random().toString(36).slice(2,10);
let playerName = null;
let roomId = null;
let isOwner = false;
let mySecret = null;
let myAlive = true;
let myTurn = false;
const cards = new Map();     // ana grid numara -> button
const sCards = new Map();    // secret grid numara -> button

/* === LOBBY === */

/** Sıradaki oda adını üret (oda-1, oda-2, ...) ve current oda yap */
async function createRoomId(){
  const nextRef = db.ref("lobby/next");
  let next = (await nextRef.get()).val();
  if(!next) next = 1;
  roomId = "oda-" + next;
  await db.ref("lobby").update({ current: roomId, next: next + 1 });
}

/** Var olan current odayı getir */
async function getCurrentRoomId(){
  roomId = (await db.ref("lobby/current").get()).val();
  return roomId;
}

/** Odaya oyuncu olarak yaz ve dinlemeleri başlat */
async function joinRoomCommon(){
  // oyuncu yaz
  const pRef = db.ref(`rooms/${roomId}/players/${playerId}`);
  const info = { name: playerName, ready: false, alive: true, joinedAt: firebase.database.ServerValue.TIMESTAMP };
  await pRef.set(info);
  pRef.onDisconnect().remove();

  // owner mı?
  const ownerId = (await db.ref(`rooms/${roomId}/ownerId`).get()).val();
  isOwner = (ownerId === playerId);

  // UI
  roomTitle.textContent = "Oda: " + roomId;
  show(menu,false); show(game,true);
  show(secretBox,true); show(gridEl,false);
  readyBtn.disabled = true; mySecret = null;

  // Secret grid kur
  secretGrid.innerHTML=''; sCards.clear();
  for(let i=1;i<=31;i++){
    const b=document.createElement('button');
    b.className='card';
    b.textContent=i;
    b.onclick=()=>{
      mySecret=i; readyBtn.disabled=false;
      sCards.forEach(btn=>btn.style.outline='none'); b.style.outline='3px solid #e74c3c';
    };
    secretGrid.appendChild(b); sCards.set(i,b);
  }

  // Ana grid (sadece bir kez kurarız)
  if(cards.size===0){
    for(let i=1;i<=31;i++){
      const btn=document.createElement('button');
      btn.className='card disabled';
      btn.innerHTML = String(i) + '<span class="badge">Gizlin</span>';
      btn.dataset.num=i;
      btn.onclick=()=>onPick(Number(i));
      gridEl.appendChild(btn);
      cards.set(i,btn);
    }
  }

  // Dinlemeler
  subscribePlayers();
  subscribeNumbers();
  subscribeState();

  // Owner butonu görünürlüğü ilk duruma
  show(startBtn, false);
}

/* --- Butonlar --- */
createBtn.onclick = async ()=>{
  playerName = (nameInput.value||"").trim();
  if(!playerName){ banner("Adını yaz"); return; }

  await createRoomId();
  // oda düğümleri
  await db.ref(`rooms/${roomId}`).set({
    ownerId: playerId,
    state: { started: false, finished: false },
  });
  isOwner = true;
  await joinRoomCommon();
  banner("Oda açıldı");
};

joinBtn.onclick = async ()=>{
  playerName = (nameInput.value||"").trim();
  if(!playerName){ banner("Adını yaz"); return; }
  const r = await getCurrentRoomId();
  if(!r){ banner("Önce biri Oda Açsın"); return; }

  // Başlamış odaya yeni giriş olmasın
  const st = (await db.ref(`rooms/${r}/state`).get()).val()||{};
  if(st.started){ banner("Oyun başladı, yeni katılım kapalı"); return; }

  await joinRoomCommon();
  banner("Odaya katıldın");
};

leaveBtn.onclick = async ()=>{
  if(roomId){
    await db.ref(`rooms/${roomId}/players/${playerId}`).remove();
  }
  location.replace(location.pathname);
};

/* --- Hazırım (gizli sayı seçildikten sonra) --- */
readyBtn.onclick = async ()=>{
  if(mySecret==null){ banner("Önce gizli sayını seç"); return; }
  await db.ref(`rooms/${roomId}/secrets/${playerId}`).set(mySecret);
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(true);
  // gizli seçim ekranı sadece sende kapanır
  show(secretBox,false);
  banner("Hazır!");
  // kendi gizli kartını ana gridde işaretle (oyun başlayınca görünecek)
  const meCard = cards.get(mySecret);
  if(meCard){ meCard.classList.add('me'); }
};

/* --- Owner oyunu başlatır --- */
startBtn.onclick = async ()=>{
  // herkes hazır mı?
  const pS = await db.ref(`rooms/${roomId}/players`).get();
  const sS = await db.ref(`rooms/${roomId}/secrets`).get();
  const players = pS.val()||{}, secrets=sS.val()||{};
  const ids = Object.keys(players);
  if(ids.length<2){ banner("En az 2 kişi lazım"); return; }
  const allReady = ids.every(id=>players[id].ready===true);
  const allSecret = ids.every(id=>secrets[id]!=null);
  if(!allReady || !allSecret){ banner("Herkes hazır değil"); return; }

  // sıra: joinedAt'a göre
  const order = Object.entries(players)
    .sort((a,b)=>(a[1].joinedAt||0) - (b[1].joinedAt||0))
    .map(([pid])=>pid);

  const first = order[0], firstName = players[first]?.name||"";
  await db.ref(`rooms/${roomId}/numbers`).set(null); // sıfırla
  await db.ref(`rooms/${roomId}/state`).set({
    started: true, finished: false,
    turn: { order, idx: 0, currentPid: first, currentName: firstName }
  });

  banner("Oyun başladı!");
};

/* === DİNLEMELER === */
function subscribePlayers(){
  db.ref(`rooms/${roomId}/players`).on('value', snap=>{
    playersEl.innerHTML=''; const data=snap.val()||{};
    const list = Object.entries(data).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    list.forEach(([pid,info],i)=>{
      const div=document.createElement('div');
      div.className='chip'+(pid===playerId?' me':'')+(info.alive===false?' dead':'');
      const dot=document.createElement('span'); dot.className='dot ' + (info.ready?'ready':'');
      div.appendChild(dot);
      const t=document.createElement('span'); t.textContent=(i+1)+' • '+(info.name||'Oyuncu');
      div.appendChild(t);
      playersEl.appendChild(div);
      if(pid===playerId){ myAlive = (info.alive!==false); }
    });

    // Owner ise ve oyun başlamadı ise başlat butonunu göster
    db.ref(`rooms/${roomId}/state`).get().then(s=>{
      const st=s.val()||{}; show(startBtn, isOwner && !st.started && !st.finished);
    });
  });
}

function subscribeNumbers(){
  db.ref(`rooms/${roomId}/numbers`).on('value', snap=>{
    const data = snap.val()||{};
    // tüm kartları sıfırla
    cards.forEach((btn, n)=>{
      btn.classList.remove('taken','disabled');
      btn.disabled = true; // oyun başlamamış olabilir, state listener açacak
      // kendi gizli sayına etiket göster (oyun sırasında kendi sayını seçmeni engelle)
      const badge = btn.querySelector('.badge');
      if(Number(n)===Number(mySecret)) { btn.classList.add('me'); if(badge) badge.style.display='block'; }
      else if(badge) badge.style.display='none';
    });
    // alınmış olanları kırmızı yap
    Object.keys(data).forEach(k=>{
      const n = Number(k); const btn = cards.get(n);
      if(btn){ btn.classList.add('taken'); btn.disabled = true; }
    });
  });
}

function subscribeState(){
  db.ref(`rooms/${roomId}/state`).on('value', snap=>{
    const st = snap.val()||{};
    if(st.finished){
      banner("Oyun bitti!");
      // herkesi odadan at
      setTimeout(async ()=>{
        await db.ref(`rooms/${roomId}/players/${playerId}`).remove();
        location.replace(location.pathname);
      }, 1200);
      return;
    }

    const started = !!st.started;
    show(gridEl, started); // grid sadece oyunda görünür
    show(startBtn, isOwner && !started);

    if(!started){
      // gizli sayı ekranı sadece hazır olmayan oyuncuda açık kalsın
      db.ref(`rooms/${roomId}/players/${playerId}/ready`).get().then(s=>{
        const r=!!s.val(); show(secretBox, !r);
      });
      // tüm kartlar pasif
      cards.forEach(btn=>{ btn.classList.add('disabled'); btn.disabled=true; });
      return;
    }

    // Oyun başladı: sıra kontrolü
    const turn = st.turn || {};
    myTurn = (turn.currentPid === playerId) && myAlive;
    // tıklanabilirlik
    cards.forEach((btn,n)=>{
      const isTaken = btn.classList.contains('taken');
      const isMySecret = (Number(n)===Number(mySecret));
      const can = myTurn && !isTaken && !isMySecret;
      btn.disabled = !can;
      btn.classList.toggle('disabled', !can);
    });
    roomTitle.textContent = "Oda: " + roomId + (myTurn ? " • Sıra Sende" : " • Sırada: " + (turn.currentName||"-"));
  });
}

/* === OYUN LOJİĞİ === */
async function onPick(n){
  // güvenlik: sıra sende mi?
  const st = (await db.ref(`rooms/${roomId}/state`).get()).val()||{};
  const turn = st.turn||{};
  if(turn.currentPid !== playerId) return;

  // atomik: sayı ekle, elenenleri işaretle, sırayı devret / bitir
  const roomRef = db.ref(`rooms/${roomId}`);
  let committed = false;
  await roomRef.transaction(room=>{
    if(!room || !room.state || !room.state.started || room.state.finished) return room;
    const state = room.state; const turn = state.turn||{};
    if(turn.currentPid !== playerId) return room;

    // sayı daha alınmış mı?
    if(!room.numbers) room.numbers = {};
    if(room.numbers[n]) return room;

    // sayıyı yaz
    if(!room.players) room.players = {};
    const pickerName = room.players[playerId]?.name || '';
    room.numbers[n] = { pickerId: playerId, pickerName: pickerName, at: {".sv":"timestamp"} };

    // gizli sayılara bakan ve elenenleri pasifleştiren blok
    const secrets = room.secrets || {};
    Object.keys(secrets).forEach(pid=>{
      if(Number(secrets[pid])===Number(n) && room.players[pid] && room.players[pid].alive!==false){
        room.players[pid].alive = false; // izleme moduna döner
      }
    });

    // yaşayanlar
    const order = (turn.order||[]).filter(pid => room.players[pid]);
    const aliveOrder = order.filter(pid => room.players[pid].alive!==false);

    // bitiş: tek kişi kaldıysa
    if(aliveOrder.length<=1){
      state.finished = true;
      state.started = false;
      return room;
    }

    // sıradaki canlı oyuncuya geçir
    const currAliveIdx = aliveOrder.indexOf(turn.currentPid);
    const nextPid = aliveOrder[(currAliveIdx+1) % aliveOrder.length];
    state.turn = {
      order: order,
      idx: order.indexOf(nextPid),
      currentPid: nextPid,
      currentName: room.players[nextPid]?.name || ''
    };
    return room;
  }, (e, ok)=>{ committed = ok; });

  if(committed){
    // seçilen sayı herkesde kırmızı oldu; sıradaki oyuncuya geçti
    // kendi gizli sayısı denk geldiyse client tarafında sadece banner gösteririz
    const sec = (await db.ref(`rooms/${roomId}/secrets`).get()).val()||{};
    for(const pid in sec){
      if(Number(sec[pid])===Number(n)){
        const p = (await db.ref(`rooms/${roomId}/players/${pid}`).get()).val()||{};
        if(p && pid!==playerId){
          banner(`${p.name}: hadi götünü kurtardın!`, 1400);
        }
      }
    }
  }
}
