/* game.js — BAL YEM 31 (GitHub Pages + Firebase Realtime DB) */
/* v10 */

"use strict";

/* ==== Firebase config (seninki) ==== */
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

/* ==== Server time ==== */
let serverOffset = 0;
db.ref(".info/serverTimeOffset").on("value", s => { serverOffset = s.val() || 0; });
const serverNow = () => Date.now() + serverOffset;

/* ==== Room & DOM ==== */
const params = new URLSearchParams(location.search);
const roomId = params.get("room") || "oda-whatsapp";

const $ = id => document.getElementById(id);
const splash = $("splash");
const login  = $("login");
const game   = $("game");
const nameInput = $("nameInput");
const joinBtn   = $("joinBtn");
const roomTitle = $("roomTitle");
const stateTag  = $("stateTag");
const turnTag   = $("turnTag");
const aliveTag  = $("aliveTag");
const countdownBubble = $("countdownBubble");
const playersEl = $("players");
const gridEl    = $("grid");
const readyBtn  = $("readyBtn");
const unreadyBtn= $("unreadyBtn");
const cheatBtn  = $("cheatBtn");
const cheatBox  = $("cheatBox");
const endBanner = $("endBanner");
const flashBox  = $("flash");
const leaveBtn  = $("leaveBtn");
const secretModal = $("secretModal");
const secretGrid  = $("secretGrid");
const saveSecretBtn = $("saveSecretBtn");

/* ==== State ==== */
const saved = sessionStorage.getItem("pid");
const playerId = saved || ("p_" + Math.random().toString(36).slice(2,10));
sessionStorage.setItem("pid", playerId);

let playerName = null, started=false, myTurn=false, myAlive=true, mySecret=null, elimCount=0;
const BASE_SEC = 10, EXTRA_PER_ELIM = 5;
let availableNums = [];
let currentDeadlineAt = 0;

/* ==== Splash → login ==== */
window.addEventListener("DOMContentLoaded", ()=>{
  setTimeout(()=>{ splash.style.display="none"; login.style.display="block"; }, 5000);
});

/* ==== Grid 1–31 ==== */
const cards = new Map();
for (let i=1;i<=31;i++){
  const b=document.createElement("button");
  b.className="card disabled"; b.textContent=i; b.dataset.num=i; b.disabled=true;
  b.onclick=()=>onPickRequest(i);
  gridEl.appendChild(b); cards.set(i,b);
}

/* ==== Secret modal ==== */
let tempSecret=null;
for (let i=1;i<=31;i++){
  const btn=document.createElement("button"); btn.textContent=i;
  btn.onclick=()=>{
    tempSecret=i;
    [...secretGrid.children].forEach(b=>b.classList.remove("sel"));
    btn.classList.add("sel");
    saveSecretBtn.disabled=false;
  };
  secretGrid.appendChild(btn);
}
function openSecretModal(){ secretModal.style.display="flex"; }
function closeSecretModal(){ secretModal.style.display="none"; }
saveSecretBtn.onclick=async ()=>{
  if (!tempSecret) return;
  mySecret=tempSecret;
  await db.ref(`rooms/${roomId}/secrets/${playerId}`).set(mySecret);
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  closeSecretModal();
  alert("Gizli sayı kaydedildi. Hazır'a basabilirsin.");
};

/* ==== Join ==== */
joinBtn.onclick=async ()=>{
  playerName=(nameInput.value||"").trim();
  if(!playerName){ alert("Adını yaz!"); return; }

  const pSnap=await db.ref(`rooms/${roomId}/players`).get();
  const pCount=Object.keys(pSnap.val()||{}).length;
  if (pCount>=10){ alert("Oda dolu (10/10)."); return; }

  const pRef=db.ref(`rooms/${roomId}/players/${playerId}`);
  await pRef.set({name:playerName,ready:false,alive:true,joinedAt:firebase.database.ServerValue.TIMESTAMP});
  pRef.onDisconnect().remove(); // sekme kapanırsa oyuncuyu odadan at

  login.style.display='none'; game.style.display='block'; roomTitle.textContent="Oda: "+roomId;

  subscribePlayers(); subscribeNumbers(); subscribeRoomState();
  openSecretModal();
};

