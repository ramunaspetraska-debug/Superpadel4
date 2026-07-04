const APP_VERSION = 'v197';
const DB_KEY = "padelio_pro_master"; 
const REG_KEY = "padelio_pro_master_rooms"; 

const ds = { matchDuration: 12, maxPoints: 21, winCondition: 'time', format: 'americano', baseFormat: 'americano', category: 'Atviras', rankingMode: 'points' };

let players = [];
let matches = [];
let savedTournaments = [];
let settings = {...ds};
let currentTid = null;
let curPh = null;
let tempGender = 'M';
let timeLeft = 0;
let timerInterval;
let alarmInterval;
let alarmTimeout;
let isRunning = false;
let endTime = 0;
let dbRef = null;
let isCloud = false;
let statType = 'indiv';
let adminClickCount = 0;
let adminTimer = null;
let preGeneratedTournament = [];
let editingPlayerId = null;
let tempEditGender = 'M';
let tempEditPhoto = null;
let qrCodeInstance = null;
let photoBank = {}; 
let nameUpdateTimer = null;
let dbPhotosRef = null;

let isMuted = localStorage.getItem('sp_is_muted') === 'true';
let activeRoom = (localStorage.getItem('sp_active_room_master') || '').toUpperCase();
if(activeRoom) isCloud = true;
