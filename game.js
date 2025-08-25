/* ====== Firebase init ====== */
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

/* ====== Helpers ====== */
const log = (msg) => {
  const box = document.getElementById('debugBox');
  box.style.display = 'block';
  box.innerHTML = (box.innerHTML ? box.innerHTML + "<br>" : "") + msg;
  console.log("[DEBUG]", msg);
};
let serverOffset = 0;
db.ref(".info/serverTimeOffset").on("value", s => serverOffset = s.val() || 0);
const now = () => Date.now() + serverOffset;

/* ====== DOM ====== */
const params = new URLSearchParams(location.search);
const roomId = params.get("room") || "oda-whatsapp";

const splash = document.getElementById('splash');
const login  = document.getElementById('login');
const game   = document.getElementById('game');
const nameInput = document.getElementById("nameInput");
const joinBtn   = document.getElementById("joinBtn");
const roomTitle = document.getElementById("roomTitle");
const stateTag  = document.getElementById("stateTag");
const turnTag   = document.getElementById("turnTag");
const aliveTag  = document.getElementById("aliveTag");
const countdownBubble = document.getElementById("countdownBubble");
const playersEl = document.getElementById("players");
const gridEl    = document.getElementById("grid");
const readyBtn  = document.getElementById("readyBtn");
const unreadyBtn= document.getElementById("unreadyBtn");
const cheatBtn  = document.getElementById("cheatBtn");
const cheatBox  = document.getElementById("cheatBox");
const endBanner = document.getElementById("endBanner");
const leaveBtn  = document.getElementById("leaveBtn");
const secretModal = document.getElementById("secretModal");
const secretGrid  = document.getElementById("secretGrid");
const saveSecretBtn = document.getElementById("saveSecretBtn");

/* ====== Local ====== */
const playerId = "p_" + Math.random().toString(36).slice(2,10);
let playerName = null, started=false, myTurn=false, myAlive=true, mySecret=null;
const BASE_SEC = 10, EXTRA_PER_ELIM = 5;
let availableNums = [];
let deadlineAt = 0;

/* ====== Splash → login ====== */
window.addEventListener("DOMContentLoaded", ()=> {
  setTimeout(()=>{ splash.style.display="none"; login.style.display="block"; }, 1500);
});

/* ====== Grid 1–31 ====== */
const cards = new Map();
for (let i=1;i<=31;i++){
  const b=document.createElement("button");
  b.className="card disabled"; b.textContent=i; b.dataset.num=i; b.disabled=true;
  b.onclick=()=>onPick(i);
  gridEl.appendChild(b); cards.set(i,b);
}
/* Secret chooser */
let tempSecret=null;
for (let i=1;i<=31;i++){
  const btn=document.createElement('button'); btn.textContent=i;
  btn.style.cssText="padding:10px;border:none;border-radius:10px;font-weight:800;background:#fff;color:#e74c3c;border:2px solid #e74c3c;cursor:pointer";
  btn.onclick=()=>{ tempSecret=i; [...secretGrid.children].forEach(b=>b.classList.remove('sel')); btn.classList.add('sel'); btn.style.borderColor='#27ae60'; btn.style.background='#27ae60'; btn.style.color='#111'; saveSecretBtn.disabled=false; };
  secretGrid.appendChild(btn);
}
function openSecret(){ secretModal.style.display='flex'; }
function closeSecret(){ secretModal.style.display='none'; }
saveSecretBtn.onclick=async ()=>{
  if (!tempSecret) return;
  mySecret=tempSecret;
  await db.ref(`rooms/${roomId}/secrets/${playerId}`).set(mySecret);
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  closeSecret();
  alert("Gizli sayı kaydedildi. Hazır'a basabilirsin.");
};