leaveBtn.onclick=async ()=>{
  await db.ref(`rooms/${roomId}/players/${playerId}`).remove();
  location.href = location.pathname;
};

/* ==== Players ==== */
function subscribePlayers(){
  db.ref(`rooms/${roomId}/players`).on('value', snap=>{
    playersEl.innerHTML='';
    const data=snap.val()||{};
    const list=Object.entries(data).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    let aliveCount=0;
    list.forEach(([pid,info],idx)=>{
      const chip=document.createElement('div');
      chip.className='chip'+(pid===playerId?' me':'')+(info.alive===false?' dead':'');
      const ord=document.createElement('span'); ord.className='order'; ord.textContent=idx+1;
      const dot=document.createElement('span'); dot.className='dot '+(info.ready?'ready':'wait');
      const txt=document.createElement('span'); txt.textContent=info.name||'Oyuncu';
      chip.append(ord,dot,txt);
      playersEl.appendChild(chip);
      if (info.alive!==false) aliveCount++;
      if (pid===playerId) myAlive=(info.alive!==false);
    });
    aliveTag.textContent='Canlı: '+aliveCount;
  });
}

/* ==== Numbers ==== */
function subscribeNumbers(){
  db.ref(`rooms/${roomId}/numbers`).on("value", snap=>{
    const data=snap.val()||{}; const taken=new Set(Object.keys(data).map(Number));
    availableNums=[];
    for (let i=1;i<=31;i++){
      const btn=cards.get(i); btn.className="card"; btn.disabled=true;
      if (!taken.has(i)) availableNums.push(i);
    }
    Object.entries(data).forEach(([n,info])=>{
      const num=Number(n); const btn=cards.get(num);
      if(btn){ btn.classList.add('taken'); btn.disabled=true; if (info.pickerId===playerId) btn.classList.add('me'); }
    });
  });
}

/* ==== Ready / Unready ==== */
readyBtn.onclick=async ()=>{
  if (mySecret==null){ openSecretModal(); alert('Önce gizli sayını seç.'); return; }
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(true);
  readyBtn.style.display='none'; unreadyBtn.style.display='inline-block';
  startGameIfReadyTxn();
};
unreadyBtn.onclick=async ()=>{
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  readyBtn.style.display='inline-block'; unreadyBtn.style.display='none';
};

/* ==== Cheat (200) ==== */
cheatBtn.onclick=async ()=>{
  const pass=prompt("Şifreyi gir:");
  if (pass==="200"){
    const [pS,sS]=await Promise.all([
      db.ref(`rooms/${roomId}/players`).get(),
      db.ref(`rooms/${roomId}/secrets`).get()
    ]);
    const players=pS.val()||{}, secrets=sS.val()||{};
    cheatBox.innerHTML="<b>Gizli Sayılar:</b><br>";
    Object.entries(players).forEach(([pid,info])=>{
      const num=secrets[pid]; if(num!=null) cheatBox.innerHTML+=`${info.name}: ${num}<br>`;
    });
    cheatBox.style.display="block";
  } else alert("Yanlış şifre!");
};

/* ==== Flash ==== */
function showFlash(msg){
  flashBox.textContent=msg; flashBox.classList.add('show');
  setTimeout(()=>flashBox.classList.remove('show'), 1500);
}

