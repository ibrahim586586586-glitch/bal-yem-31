/* ===== Firebase init (senin config'in) ===== */
const firebaseConfig = {
  apiKey: "AIzaSyCcRvIrK81msK5AAM3dPNLgvTo3rkpqkN4",
  authDomain: "balyem31.firebaseapp.com",
  databaseURL: "https://balyem31-default-rtdb.firebaseio.com",
  projectId: "balyem31",
  storageBucket: "balyem31.firebasestorage.app",
  messagingSenderId: "634786583277",
  appId: "1:634786583277:web:bd14359c010ed14fd572e4",
  measurementId: "G-5PND8NPMPM"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

/* ===== Helpers ===== */
const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);

const splash = $('#splash');
const home = $('#home');
const login = $('#login');
const game = $('#game');

const loginInfo = $('#loginRoomInfo');
const nameInput = $('#nameInput');
const joinBtn = $('#joinBtn');
const createRoomBtn = $('#createRoomBtn');
const goRoomBtn = $('#goRoomBtn');
const roomInput = $('#roomInput');

const roomTitle = $('#roomTitle');
const stateTag = $('#stateTag');
const turnTag = $('#turnTag');
const aliveTag = $('#aliveTag');
const playersEl = $('#players');
const gridEl = $('#grid');
const readyBtn = $('#readyBtn');
const unreadyBtn = $('#unreadyBtn');
const startBtn = $('#startBtn');
const cheatBtn = $('#cheatBtn');
const cheatBox = $('#cheatBox');
const leaveBtn = $('#leaveBtn');

const secretModal = $('#secretModal');
const secretGrid = $('#secretGrid');
const saveSecretBtn = $('#saveSecretBtn');
const flash = $('#flash');
const endBanner = $('#endBanner');

function show(el){ el.style.display='block' }
function hide(el){ el.style.display='none' }
function toast(text,ms=1600){ flash.querySelector('.msg').textContent=text; show(flash); setTimeout(()=>hide(flash),ms) }

let roomId = params.get('room') || '';
let playerId = "p_"+Math.random().toString(36).slice(2,10);
let isHost = false;
let mySecret = null;
let started = false;
let myTurn = false;
let orderCache = [];
const cards = new Map();

/* presence */
let myRef = null;

/* Splash 5 sn */
window.addEventListener('DOMContentLoaded', ()=>{
  setTimeout(()=>{
    hide(splash);
    if(roomId){ roomInput.value = roomId; showLogin(roomId); }
    else show(home);
  }, 1200); // hızlı açalım
});

/* ==== UI build ==== */
for(let i=1;i<=31;i++){
  const b=document.createElement('button');
  b.className='card disabled'; b.textContent=i; b.dataset.num=i; b.disabled=true;
  b.onclick=()=>onPick(i);
  gridEl.appendChild(b); cards.set(i,b);
}
let tempSecret=null;
for(let i=1;i<=31;i++){
  const b=document.createElement('button'); b.textContent=i;
  b.onclick=()=>{ tempSecret=i; [...secretGrid.children].forEach(x=>x.classList.remove('sel')); b.classList.add('sel'); saveSecretBtn.disabled=false; };
  secretGrid.appendChild(b);
}
saveSecretBtn.onclick=async ()=>{
  if(!tempSecret) return;
  mySecret = tempSecret;
  await db.ref(`rooms/${roomId}/secrets/${playerId}`).set(mySecret);
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  hide(secretModal); toast('Gizli sayı kaydedildi');
};

/* ==== Home → Login ==== */
createRoomBtn.onclick = async ()=>{
  // oda id üret (roomsMeta/counter)
  const metaRef = db.ref('roomsMeta/counter');
  const snap = await metaRef.transaction(x=> (x||0)+1);
  const n = snap.snapshot.val();
  roomId = `oda-${n}`;
  await db.ref(`rooms/${roomId}`).set({
    state: { phase:'lobby', hostId:null, started:false },
    createdAt: firebase.database.ServerValue.TIMESTAMP
  });
  roomInput.value = roomId;
  showLogin(roomId);
};
goRoomBtn.onclick = ()=>{
  const rid = (roomInput.value||'').trim();
  if(!rid){ alert('Oda kodu yaz'); return; }
  roomId = rid;
  showLogin(roomId);
};
function showLogin(rid){
  hide(home); show(login);
  loginInfo.textContent = `Oda: ${rid}`;
}

