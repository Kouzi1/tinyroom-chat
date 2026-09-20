import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import {
  getDatabase, ref, get, set, update, push, onValue, remove,
  query, orderByChild, limitToLast
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

const ROOM_MIN = 8;
const ROOM_MAX = 64;
const NICK_MAX = 24;
const MESSAGE_MAX = 500;
const ROOM_DURATION_MS = 60 * 60 * 1000;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const els = {
  homeView: document.getElementById("homeView"), joinView: document.getElementById("joinView"), chatView: document.getElementById("chatView"),
  createBtn: document.getElementById("createBtn"), roomInput: document.getElementById("roomInput"), joinBtn: document.getElementById("joinBtn"), homeStatus: document.getElementById("homeStatus"),
  joinRoomCode: document.getElementById("joinRoomCode"), nicknameInput: document.getElementById("nicknameInput"), confirmJoinBtn: document.getElementById("confirmJoinBtn"), cancelJoinBtn: document.getElementById("cancelJoinBtn"), joinStatus: document.getElementById("joinStatus"),
  chatRoomCode: document.getElementById("chatRoomCode"), copyBtn: document.getElementById("copyBtn"), deleteBtn: document.getElementById("deleteBtn"), roomState: document.getElementById("roomState"), countdown: document.getElementById("countdown"), messages: document.getElementById("messages"),
  messageForm: document.getElementById("messageForm"), messageInput: document.getElementById("messageInput"), charCount: document.getElementById("charCount"), sendBtn: document.getElementById("sendBtn"), chatStatus: document.getElementById("chatStatus"), leaveBtn: document.getElementById("leaveBtn")
};

let currentUser = null;
let currentRoomId = null;
let currentRoomInfo = null;
let messagesUnsubscribe = null;
let infoUnsubscribe = null;
let countdownTimer = null;
let lastSendAt = 0;
let isSending = false;
let cleanupInProgress = false;

function setStatus(el, text, type="normal") {
  el.textContent = text || "";
  el.dataset.type = type;
  el.style.color = type === "error" ? "#fca5a5" : type === "success" ? "#86efac" : "#fbbf24";
}
function showView(view) {
  [els.homeView, els.joinView, els.chatView].forEach(e => e.classList.toggle("hidden", e !== view));
}
function normalizeRoomId(v) { return String(v||"").trim().replace(/[^A-Za-z0-9_-]/g,"").slice(0,ROOM_MAX); }
function normalizeNickname(v) { return String(v||"").trim().replace(/\s+/g," ").slice(0,NICK_MAX); }
function generateRoomId(length=32) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join("");
}
function inviteUrl(roomId) {
  const url = new URL(location.href);
  url.hash = `join/${encodeURIComponent(roomId)}`;
  return url.toString();
}
function parseHash() {
  const raw = location.hash.replace(/^#/,"");
  const m = raw.match(/^join\/([^/]+)$/i);
  return m ? normalizeRoomId(decodeURIComponent(m[1])) : null;
}
function infoRef(roomId) { return ref(db, `rooms/${roomId}/info`); }
function roomRef(roomId) { return ref(db, `rooms/${roomId}`); }
function messagesRef(roomId) { return ref(db, `rooms/${roomId}/messages`); }
function isPlaceholderConfig() { return Object.values(firebaseConfig).some(v => String(v).includes("PASTE_")); }

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Permission denied. Check your Firebase Database Rules.";
  if (code.includes("auth/operation-not-allowed")) return "Anonymous Authentication is not enabled.";
  if (code.includes("auth/network-request-failed")) return "Network error. Check your internet connection.";
  return error?.message || "Something went wrong.";
}

async function ensureAuth() {
  if (isPlaceholderConfig()) throw new Error("Add your Firebase configuration first.");
  if (currentUser) return currentUser;
  return await new Promise((resolve,reject) => {
    let settled = false;
    const stop = onAuthStateChanged(auth,user => {
      if (user && !settled) {
        settled = true; stop(); currentUser = user; resolve(user);
      }
    });
    signInAnonymously(auth).catch(err => {
      if (!settled) { settled = true; stop(); reject(err); }
    });
  });
}