/* ==== Room state ==== */
function subscribeRoomState(){
  db.ref(`rooms/${roomId}/state`).on('value', snap=>{
    const st=snap.val()||{started:false,finished:false};
    started=!!st.started; elimCount=st.elimCount||0;
    cheatBtn.style.display=started?'none':'inline-block';

    if (st.flash && st.flash.at){ showFlash(st.flash.msg||''); }

    // Finished
    if (st.finished){
      const name=st.loserName||'—';
      endBanner.textContent=`Kesene bereket cenabet, ${name}!`;
      endBanner.classList.add('show');
      stateTag.textContent='Bitti';
      turnTag.style.display='inline-block';
      turnTag.textContent=`Kesene bereket cenabet, ${name}!`;
      for (let i=1;i<=31;i++){ const btn=cards.get(i); btn.disabled=true; btn.classList.add('disabled'); }
      countdownBubble.style.display='none';
      setTimeout(()=>{ endBanner.classList.remove('show'); prepareNextRound(); }, 3000);
      return;
    }

    // Not started
    if (!started){
      stateTag.textContent='Bekleme';
      turnTag.style.display='none';
      for (let i=1;i<=31;i++){ const btn=cards.get(i); btn.disabled=true; btn.classList.add('disabled'); }
      countdownBubble.style.display='none';
      return;
    }

    // Started
    stateTag.textContent='Başladı';
    stateTag.classList.add('started');
    const order=st.turn?.order||[], idx=st.turn?.idx||0, currentId=order[idx], currentName=st.turn?.currentName||'—';
    myTurn=(currentId===playerId);
    turnTag.style.display='inline-block';
    turnTag.textContent=myTurn?'Sıra Sende':`Sıradaki: ${currentName}`;
    turnTag.classList.toggle('you',myTurn);
    turnTag.classList.toggle('turn',!myTurn);

    for (let i=1;i<=31;i++){
      const btn=cards.get(i); const taken=btn.classList.contains('taken');
      btn.disabled=!myTurn||taken; btn.classList.toggle('disabled',btn.disabled);
    }

    const dl=Number(st.turn?.deadlineAt||0); currentDeadlineAt=dl;
    if (dl){
      const remain=Math.max(0, dl - serverNow()); const sec=Math.ceil(remain/1000);
      countdownBubble.style.display='inline-block'; countdownBubble.textContent=String(sec);
      if (remain<=0 && myTurn) autoPickRandom();
    } else countdownBubble.style.display='none';
  });
}

// smooth countdown
setInterval(()=>{
  if (!started || !currentDeadlineAt) return;
  const remain=currentDeadlineAt - serverNow();
  const sec=Math.ceil(Math.max(0,remain)/1000);
  countdownBubble.style.display='inline-block'; countdownBubble.textContent=String(sec);
  if (remain<=0 && myTurn) autoPickRandom();
}, 300);

/* ==== AUTO START: herkes hazır + herkesin secret'ı var → anında ==== */
async function startGameIfReadyTxn(){
  const roomRef = db.ref(`rooms/${roomId}`);
  let committed = false;
  await roomRef.transaction(room => {
    if (!room) return room;
    const st = room.state || {};
    if (st.started || st.finished) return room;

    const players = room.players || {};
    const secrets = room.secrets || {};
    const ids = Object.keys(players);
    if (ids.length < 2) return room;

    const allReady  = ids.every(id => players[id].ready === true);
    const allSecret = ids.every(id => secrets[id] != null);
    if (!(allReady && allSecret)) return room;

    const ordered = ids
      .filter(id => players[id] && players[id].alive !== false)
      .sort((a,b)=>(players[a].joinedAt||0)-(players[b].joinedAt||0));
    if (ordered.length < 2) return room;

    const firstId = ordered[0];
    room.state = {
      started: true,
      finished: false,
      elimCount: 0,
      turn: { order: ordered, idx: 0, currentName: players[firstId]?.name || '' }
    };
    room.state.flash = { msg: 'Oyun başladı!', at: {".sv":"timestamp"} };
    return room;
  }, (e, ok) => { committed = ok; });

  if (committed) {
    const s = (await db.ref(`rooms/${roomId}/state`).get()).val() || {};
    if (s.started && !s.finished && s.turn && !s.turn.deadlineAt) {
      const deadline = serverNow() + (BASE_SEC + (s.elimCount||0)*EXTRA_PER_ELIM) * 1000;
      await db.ref(`rooms/${roomId}/state/turn/deadlineAt`).set(deadline);
    }
  }
}

// auto start triggers
db.ref(`rooms/${roomId}/players`).on('value', () => startGameIfReadyTxn());
db.ref(`rooms/${roomId}/secrets`).on('value', () => startGameIfReadyTxn());