/* ==== Join ==== */
joinBtn.onclick = async ()=>{
  const name=(nameInput.value||'').trim();
  if(!name){ alert('Adını yaz'); return; }

  // oyuncu sayısı kontrol (max 10)
  const pSnap = await db.ref(`rooms/${roomId}/players`).get();
  const count = Object.keys(pSnap.val()||{}).length;
  if(count>=10){ alert('Oda dolu (10/10)'); return; }

  // host belirle
  const hostIdSnap = await db.ref(`rooms/${roomId}/state/hostId`).get();
  if(!hostIdSnap.exists()) isHost = true;

  myRef = db.ref(`rooms/${roomId}/players/${playerId}`);
  await myRef.set({ name, ready:false, alive:true, joinedAt: firebase.database.ServerValue.TIMESTAMP });
  myRef.onDisconnect().remove();

  if(isHost){
    await db.ref(`rooms/${roomId}/state/hostId`).set(playerId);
  }

  hide(login); show(game);
  roomTitle.textContent = `Oda: ${roomId}`;
  subscribe();
  show(secretModal); // gizli sayı seçtir
};

/* ==== Leave ==== */
leaveBtn.onclick = async ()=>{
  if(myRef) await myRef.remove();
  location.href = location.pathname; // ana ekrana
};

/* ==== Ready / Unready ==== */
readyBtn.onclick = async ()=>{
  if(mySecret==null){ show(secretModal); return; }
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(true);
  hide(readyBtn); show(unreadyBtn);
};
unreadyBtn.onclick = async ()=>{
  await db.ref(`rooms/${roomId}/players/${playerId}/ready`).set(false);
  show(readyBtn); hide(unreadyBtn);
};

/* ==== Start (only host) ==== */
startBtn.onclick = async ()=>{
  const pS = await db.ref(`rooms/${roomId}/players`).get();
  const sS = await db.ref(`rooms/${roomId}/secrets`).get();
  const players = pS.val()||{}, secrets = sS.val()||{};
  const ids = Object.keys(players);
  if(ids.length<2){ alert('En az 2 oyuncu gerekir'); return; }
  const allReady = ids.every(id => players[id].ready===true);
  const allSecret = ids.every(id => !!secrets[id]);
  if(!allReady){ alert('Herkes Hazır olmalı'); return; }
  if(!allSecret){ alert('Herkes gizli sayı seçmeli'); return; }

  // joinedAt sırasına göre order
  const ordered = Object.entries(players).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0)).map(([pid])=>pid);

  await db.ref(`rooms/${roomId}/state`).update({
    phase:'playing', started:true, finished:false,
    turn:{ order: ordered, idx:0, currentName: players[ordered[0]].name }
  });
  toast('Oyun başladı!');
};

/* ==== Numbers pick ==== */
async function onPick(n){
  if(!started || !myTurn) return;

  // Transaction: aynı sayı iki kez seçilemesin
  const roomRef = db.ref(`rooms/${roomId}`);
  let committed=false;
  await roomRef.transaction(room=>{
    if(!room || !room.state || room.state.phase!=='playing') return room;

    if(!room.numbers) room.numbers={};
    if(room.numbers[n]) return room; // zaten seçilmiş

    const turn=room.state.turn||{};
    const order=turn.order||[];
    const idx=turn.idx||0;
    const currentPid=order[idx];
    if(currentPid!==playerId) return room; // ben değilsem

    // sayıyı işle
    const pickerName = room.players[playerId]?.name || '';
    room.numbers[n] = { pickerId:playerId, pickerName, at:{".sv":"timestamp"} };

    // elenecekler (aynı gizli sayıyı seçmiş olanlar)
    const secs = room.secrets||{};
    Object.entries(secs).forEach(([pid,num])=>{
      if(Number(num)===Number(n) && room.players[pid] && room.players[pid].alive!==false){
        room.players[pid].alive=false;
      }
    });

    // canlılar
    const fullOrder = order.filter(pid=>room.players[pid]);
    const aliveOrder = fullOrder.filter(pid=>room.players[pid].alive!==false);

    // bitti mi?
    if(aliveOrder.length===1){
      const winnerId = aliveOrder[0];
      room.state.phase='finished';
      room.state.started=false;
      room.state.winnerId = winnerId;
      room.state.winnerName = room.players[winnerId]?.name || '';
      return room;
    }

    // sırayı devret
    const currIdxAlive = aliveOrder.indexOf(currentPid);
    const nextPid = aliveOrder[(currIdxAlive+1) % aliveOrder.length];
    const newIdx = fullOrder.indexOf(nextPid);
    room.state.turn.idx = (newIdx>=0?newIdx:0);
    room.state.turn.currentName = room.players[nextPid]?.name || '';
    return room;
  }, (e,ok)=>{ committed=ok; });

  if(!committed) return;
}

