// ===== Firebase Config (balyem31) =====
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

/* ---------- Kısa yardımcılar ---------- */
const $ = s => document.querySelector(s);
const roomList = $("#roomList");
const lobby = $("#lobby"), roomSec = $("#room");
const nameInput = $("#nameInput");
const openRoomBtn = $("#openRoomBtn");
const roomTitle = $("#roomTitle");
const playersEl = $("#players");
const stateTag = $("#stateTag");
const turnTag = $("#turnTag");
const aliveTag = $("#aliveTag");
const gridEl = $("#grid");
const secretSelect = $("#secretSelect");
const saveSecretBtn = $("#saveSecretBtn");
const mySecretInfo = $("#mySecretInfo");
const readyBtn = $("#readyBtn");
const unreadyBtn = $("#unreadyBtn");
const startBtn = $("#startBtn");
const leaveBtn = $("#leaveBtn");

/* ---------- Splash → Lobby ---------- */
window.addEventListener("DOMContentLoaded",()=>{
  setTimeout(()=>{$("#splash").classList.add("hidden"); lobby.classList.remove("hidden");},1200);
  // Secret dropdown 1..31
  for(let i=1;i<=31;i++){ const o=document.createElement("option"); o.value=i; o.textContent=i; secretSelect.appendChild(o); }
  // Sayı grid
  for(let i=1;i<=31;i++){
    const b=document.createElement("button");
    b.className="num disabled"; b.textContent=i; b.dataset.n=i;
    b.onclick=()=>tryPick(i);
    gridEl.appendChild(b);
  }
  watchOpenRooms();
});

/* ---------- Global durum ---------- */
let myId = "p_"+Math.random().toString(36).slice(2,10);
let myName = null;
let roomId = null;     // oda-1 …
let isHost = false;
let mySecret = null;
let started = false;

/* ---------- Odalar listesi ---------- */
function watchOpenRooms(){
  db.ref("rooms").orderByChild("open").equalTo(true).on("value",snap=>{
    roomList.innerHTML="";
    const rooms=snap.val()||{};
    const entries=Object.entries(rooms).sort((a,b)=> (b[1].createdAt||0)-(a[1].createdAt||0));
    if(!entries.length){
      const p=document.createElement("div"); p.className="muted"; p.textContent="Açık oda yok. ‘Oda Aç’a bas."; roomList.appendChild(p);
      return;
    }
    entries.forEach(([rid,r])=>{
      const box=document.createElement("div"); box.className="pill";
      box.innerHTML=`<b>${rid}</b> • kişi: ${Object.keys(r.players||{}).length} • durum: ${r.state?.phase||"lobi"}`;
      const btn=document.createElement("button"); btn.textContent="Katıl"; btn.className="primary"; btn.style.marginLeft="8px";
      btn.onclick=()=>joinRoom(rid);
      box.appendChild(btn); roomList.appendChild(box);
    });
  });
}

/* ---------- Oda Aç ---------- */
openRoomBtn.onclick = async ()=>{
  myName = (nameInput.value||"").trim();
  if(!myName){ alert("Önce ad yaz."); return; }

  // Sıralı oda adı için counter
  const metaRef = db.ref("roomsMeta/nextId");
  let newNo = 1;
  await metaRef.transaction(x => (x||0)+1, (_e,ok,snap)=>{ if(ok) newNo=snap.val() });
  const rid = "oda-"+newNo;

  // Odayı oluştur
  const roomRef = db.ref("rooms/"+rid);
  await roomRef.set({
    open:true,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    ownerId: myId,
    state: { phase:"lobi", started:false, currentId:null, finished:false }
  });

  // Odaya katıl
  await joinRoom(rid, /*asHost*/true);
};

/* ---------- Odaya Katıl ---------- */
async function joinRoom(rid, asHost=false){
  myName = myName || (nameInput.value||"").trim();
  if(!myName){ alert("Adını yaz!"); return; }

  roomId = rid; isHost = !!asHost;
  const pRef = db.ref(`rooms/${roomId}/players/${myId}`);
  await pRef.set({ name: myName, ready:false, alive:true, joinedAt: firebase.database.ServerValue.TIMESTAMP });
  pRef.onDisconnect().remove();

  lobby.classList.add("hidden");
  roomSec.classList.remove("hidden");
  roomTitle.textContent = "Oda: "+roomId;

  watchRoom();
  watchPlayers();
  watchNumbers();

  // lobi aşamasında kendi gizli sayını seç ve kaydet
  mySecret = null; mySecretInfo.classList.add("hidden");
  startBtn.classList.add("hidden");
  stateTag.textContent = "Bekleme";
}