/* ==== PICK & ELIM ==== */
async function onPickRequest(n){
  if (!started) return;
  const roomRef=db.ref(`rooms/${roomId}`);
  let committed=false;
  await roomRef.transaction(room=>{
    if(!room||!room.state||!room.state.started||room.state.finished) return room;
    const turn=room.state.turn||{}; const order=turn.order||[]; const idx=turn.idx||0; const currentPid=order[idx];
    if(currentPid!==playerId) return room;

    if(!room.numbers) room.numbers={}; if(room.numbers[n]) return room;
    if(!room.players) room.players={}; const pickerName=room.players[playerId]?.name||'';
    room.numbers[n]={pickerId:playerId,pickerName,at:{".sv":"timestamp"}};

    const secrets=room.secrets||{};
    const victims=Object.keys(secrets).filter(pid=>Number(secrets[pid])===Number(n) && room.players[pid] && room.players[pid].alive!==false);
    victims.forEach(pid=>{ room.players[pid].alive=false; });

    if (victims.length>0){
      room.state.flash = { msg: `${pickerName} – hadi g*tü kurtardın!`, at:{".sv":"timestamp"} };
    } else {
      room.state.flash = { msg: `${pickerName} seçti: ${n}`, at:{".sv":"timestamp"} };
    }

    room.state.elimCount=(room.state.elimCount||0)+victims.length;

    const fullOrder=order.filter(pid=>room.players[pid]);
    const aliveOrder=fullOrder.filter(pid=>room.players[pid].alive!==false);

    if (aliveOrder.length===1){
      const loserId=aliveOrder[0];
      room.state.started=false; room.state.finished=true;
      room.state.finishedAt={".sv":"timestamp"};
      room.state.loserId=loserId; room.state.loserName=room.players[loserId]?.name||'';
      return room;
    }

    const currIdxAlive=aliveOrder.indexOf(currentPid);
    const nextPid=aliveOrder[(currIdxAlive+1)%aliveOrder.length];
    const newIdx=fullOrder.indexOf(nextPid);
    room.state.turn.idx=(newIdx>=0?newIdx:0);
    room.state.turn.currentName=room.players[nextPid]?.name||'';
    room.state.turn.deadlineAt={".sv":"timestamp"};
    return room;
  }, (e,ok)=>{committed=ok;});

  if (committed){
    const s2=(await db.ref(`rooms/${roomId}/state`).get()).val()||{};
    if (!s2.finished && s2.started){
      const deadline = serverNow() + (BASE_SEC + (s2.elimCount||0)*EXTRA_PER_ELIM)*1000;
      await db.ref(`rooms/${roomId}/state/turn/deadlineAt`).set(deadline);
    }
  }
}

/* ==== Auto-pick if time runs out ==== */
function autoPickRandom(){
  if (!myTurn || !started) return;
  const free=availableNums.slice(); if(!free.length) return;
  const n=free[Math.floor(Math.random()*free.length)];
  onPickRequest(n);
}

/* ==== Next round reset ==== */
async function prepareNextRound(){
  const stateRef=db.ref(`rooms/${roomId}/state`); let committed=false;
  await stateRef.transaction(st=>{
    if(!st||!st.finished||st.nextRoundPrepared) return st;
    st.nextRoundPrepared=true; return st;
  },(e,ok)=>{committed=ok;});
  if(!committed) return;

  const updates={};
  updates[`rooms/${roomId}/numbers`]=null;
  updates[`rooms/${roomId}/secrets`]=null;
  updates[`rooms/${roomId}/state/started`]=false;
  updates[`rooms/${roomId}/state/finished`]=false;
  updates[`rooms/${roomId}/state/turn`]=null;
  updates[`rooms/${roomId}/state/finishedAt`]=null;
  updates[`rooms/${roomId}/state/loserId`]=null;
  updates[`rooms/${roomId}/state/loserName`]=null;
  updates[`rooms/${roomId}/state/flash`]=null;

  const pSnap=await db.ref(`rooms/${roomId}/players`).get();
  const players=pSnap.val()||{};
  Object.keys(players).forEach(pid=>{
    updates[`rooms/${roomId}/players/${pid}/alive`]=true;
    updates[`rooms/${roomId}/players/${pid}/ready`]=false;
  });

  await db.ref().update(updates);
  // Yeni turda kullanıcılar tekrar gizli sayı seçecek
}
