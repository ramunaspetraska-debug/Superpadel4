// „Firebase“ konfigūracija
const firebaseConfig = { 
    apiKey: "AIzaSyC_Z6srTcBfOWjG0aUKIoLD74ucozLUBHc", 
    authDomain: "padelio-turnyrai.firebaseapp.com", 
    databaseURL: "https://padelio-turnyrai-default-rtdb.europe-west1.firebasedatabase.app", 
    projectId: "padelio-turnyrai" 
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }

const GLOBAL_PLAYERS_KEY = "padelio_global_players";
const GLOBAL_TOURNAMENTS_KEY = "padelio_global_tournaments"; 
window.globalAdminPlayers = [];
window.tournaments = [];

// Tik pradinė duomenų gavimo logika
function initAdminData() {
    firebase.database().ref(GLOBAL_PLAYERS_KEY).on('value', snap => {
        let data = snap.val() || {};
        window.globalAdminPlayers = Object.keys(data).map(key => ({id: key, ...data[key]}));
    });
    firebase.database().ref(GLOBAL_TOURNAMENTS_KEY).on('value', snap => {
        let data = snap.val() || {};
        window.tournaments = Object.keys(data).map(key => ({id: key, ...data[key]}));
    });
}
initAdminData();