/* ====== Join / Leave ====== */
joinBtn.onclick=async ()=>{
  try{
    playerName=(nameInput.value||"").trim();
    if(!playerName){ alert("Adını yaz!"); return; }
    const pSnap=await db.ref(`rooms/${roomId}/players`).get();
    const pCount=Object.keys(pSnap.val()||{}).length;
    if (pCount>=10){ alert("Oda dolu (10/10)."); return; }

    const pRef=db.ref(`rooms/${roomId}/players/${playerId}`);
    await pRef.set({name:playerName,ready:false,alive:true,joinedAt:firebase.database.ServerValue.TIMESTAMP});
    pRef.onDisconnect().remove();
    db.ref(`rooms/${roomId}/presence/${playerId}`).set(true);
    db.ref(`rooms/${roomId}/presence/${playerId}`).onDisconnect().remove();

    login.style.display='none'; game.style.display='block'; roomTitle.textContent="Oda: "+roomId;

    subscribePlayers(); subscribeNumbers(); subscribeState();
    openSecret();
  }catch(e){ log("join error: "+e.message); alert("Bağlantı hatası");}
};
leaveBtn.onclick=async ()=>{ await db.ref(`rooms/${roomId}/players/${playerId}`).remove(); location.href=location.pathname; };

/* ====== Players ====== */
function subscribePlayers(){
  db.ref(`rooms/${roomId}/players`).on('value', snap=>{
    playersEl.innerHTML=''; const data=snap.val()||{};
    const list=Object.entries(data).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    let aliveCount=0;
    list.forEach(([pid,info],idx)=>{
      const chip=document.createElement('div');
      chip.className='chip'+(pid===playerId?' me':'')+(info.alive===false?' dead':'');
      const ord=document.createElement('span'); ord.className='order'; ord.textContent=idx+1;
      const dot=document.createElement('span'); dot.className='dot '+(info.ready?'ready':'wait');
      const txt=document.createElement('span'); txt.textContent=info.name||'Oyuncu';
      chip.appendChild(ord); chip.appendChild(dot); chip.appendChild(txt); playersEl.appendChild(chip);
      if (info.alive!==false) aliveCount++; if (pid===playerId) myAlive=(info.alive!==false);
    });
    aliveTag.textContent='Canlı: '+aliveCount;
  });
}

/* ====== Numbers ====== */
function subscribeNumbers(){
  db.ref(`rooms/${roomId}/numbers`).on("value", snap=>{
    const data=snap.val()||{}; const taken=new Set(Object.keys(data).map(Number));
    availableNums=[];
    for (let i=1;i<=31;i++){
      const btn=cards.get(i); btn.className="card"; btn.disabled=!myTurn || taken.has(i);
      if (!taken.has(i)) availableNums.push(i);
    }
    Object.entries(data).forEach(([n,info])=>{
      const btn=cards.get(Number(n));
      if (btn){ btn.classList.add('taken'); btn.disabled=true; if (info.pickerId===playerId) btn.classList.add('me'); }
    });
  });
}

/* ====== Ready / Unready ====== */
readyBtn.onclick=async ()=>{
  if (mySecret==null){ openSecret(); alert('Önce gizli sayını seç.'); return; }
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(true);
  readyBtn.style.display='none'; unreadyBtn.style.display='inline-block';
};
unreadyBtn.onclick=async ()=>{
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  readyBtn.style.display='inline-block'; unreadyBtn.style.display='none';
};

/* ====== Şifre 200 ====== */
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