function validateRoomId(roomId) {
  if (!roomId || roomId.length < ROOM_MIN || roomId.length > ROOM_MAX) throw new Error("Invalid room code.");
  return roomId;
}
function validateNickname() {
  const n = normalizeNickname(els.nicknameInput.value);
  if (n.length < 1 || n.length > NICK_MAX) throw new Error(`Nickname must be 1-${NICK_MAX} characters.`);
  return n;
}

async function createRoom() {
  setStatus(els.homeStatus,"Creating room…"); els.createBtn.disabled = true;
  try {
    const user = await ensureAuth();
    const roomId = generateRoomId();
    const now = Date.now();
    await set(infoRef(roomId), {
      ownerUid: user.uid, ownerName: "Host", guestUid: null, guestName: null,
      createdAt: now, expiresAt: now + ROOM_DURATION_MS, version: 1
    });
    location.hash = `join/${encodeURIComponent(roomId)}`;
    openJoinView(roomId, true);
  } catch (e) { setStatus(els.homeStatus,friendlyError(e),"error"); }
  finally { els.createBtn.disabled = false; }
}

async function openJoinView(roomId, fromCreate=false) {
  try { roomId = validateRoomId(roomId); }
  catch(e) { setStatus(els.homeStatus,friendlyError(e),"error"); return; }
  els.joinRoomCode.textContent = roomId;
  els.nicknameInput.value = localStorage.getItem("tinyroom_nickname") || (fromCreate ? "Host" : "");
  setStatus(els.joinStatus, fromCreate ? "Room created. Send the invite link to the other person." : "");
  showView(els.joinView);
  try {
    await ensureAuth();
    const s = await get(infoRef(roomId));
    if (!s.exists()) { setStatus(els.joinStatus,"This room does not exist.","error"); return; }
    const info = s.val();
    if (Date.now() >= Number(info.expiresAt)) {
      setStatus(els.joinStatus,"This room has expired.","error"); 
      if (info.ownerUid === currentUser.uid || info.guestUid === currentUser.uid) {
        await remove(roomRef(roomId)).catch(()=>{});
      }
      return;
    }
    if (info.ownerUid !== currentUser.uid && info.guestUid) setStatus(els.joinStatus,"This room is already full.","error");
  } catch(e) { setStatus(els.joinStatus,friendlyError(e),"error"); }
}

async function joinRoom() {
  const roomId = normalizeRoomId(els.joinRoomCode.textContent);
  let nickname;
  try { nickname = validateNickname(); validateRoomId(roomId); }
  catch(e) { setStatus(els.joinStatus,friendlyError(e),"error"); return; }
  els.confirmJoinBtn.disabled = true; setStatus(els.joinStatus,"Joining…");
  try {
    const user = await ensureAuth();
    const s = await get(infoRef(roomId));
    if (!s.exists()) throw new Error("This room does not exist.");
    const info = s.val();
    if (Date.now() >= Number(info.expiresAt)) throw new Error("This room has expired.");

    if (info.ownerUid === user.uid) {
      await update(infoRef(roomId),{ownerName:nickname});
    } else if (info.guestUid === user.uid) {
      await update(infoRef(roomId),{guestName:nickname});
    } else {
      if (info.guestUid) throw new Error("This room is already full.");
      await update(infoRef(roomId),{guestUid:user.uid,guestName:nickname});
    }

    localStorage.setItem("tinyroom_nickname",nickname);
    await openChat(roomId);
  } catch(e) { setStatus(els.joinStatus,friendlyError(e),"error"); }
  finally { els.confirmJoinBtn.disabled = false; }
}

async function openChat(roomId) {
  cleanupSubscriptions();
  currentRoomId = roomId; els.chatRoomCode.textContent = roomId;
  els.messages.innerHTML = '<div class="empty">No messages yet. Say hello 👋</div>';
  showView(els.chatView);
  const s = await get(infoRef(roomId));
  if (!s.exists()) { setStatus(els.chatStatus,"Room not found.","error"); return; }
  currentRoomInfo = s.val();
  if (Date.now() >= Number(currentRoomInfo.expiresAt)) { await expireRoom(); return; }
  subscribeToRoom(roomId); startCountdown(); els.messageInput.focus();
}