/* ---------- Oyuncular ---------- */
function watchPlayers(){
  db.ref(`rooms/${roomId}/players`).on("value",snap=>{
    playersEl.innerHTML="";
    const players=snap.val()||{};
    const list=Object.entries(players).sort((a,b)=>(a[1].joinedAt||0)-(b[1].joinedAt||0));
    let alive=0, firstId = list[0]?.[0];
    list.forEach(([pid,info],i)=>{
      const chip=document.createElement("div");
      chip.className="chip"+(pid===myId?" me":"")+(info.alive===false?" dead":"");
      const dot=document.createElement("span"); dot.className="dot"+(info.ready?" ready":"");
      const ord=document.createElement("span"); ord.className="pill"; ord.textContent=(i+1);
      const nm=document.createElement("span"); nm.textContent=info.name;
      chip.appendChild(ord); chip.appendChild(dot); chip.appendChild(nm);
      playersEl.appendChild(chip);
      if(info.alive!==false) alive++;
    });
    aliveTag.textContent = "Canlı: "+alive;

    // İlk girense start butonu onun
    isHost = (firstId===myId);
    if(!started){
      if(isHost) startBtn.classList.remove("hidden"); else startBtn.classList.add("hidden");
    }
  });
}

/* ---------- Oda durumu ---------- */
function watchRoom(){
  db.ref(`rooms/${roomId}/state`).on("value",snap=>{
    const st=snap.val()||{};
    started = !!st.started;
    const phase = st.phase || (st.started?"oyun":"lobi");
    stateTag.textContent = phase==="lobi"?"Bekleme":phase==="oyun"?"Oyun Başladı":phase==="bitti"?"Bitti":phase;

    // sıra etiketi
    if(st.currentId){
      turnTag.textContent = (st.currentId===myId) ? "Sıra Sende" : `Sıradaki: ${st.currentName||"—"}`;
      turnTag.classList.add("tag"); turnTag.classList.add("turn");
    } else {
      turnTag.textContent = "—";
      turnTag.className="pill";
    }

    // Lobi: hazır/başlat görünürlük
    if(!st.started && !st.finished){
      readyBtn.classList.remove("hidden");
      unreadyBtn.classList.add("hidden");
      // herkes hazır mı?
      Promise.all([
        db.ref(`rooms/${roomId}/players`).get(),
        db.ref(`rooms/${roomId}/secrets`).get()
      ]).then(([pS,sS])=>{
        const players=pS.val()||{}, secrets=sS.val()||{};
        const ids=Object.keys(players);
        const allReady = ids.length>=2 && ids.every(id => players[id].ready===true) && ids.every(id => !!secrets[id]);
        if(isHost) startBtn.classList.toggle("hidden", !allReady);
      });
    }

    // Bitti ise oyuncuyu lobiye at
    if(st.finished){
      alert(`Oyun bitti! Kazanan: ${st.winnerName||"—"}`);
      // kendini odadan sil, lobiye dön
      db.ref(`rooms/${roomId}/players/${myId}`).remove().finally(()=>{
        roomId = null; roomSec.classList.add("hidden"); lobby.classList.remove("hidden");
      });
    }
  });
}

/* ---------- Sayılar ---------- */
let taken = new Set();
function watchNumbers(){
  db.ref(`rooms/${roomId}/numbers`).on("value",snap=>{
    const data=snap.val()||{};
    taken = new Set(Object.keys(data).map(n=>+n));
    for(let i=1;i<=31;i++){
      const b=gridEl.querySelector(`[data-n="${i}"]`);
      b.classList.remove("taken","me","disabled");
      if(taken.has(i)){ b.classList.add("taken"); b.classList.add("disabled"); if(data[i].pickerId===myId) b.classList.add("me"); }
      if(!started) b.classList.add("disabled");
    }
  });
}