/* ====== State & start logic ====== */
function subscribeState(){
  db.ref(`rooms/${roomId}/state`).on('value', snap=>{
    const st=snap.val()||{};
    started=!!st.started;

    // bitti
    if (st.finished){
      const name = st.loserName || '—';
      endBanner.textContent = `Kesene bereket cenabet, ${name}!`;
      endBanner.classList.add('show'); endBanner.style.display='block';
      stateTag.textContent='Bitti';
      setTimeout(()=>{ endBanner.classList.remove('show'); prepareNextRound(); }, 3000);
      for (let i=1;i<=31;i++){ const btn=cards.get(i); btn.disabled=true; btn.classList.add('disabled'); }
      countdownBubble.style.display='none';
      return;
    }

    // başlamadı: otomatik başlatmayı dener
    if (!st.started){
      stateTag.textContent='Bekleme'; turnTag.style.display='none'; countdownBubble.style.display='none';
      for (let i=1;i<=31;i++){ const btn=cards.get(i); btn.disabled=true; btn.classList.add('disabled'); }
      attemptStart();  // <<<< herkes hazırsın diye kontrol eder
      return;
    }

    // başladı
    stateTag.textContent='Başladı'; stateTag.classList.add('started');
    const order=st.turn?.order||[], idx=st.turn?.idx||0, currentId=order[idx], currentName=st.turn?.currentName||'—';
    myTurn=(currentId===playerId);
    turnTag.style.display='inline-block';
    turnTag.textContent=myTurn?'Sıra Sende':`Sıradaki: ${currentName}`;
    turnTag.classList.toggle('you',myTurn); turnTag.classList.toggle('turn',!myTurn);

    for (let i=1;i<=31;i++){
      const btn=cards.get(i);
      const taken = btn.classList.contains('taken');
      btn.disabled=!myTurn || taken; btn.classList.toggle('disabled',btn.disabled);
    }

    deadlineAt=Number(st.turn?.deadlineAt||0);
    if (deadlineAt){
      const remain=Math.max(0, deadlineAt - now());
      countdownBubble.style.display='inline-block';
      countdownBubble.textContent=String(Math.ceil(remain/1000));
    }else{
      countdownBubble.style.display='none';
    }
  });

  // canlı sayaç
  db.ref(`rooms/${roomId}/presence`).on('value', s=>{
    const v=s.val()||{}; aliveTag.textContent="Canlı: "+Object.keys(v).length;
  });

  // yerel sayaç güncelle
  setInterval(()=>{
    if (!started || !deadlineAt) return;
    const remain=deadlineAt - now(), sec=Math.ceil(Math.max(0,remain)/1000);
    countdownBubble.style.display='inline-block'; countdownBubble.textContent=String(sec);
    if (remain<=0 && myTurn) autoPick();
  }, 300);
}

/* Herkes hazır + gizli sayı varsa anında başlat */
async function attemptStart(){
  try{
    const [pS, sS, stS] = await Promise.all([
      db.ref(`rooms/${roomId}/players`).get(),
      db.ref(`rooms/${roomId}/secrets`).get(),
      db.ref(`rooms/${roomId}/state`).get()
    ]);
    const st=stS.val()||{}, players=pS.val()||{}, secrets=sS.val()||{};
    if (st.started || st.finished) return;

    const ids = Object.keys(players);
    if (ids.length < 2) return;
    const allReady = ids.every(id => players[id].ready===true);
    const allSecret= ids.every(id => !!secrets[id]);
    if (!(allReady && allSecret)) return;

    // Transaction ile başlat
    await db.ref(`rooms/${roomId}`).transaction(room=>{
      if (!room) room = {};
      room.players = room.players || {};
      room.secrets = room.secrets || {};
      room.state   = room.state   || {};

      if (room.state.started || room.state.finished) return room;

      const ordered = Object.entries(room.players)
        .filter(([_,p])=>p && p.alive!==false)
        .sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0))
        .map(([pid])=>pid);

      if (ordered.length < 2) return room;

      const firstId = ordered[0];
      room.state.started = true;
      room.state.finished = false;
      room.state.elimCount = room.state.elimCount || 0;
      room.state.turn = { order: ordered, idx: 0, currentName: room.players[firstId]?.name || '' };
      room.state.phase = null;
      return room;
    });

    // başlatıldıysa deadline yaz
    const s2=(await db.ref(`rooms/${roomId}/state`).get()).val()||{};
    if (s2.started && s2.turn && !s2.finished){
      const deadline = now() + (BASE_SEC + (s2.elimCount||0)*EXTRA_PER_ELIM)*1000;
      await db.ref(`rooms/${roomId}/state/turn/deadlineAt`).set(deadline);
    }
  }catch(e){ log("attemptStart: "+e.message); }
}