function subscribeToRoom(roomId) {
  infoUnsubscribe = onValue(infoRef(roomId), async snap => {
    if (!snap.exists()) {
      els.roomState.textContent = "Room no longer exists."; els.countdown.textContent = "00:00"; stopCountdown();
      setStatus(els.chatStatus,"Room deleted.","error"); return;
    }
    currentRoomInfo = snap.val();
    const isParticipant = currentRoomInfo.ownerUid === currentUser.uid || currentRoomInfo.guestUid === currentUser.uid;
    if (!isParticipant) { setStatus(els.chatStatus,"You are not a participant in this room.","error"); return; }
    const participantCount = Number(Boolean(currentRoomInfo.ownerUid)) + Number(Boolean(currentRoomInfo.guestUid));
    els.roomState.textContent = participantCount >= 2 ? "Connected with the other person" : "Waiting for another person…";
    if (Date.now() >= Number(currentRoomInfo.expiresAt)) await expireRoom();
  });

  const q = query(messagesRef(roomId),orderByChild("createdAt"),limitToLast(50));
  messagesUnsubscribe = onValue(q,snap => {
    const raw = snap.val() || {};
    const messages = Object.entries(raw).map(([id,v])=>({id,...v})).sort((a,b)=>Number(a.createdAt||0)-Number(b.createdAt||0));
    renderMessages(messages);
  },e=>setStatus(els.chatStatus,friendlyError(e),"error"));
}

function renderMessages(messages) {
  if (!messages.length) { els.messages.innerHTML = '<div class="empty">No messages yet. Say hello 👋</div>'; return; }
  const f = document.createDocumentFragment();
  for (const m of messages) {
    const article=document.createElement("article"); article.className=`message${m.uid===currentUser.uid?" mine":""}`;
    const n=document.createElement("div"); n.className="message-name"; n.textContent=m.name||"Guest";
    const t=document.createElement("div"); t.className="message-text"; t.textContent=m.text||"";
    const tm=document.createElement("div"); tm.className="message-time"; tm.textContent=formatTime(m.createdAt);
    article.append(n,t,tm); f.appendChild(article);
  }
  els.messages.replaceChildren(f); els.messages.scrollTop=els.messages.scrollHeight;
}

function formatTime(ts) { return new Date(Number(ts||Date.now())).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}); }

async function sendMessage() {
  if (isSending || !currentRoomId || !currentUser) return;
  const now=Date.now();
  if (now-lastSendAt<700) { setStatus(els.chatStatus,"Slow down a little."); return; }
  const text=els.messageInput.value.trim();
  if (!text) return;
  if (text.length>MESSAGE_MAX) { setStatus(els.chatStatus,`Message limit is ${MESSAGE_MAX} characters.`,"error"); return; }
  if (!currentRoomInfo || now>=Number(currentRoomInfo.expiresAt)) { await expireRoom(); return; }

  isSending=true; els.sendBtn.disabled=true;
  try {
    const isOwner=currentRoomInfo.ownerUid===currentUser.uid;
    const name=isOwner?(currentRoomInfo.ownerName||"Host"):(currentRoomInfo.guestName||"Guest");
    await set(push(messagesRef(currentRoomId)),{uid:currentUser.uid,name,text,createdAt:now});
    els.messageInput.value=""; updateCharCount(); lastSendAt=now; setStatus(els.chatStatus,"");
  } catch(e) { setStatus(els.chatStatus,friendlyError(e),"error"); }
  finally { isSending=false; els.sendBtn.disabled=false; els.messageInput.focus(); }
}

async function expireRoom() {
  if (cleanupInProgress) return; cleanupInProgress=true; stopCountdown();
  try { if (currentRoomId && currentUser) await remove(roomRef(currentRoomId)); } catch(e) { console.warn("cleanup failed",e); }
  setStatus(els.chatStatus,"Room expired and is no longer available.","error");
  els.roomState.textContent="Expired"; els.countdown.textContent="00:00";
  setTimeout(()=>{ currentRoomId=null; currentRoomInfo=null; cleanupSubscriptions(); location.hash=""; showView(els.homeView); cleanupInProgress=false; },900);
}