/* ==== Subscriptions ==== */
function subscribe(){
  // players
  db.ref(`rooms/${roomId}/players`).on('value', snap=>{
    const data = snap.val()||{};
    playersEl.innerHTML='';
    const list = Object.entries(data).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    let aliveCount=0;
    list.forEach(([pid,info],idx)=>{
      const chip=document.createElement('div');
      chip.className='chip'+(pid===playerId?' me':'')+(info.alive===false?' dead':'');
      const ord=document.createElement('span'); ord.className='order'; ord.textContent=idx+1;
      const dot=document.createElement('span'); dot.className='dot '+(info.ready?'ready':'wait');
      const txt=document.createElement('span'); txt.textContent=info.name||'Oyuncu';
      chip.appendChild(ord); chip.appendChild(dot); chip.appendChild(txt);
      playersEl.appendChild(chip);
      if(info.alive!==false) aliveCount++;
    });
    aliveTag.textContent = 'Canlı: '+aliveCount;
  });

  // numbers
  db.ref(`rooms/${roomId}/numbers`).on('value', snap=>{
    const data = snap.val()||{};
    for(let i=1;i<=31;i++){
      const b=cards.get(i);
      const taken = !!data[i];
      b.className = 'card'+(taken?' taken':'');
      if(taken && data[i].pickerId===playerId) b.classList.add('me');
      b.disabled = true; // default pasif; state dinlemesi aktif edebilir
    }
  });

  // secrets cheat view (şifre: 200)
  cheatBtn.onclick = async ()=>{
    const pass = prompt('Şifre?');
    if(pass!=='200'){ alert('Yanlış şifre'); return; }
    const [pS,sS] = await Promise.all([
      db.ref(`rooms/${roomId}/players`).get(),
      db.ref(`rooms/${roomId}/secrets`).get()
    ]);
    const players = pS.val()||{}, secrets = sS.val()||{};
    cheatBox.innerHTML = '<b>Gizli Sayılar:</b><br>';
    Object.entries(players).forEach(([pid,info])=>{
      const num = secrets[pid];
      if(num!=null) cheatBox.innerHTML += `${info.name}: ${num}<br>`;
    });
    cheatBox.style.display='block';
  };

  // state
  db.ref(`rooms/${roomId}/state`).on('value', snap=>{
    const st = snap.val()||{phase:'lobby', started:false};
    started = (st.phase==='playing');
    isHost = (st.hostId===playerId);
    startBtn.style.display = (!started && isHost && st.phase==='lobby') ? 'inline-block':'none';

    // turn info
    if(st.phase==='playing'){
      stateTag.textContent='Başladı';
      stateTag.classList.add('started');
      const order = st.turn?.order||[]; orderCache=order;
      const idx = st.turn?.idx||0; const currentId = order[idx];
      myTurn = (currentId===playerId);
      turnTag.style.display='inline-block';
      turnTag.textContent = myTurn ? 'Sıra Sende' : `Sıradaki: ${st.turn?.currentName||'-'}`;
      turnTag.classList.toggle('you', myTurn);
      turnTag.classList.toggle('turn', !myTurn);

      // kartları aktive et
      for(let i=1;i<=31;i++){
        const b=cards.get(i);
        const taken = b.classList.contains('taken');
        b.disabled = (!myTurn || taken);
        b.classList.toggle('disabled', b.disabled);
      }
    } else if(st.phase==='lobby'){
      stateTag.textContent='Bekleme';
      turnTag.style.display='none';
      // kartlar pasif
      for(let i=1;i<=31;i++){ const b=cards.get(i); b.disabled=true; b.classList.add('disabled'); }
      show(readyBtn); hide(unreadyBtn);
    } else if(st.phase==='finished'){
      const name = st.winnerName || '—';
      endBanner.textContent = `Oyun bitti! Kazanan: ${name}`;
      endBanner.style.display='block';
      turnTag.style.display='none';
      // host temizlik
      if(isHost){
        setTimeout(async ()=>{
          await db.ref(`rooms/${roomId}`).remove();
          location.href = location.pathname; // ana ekran
        }, 2500);
      }
    }
  });
}

/* ==== Tiny UX ==== */
function show(el){ el.style.display='block' }
function hide(el){ el.style.display='none' }