/* ====== Seçim ====== */
async function onPick(n){
  if (!myTurn || !started) return;
  let committed=false;
  await db.ref(`rooms/${roomId}`).transaction(room=>{
    if(!room||!room.state||!room.state.started||room.state.finished) return room;
    const turn=room.state.turn||{}; const order=turn.order||[]; const idx=turn.idx||0; const currentPid=order[idx];
    if(currentPid!==playerId) return room;

    if(!room.numbers) room.numbers={}; if(room.numbers[n]) return room;
    if(!room.players) room.players={}; const pickerName=room.players[playerId]?.name||'';
    room.numbers[n]={pickerId:playerId,pickerName,at:{".sv":"timestamp"}};

    const secrets=room.secrets||{};
    const victims=Object.keys(secrets).filter(pid=>Number(secrets[pid])===Number(n) && room.players[pid] && room.players[pid].alive!==false);
    victims.forEach(pid=>{ room.players[pid].alive=false; });
    room.state.elimCount=(room.state.elimCount||0)+victims.length;

    const fullOrder=order.filter(pid=>room.players[pid]);
    const aliveOrder=fullOrder.filter(pid=>room.players[pid].alive!==false);

    if (aliveOrder.length===1){
      const loserId=aliveOrder[0];
      room.state.started=false; room.state.finished=true;
      room.state.finishedAt={".sv":"timestamp"}; room.state.loserId=loserId; room.state.loserName=room.players[loserId]?.name||''; room.state.phase='finished';
      return room;
    }

    const currIdxAlive=aliveOrder.indexOf(currentPid); const nextPid=aliveOrder[(currIdxAlive+1)%aliveOrder.length];
    const newIdx=fullOrder.indexOf(nextPid); room.state.turn.idx=(newIdx>=0?newIdx:0);
    room.state.turn.currentName=room.players[nextPid]?.name||'';
    room.state.turn.deadlineAt={".sv":"timestamp"}; // sonra dışarıdan gerçek deadline set edeceğiz
    return room;
  }, (e,ok)=>{ committed=ok; });

  if (committed){
    const s2=(await db.ref(`rooms/${roomId}/state`).get()).val()||{};
    if (!s2.finished && s2.started){
      const deadline = now() + (BASE_SEC + (s2.elimCount||0)*EXTRA_PER_ELIM)*1000;
      await db.ref(`rooms/${roomId}/state/turn/deadlineAt`).set(deadline);
    }
  }
}

function autoPick(){
  const free=availableNums.slice(); if(!free.length) return;
  const n=free[Math.floor(Math.random()*free.length)];
  onPick(n);
}

/* ====== Yeni tur ====== */
async function prepareNextRound(){
  try{
    const stateRef=db.ref(`rooms/${roomId}/state`);
    let committed=false;
    await stateRef.transaction(st=>{ if(!st||!st.finished||st.nextRoundPrepared) return st; st.nextRoundPrepared=true; st.phase='choosing'; return st; },(e,ok)=>{committed=ok;});
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

    const pSnap=await db.ref(`rooms/${roomId}/players`).get();
    const players=pSnap.val()||{};
    Object.keys(players).forEach(pid=>{
      updates[`rooms/${roomId}/players/${pid}/alive`]=true;
      updates[`rooms/${roomId}/players/${pid}/ready`]=false;
    });

    await db.ref().update(updates);
    // gizli sayı seçim ekranı
    if (mySecret==null) openSecret();
    readyBtn.style.display='inline-block'; unreadyBtn.style.display='none';
    stateTag.textContent='Yeni Tur: Gizli sayı seçin';
  }catch(e){ log("prepareNextRound: "+e.message); }
}