/* ---------- Gizli sayı kaydet ---------- */
saveSecretBtn.onclick = async ()=>{
  if(!roomId) return;
  mySecret = +secretSelect.value;
  await db.ref(`rooms/${roomId}/secrets/${myId}`).set(mySecret);
  mySecretInfo.textContent = `Gizlin: ${mySecret}`; mySecretInfo.classList.remove("hidden");
  alert("Gizli sayı kaydedildi. 'Hazırım' deyip bekle.");
};

/* ---------- Hazır / değil ---------- */
readyBtn.onclick = async ()=>{
  if(mySecret==null){ alert("Önce gizli sayını seç!"); return; }
  await db.ref(`rooms/${roomId}/players/${myId}/ready`).set(true);
  readyBtn.classList.add("hidden"); unreadyBtn.classList.remove("hidden");
};
unreadyBtn.onclick = async ()=>{
  await db.ref(`rooms/${roomId}/players/${myId}/ready`).set(false);
  unreadyBtn.classList.add("hidden"); readyBtn.classList.remove("hidden");
};

/* ---------- Başlat (yalnızca ilk giren) ---------- */
startBtn.onclick = async ()=>{
  if(!isHost){ return; }
  // herkes hazır mı tekrar kontrol
  const [pS,sS] = await Promise.all([
    db.ref(`rooms/${roomId}/players`).get(),
    db.ref(`rooms/${roomId}/secrets`).get()
  ]);
  const players = pS.val()||{}, secrets=sS.val()||{};
  const ids = Object.keys(players);
  if(!(ids.length>=2 && ids.every(id=>players[id].ready===true) && ids.every(id=>!!secrets[id]))){
    alert("Herkes hazır/gizli sayı seçmiş olmalı (en az 2 kişi)."); return;
  }

  // sıra: ilk girenden başlar
  const order = ids.sort((a,b)=>(players[a].joinedAt||0)-(players[b].joinedAt||0));
  const firstId = order[0];

  await db.ref(`rooms/${roomId}/state`).set({
    phase:"oyun", started:true, finished:false,
    currentId:firstId, currentName: players[firstId]?.name || "",
  });
};

/* ---------- Seçim (sadece sıradaki kişi) ---------- */
async function tryPick(n){
  if(!roomId || !started) return;

  let committed=false, winnerName=null;
  await db.ref(`rooms/${roomId}`).transaction(room=>{
    if(!room || !room.state || !room.state.started || room.state.finished) return room;
    const st=room.state, players=room.players||{};
    const current=st.currentId;
    if(current!==myId) return room;             // sadece sırası gelen

    // sayı boşta mı?
    room.numbers = room.numbers || {};
    if(room.numbers[n]) return room;

    // sayıyı al
    room.numbers[n] = { pickerId: myId, pickerName: players[myId]?.name||"", at:{".sv":"timestamp"} };

    // aynı sayıyı seçmiş olan herkes elensin
    const secrets = room.secrets || {};
    Object.keys(players).forEach(pid=>{
      if(players[pid] && players[pid].alive!==false && +secrets[pid]===+n){
        players[pid].alive = false;
      }
    });

    // yaşayanlar
    const aliveIds = Object.keys(players).filter(pid => players[pid].alive!==false);

    if(aliveIds.length===1){
      st.started=false; st.finished=true; st.phase="bitti";
      st.currentId=null; st.currentName="";
      st.winnerId = aliveIds[0]; st.winnerName = players[aliveIds[0]]?.name || "";
      room.state = st; return room;
    }

    // sırayı yaşayanlar arasında sıradakine ver
    const order = Object.keys(players).sort((a,b)=>(players[a].joinedAt||0)-(players[b].joinedAt||0))
                      .filter(pid => players[pid].alive!==false);
    const idx = order.indexOf(current);
    const nextId = order[(idx+1)%order.length];
    st.currentId = nextId; st.currentName = players[nextId]?.name||"";
    room.state = st;
    return room;
  },(_e,ok,_snap)=>{ committed=ok; });

  if(!committed){ return; }
}

/* ---------- Odadan çık ---------- */
leaveBtn.onclick = async ()=>{
  if(!roomId) return;
  await db.ref(`rooms/${roomId}/players/${myId}`).remove();
  roomId=null; roomSec.classList.add("hidden"); lobby.classList.remove("hidden");
};