function startCountdown() {
  stopCountdown();
  countdownTimer=setInterval(()=>{
    if (!currentRoomInfo) return;
    const remaining=Number(currentRoomInfo.expiresAt)-Date.now();
    if (remaining<=0) { expireRoom(); return; }
    els.countdown.textContent=formatDuration(remaining);
  },1000);
  const remaining=Number(currentRoomInfo.expiresAt)-Date.now();
  els.countdown.textContent=formatDuration(Math.max(0,remaining));
}
function stopCountdown() { if(countdownTimer){clearInterval(countdownTimer);countdownTimer=null;} }
function formatDuration(ms) {
  const s=Math.max(0,Math.floor(ms/1000)); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h?`${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
async function copyInvite() {
  if(!currentRoomId) return;
  try { await navigator.clipboard.writeText(inviteUrl(currentRoomId)); setStatus(els.chatStatus,"Invite link copied.","success"); }
  catch { prompt("Copy this invite link:",inviteUrl(currentRoomId)); }
}
async function deleteRoom() {
  if(!currentRoomId) return;
  if(!confirm("Delete this room and its stored messages now?")) return;
  try { await remove(roomRef(currentRoomId)); currentRoomId=null; currentRoomInfo=null; cleanupSubscriptions(); location.hash=""; showView(els.homeView); }
  catch(e){setStatus(els.chatStatus,friendlyError(e),"error");}
}
function cleanupSubscriptions() {
  if(messagesUnsubscribe)messagesUnsubscribe();
  if(infoUnsubscribe)infoUnsubscribe();
  messagesUnsubscribe=null; infoUnsubscribe=null; stopCountdown();
}
function updateCharCount(){els.charCount.textContent=`${els.messageInput.value.length}/${MESSAGE_MAX}`;}

els.createBtn.addEventListener("click",createRoom);
els.joinBtn.addEventListener("click",()=>{const id=normalizeRoomId(els.roomInput.value);if(!id){setStatus(els.homeStatus,"Enter a room code or use an invite link.","error");return;}location.hash=`join/${encodeURIComponent(id)}`;openJoinView(id);});
els.roomInput.addEventListener("keydown",e=>{if(e.key==="Enter")els.joinBtn.click();});
els.confirmJoinBtn.addEventListener("click",joinRoom);
els.cancelJoinBtn.addEventListener("click",()=>{location.hash="";showView(els.homeView);});
els.copyBtn.addEventListener("click",copyInvite);
els.deleteBtn.addEventListener("click",deleteRoom);
els.leaveBtn.addEventListener("click",()=>{cleanupSubscriptions();currentRoomId=null;currentRoomInfo=null;location.hash="";showView(els.homeView);});
els.messageForm.addEventListener("submit",e=>{e.preventDefault();sendMessage();});
els.messageInput.addEventListener("input",updateCharCount);
document.querySelectorAll(".emoji").forEach(btn=>btn.addEventListener("click",()=>{
  const emoji=btn.textContent,start=els.messageInput.selectionStart??els.messageInput.value.length,end=els.messageInput.selectionEnd??els.messageInput.value.length,current=els.messageInput.value;
  els.messageInput.value=(current.slice(0,start)+emoji+current.slice(end)).slice(0,MESSAGE_MAX);
  const pos=Math.min(start+emoji.length,MESSAGE_MAX);els.messageInput.focus();els.messageInput.setSelectionRange(pos,pos);updateCharCount();
}));
addEventListener("hashchange",()=>{const id=parseHash();if(id)openJoinView(id);else{cleanupSubscriptions();showView(els.homeView);}});
(async()=>{updateCharCount();if(isPlaceholderConfig()){setStatus(els.homeStatus,"Setup needed: add your Firebase configuration in public/firebase-config.js.","error");return;}const id=parseHash();if(id)await openJoinView(id);else showView(els.homeView);})();
